# -*- coding: utf-8 -*-
"""无窗口冒烟测试（v1.0）。

运行方式（在 cyber_defense_game 目录下）：
    py -3.10 tests/test_smoke.py
测试使用 SDL dummy 驱动，不会弹出窗口，也不会访问网络。
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pygame  # noqa: E402

import settings  # noqa: E402
from game import Game, GameState  # noqa: E402
from models.security_event import SecurityEvent  # noqa: E402
from systems.score_system import ScoreSystem  # noqa: E402
from ui import draw_utils  # noqa: E402

SCREEN: pygame.Surface | None = None


def setUpModule() -> None:
    global SCREEN
    pygame.init()
    draw_utils.set_font_path(settings.find_chinese_font())
    SCREEN = pygame.display.set_mode(settings.SCREEN_SIZE)


def tearDownModule() -> None:
    pygame.quit()


class GameFlowTest(unittest.TestCase):
    def setUp(self) -> None:
        assert SCREEN is not None
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.save_path = root / "savegame.json"
        self.history_path = root / "history.json"
        self.game = Game(
            SCREEN,
            seed=2024,
            save_path=self.save_path,
            history_path=self.history_path,
        )
        self.game.new_game()

    def tearDown(self) -> None:
        self.temp.cleanup()

    # ------------------------------------------------------------------
    def _option(self, action_id: str):
        options = self.game.actions.options_for(self.game, self.game.current_target())
        return next(option for option in options if option.action_id == action_id)

    def _investigate(self, alert) -> None:
        self.game.select_alert(alert)
        option = self._option("investigate")
        self.assertTrue(option.enabled, option.reason)
        self.game.perform_action(option, self.game.current_target())

    def _real_alert(self):
        return next(alert for alert in self.game.events.alerts if not alert.false_positive)

    # ------------------------------------------------------------------
    # 基础数据
    # ------------------------------------------------------------------
    def test_initial_state(self) -> None:
        game = self.game
        self.assertEqual(game.state, GameState.PLAYING)
        self.assertEqual(game.turn, 1)
        self.assertEqual(game.player.action_points, settings.ACTION_POINTS_PER_TURN)
        self.assertEqual(game.player.security, settings.INITIAL_SECURITY)
        self.assertEqual(len(game.devices), 8)
        self.assertEqual(len(game.events.events), 1)
        self.assertGreaterEqual(len(game.events.alerts), 1)
        self.assertEqual(
            game.player.funds,
            settings.INITIAL_FUNDS + settings.TURN_INCOME - settings.TURN_UPKEEP,
        )

    def test_all_data_files_load(self) -> None:
        tree = self.game.upgrade_tree
        self.assertEqual(len(self.game.upgrade_catalog), 7)
        self.assertEqual(len(tree.tracks), 3)
        self.assertEqual(len(self.game.decisions), 2)
        configs = self.game.events.event_configs
        self.assertEqual(len(configs), 6)
        self.assertTrue(all(config.get("enabled") for config in configs))
        for device in self.game.devices.values():
            for neighbor in device.neighbors:
                self.assertIn(neighbor, self.game.devices)

    def test_random_schedule_is_valid(self) -> None:
        schedule = self.game.events.spawn_schedule
        self.assertEqual(schedule["EVT-PHISH-01"], 1)
        self.assertEqual(schedule["EVT-ZERODAY-06"], 8)
        flexible = [turn for event_id, turn in schedule.items() if event_id not in ("EVT-PHISH-01", "EVT-ZERODAY-06")]
        self.assertEqual(len(flexible), 4)
        self.assertEqual(len(set(flexible)), 4)
        self.assertTrue(all(3 <= turn <= 7 for turn in flexible))
        # 同一种子必须复现同一排期
        assert SCREEN is not None
        other = Game(SCREEN, seed=2024, save_path=self.save_path, history_path=self.history_path)
        other.new_game()
        self.assertEqual(schedule, other.events.spawn_schedule)

    # ------------------------------------------------------------------
    # 调查与处置
    # ------------------------------------------------------------------
    def test_investigation_required_before_precise_action(self) -> None:
        game = self.game
        alert = self._real_alert()
        game.select_alert(alert)
        self.assertFalse(self._option("delete_mail").enabled)
        self.assertFalse(self._option("reset_password").enabled)
        self._investigate(alert)
        self.assertTrue(alert.investigated)
        self.assertEqual(alert.display_level, alert.level)
        self.assertTrue(self._option("delete_mail").enabled)

    def test_investigate_shrinks_risk(self) -> None:
        game = self.game
        alert = self._real_alert()
        event = game.events.events[0]
        device = game.devices[event.active_device_id]
        before = game.risk.estimate(event, device, game.turn, game.confidence_bonus)
        self._investigate(alert)
        after = game.risk.estimate(event, device, game.turn, game.confidence_bonus)
        self.assertGreaterEqual(after[2], before[2])
        self.assertLessEqual(after[1] - after[0], before[1] - before[0])

    def test_delete_mail_contains_event(self) -> None:
        game = self.game
        alert = self._real_alert()
        self._investigate(alert)
        option = self._option("delete_mail")
        self.assertTrue(option.enabled, option.reason)
        result = game.perform_action(option, game.current_target())
        self.assertTrue(result.success)
        self.assertTrue(game.events.events[0].contained)
        self.assertTrue(alert.resolved)
        self.assertEqual(game.combo, 1)

    def test_isolate_and_unisolate(self) -> None:
        game = self.game
        game.select_device("PC-01")
        option = self._option("isolate")
        game.perform_action(option, game.current_target())
        device = game.devices["PC-01"]
        self.assertTrue(device.isolated)
        self.assertEqual(game.player.availability, 100)  # 终端不承载业务服务
        self.assertTrue(game.events.events[0].contained)
        self.assertFalse(game.events.events[0].eradicated)
        game.action_panel.sync(game)
        option = self._option("unisolate")
        result = game.perform_action(option, game.current_target())
        self.assertFalse(game.events.events[0].contained)
        self.assertFalse(result.success)
        self.assertEqual(game.player.availability, 100)

    def test_patch_contains_web_event(self) -> None:
        game = self.game
        config = game.events.get_event_config("EVT-WEB-04")
        assert config is not None
        event = SecurityEvent(config, game.turn)
        game.events.events.append(event)
        game.select_device("WEB-01")
        option = self._option("patch")
        result = game.perform_action(option, game.current_target())
        self.assertTrue(result.success)
        self.assertTrue(event.contained)
        self.assertTrue(game.devices["WEB-01"].patched)

    def test_shutdown_and_startup(self) -> None:
        game = self.game
        config = game.events.get_event_config("EVT-LOGIN-02")
        assert config is not None
        event = SecurityEvent(config, game.turn)
        game.events.events.append(event)
        game.select_device("GW-01")
        option = self._option("shutdown")
        result = game.perform_action(option, game.current_target())
        self.assertTrue(result.success)
        self.assertFalse(game.devices["GW-01"].online)
        self.assertTrue(event.contained)
        game.action_panel.sync(game)
        option = self._option("startup")
        result = game.perform_action(option, game.current_target())
        self.assertFalse(result.success)  # 事件重新活跃
        self.assertTrue(game.devices["GW-01"].online)

    def test_restore_and_protect_backup(self) -> None:
        game = self.game
        game.player.adjust("integrity", -20, "测试")
        game.select_device("BAK-01")
        option = self._option("restore_backup")
        result = game.perform_action(option, game.current_target())
        self.assertTrue(result.success)
        self.assertFalse(game.devices["BAK-01"].backups)
        self.assertGreaterEqual(game.player.integrity, 80)

        game.select_device("BAK-01")
        option = self._option("protect_backup")
        result = game.perform_action(option, game.current_target())
        self.assertTrue(result.success)
        self.assertTrue(game.devices["BAK-01"].backup_protected)

    # ------------------------------------------------------------------
    # 升级与决策
    # ------------------------------------------------------------------
    def test_upgrade_purchase_and_effects(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("log_plugin")[0])
        self.assertLess(game.player.funds, 1280)
        self.assertEqual(game.confidence_bonus, 0.15)
        self.assertFalse(game.buy_upgrade("log_plugin")[0])

        alert = self._real_alert()
        game.select_alert(alert)
        option = self._option("investigate")
        self.assertEqual(option.money_cost, 10)
        self.assertTrue(game.buy_upgrade("edr")[0])
        game.select_device("PC-01")
        self.assertEqual(self._option("isolate").ap_cost, 1)

    # ------------------------------------------------------------------
    # 加固树：三线两层、前置与互斥
    # ------------------------------------------------------------------
    def test_upgrade_tree_layout(self) -> None:
        tree = self.game.upgrade_tree
        self.assertEqual(len(tree.tracks), 3)
        self.assertEqual(len(tree.upgrades), 7)
        grouped = tree.by_track()
        self.assertEqual([item.upgrade_id for item in grouped["detect"]], ["log_plugin", "threat_intel"])
        self.assertEqual(
            [item.upgrade_id for item in grouped["respond"]], ["edr", "auto_block", "playbook"]
        )
        self.assertEqual(
            [item.upgrade_id for item in grouped["resilience"]],
            ["offline_backup", "redundant_link"],
        )
        tier2 = sorted(item.upgrade_id for item in tree.upgrades if item.tier == 2)
        self.assertEqual(tier2, ["playbook", "redundant_link", "threat_intel"])

    def test_upgrade_requires_and_exclusive_specializations(self) -> None:
        game = self.game
        ok, reason = game.buy_upgrade("threat_intel")
        self.assertFalse(ok)
        self.assertIn("需要先启用", reason)

        self.assertTrue(game.buy_upgrade("log_plugin")[0])
        self.assertTrue(game.buy_upgrade("threat_intel")[0])
        self.assertAlmostEqual(game.confidence_bonus, 0.25)

        self.assertTrue(game.buy_upgrade("edr")[0])
        # 第二层三条线互斥：已经选了情报深挖，就不能再选快速清场或保业务
        for upgrade_id in ("playbook", "redundant_link"):
            ok, reason = game.buy_upgrade(upgrade_id)
            self.assertFalse(ok, upgrade_id)
            self.assertIn("互斥", reason)

        # 同层同线也是二选一
        ok, reason = game.buy_upgrade("auto_block")
        self.assertFalse(ok)
        self.assertIn("互斥", reason)

    def test_upgrade_income_and_sla_effects(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("offline_backup")[0])
        self.assertTrue(game.buy_upgrade("redundant_link")[0])
        self.assertEqual(game.modifiers.get("income_bonus"), 30)
        self.assertEqual(game.modifiers.get("sla_reputation_mitigation"), 1)

        game.events.events.clear()
        game.events.alerts.clear()
        game.player.funds = 500
        game.start_turn()
        self.assertEqual(
            game.player.funds,
            500 + settings.TURN_INCOME + 30 - settings.TURN_UPKEEP,
        )

        # SLA 违约时，多线路缓冲抵掉声誉惩罚
        game.events.events.clear()
        game.devices["WEB-01"].isolate()
        game.recompute_availability("测试隔离 Web 服务")
        before = game.player.reputation
        game.end_turn()
        self.assertEqual(game.player.reputation, before)

    def test_playbook_reduces_eradicate_cost(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("edr")[0])
        self.assertTrue(game.buy_upgrade("playbook")[0])
        alert = self._real_alert()
        self._investigate(alert)
        game.select_device("PC-01")
        game.perform_action(self._option("isolate"), game.current_target())
        game.select_device("PC-01")
        eradicate = self._option("eradicate")
        self.assertEqual(eradicate.ap_cost, 1)
        self.assertEqual(eradicate.money_cost, 45)

    def test_threat_intel_reveals_extra_clue(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("log_plugin")[0])
        self.assertTrue(game.buy_upgrade("threat_intel")[0])
        alert = self._real_alert()
        event = game.event_for_alert(alert)
        self.assertIsNotNone(event)
        self._investigate(alert)
        self.assertEqual(event.revealed_clues, 2)

    def test_offline_backup_mitigates_ransomware(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("offline_backup")[0])
        config = game.events.get_event_config("EVT-RANSOM-03")
        assert config is not None
        event = SecurityEvent(config, game.turn)
        event.stage_index = event.max_stage_index
        game.events.events.append(event)
        game.events._trigger_final_loss(game, event)
        self.assertEqual(game.state, GameState.PLAYING)  # 有离线备份，不直接判负
        self.assertFalse(game.ransomware_failed)

    def test_decision_opens_and_applies(self) -> None:
        game = self.game
        game.events.events.clear()
        game.turn = 3
        game.player.turn = 3
        game.end_turn()
        self.assertEqual(game.turn, 4)
        self.assertTrue(game.decision_screen.visible)
        before = game.player.availability
        game.choose_decision(0)
        self.assertFalse(game.decision_screen.visible)
        self.assertEqual(game.player.availability, max(0, before - 8))
        self.assertIn("customer_pressure", game.seen_decisions)

    # ------------------------------------------------------------------
    # 存档与历史
    # ------------------------------------------------------------------
    def test_save_and_load_roundtrip(self) -> None:
        game = self.game
        alert = self._real_alert()
        self._investigate(alert)
        game.perform_action(self._option("delete_mail"), game.current_target())
        game.end_turn()
        snapshot = (
            game.turn,
            game.player.security,
            game.player.funds,
            game.player.upgrades,
            len(game.events.events),
            len(game.events.alerts),
            len(game.logs.entries),
            game.events.spawn_schedule,
        )
        self.assertTrue(game.save_game())
        self.assertTrue(game.events.events[0].eradicated)
        rng_before = game.rng.getstate()
        game.end_turn()
        self.assertTrue(game.load_game())
        self.assertTrue(game.events.events[0].eradicated)
        self.assertEqual(
            (
                game.turn,
                game.player.security,
                game.player.funds,
                game.player.upgrades,
                len(game.events.events),
                len(game.events.alerts),
                len(game.logs.entries),
                game.events.spawn_schedule,
            ),
            snapshot,
        )
        self.assertEqual(game.rng.getstate(), rng_before)
        self.assertEqual(game.state, GameState.PLAYING)

    def test_save_load_missing_file(self) -> None:
        self.assertFalse(self.save_path.exists())
        self.assertFalse(self.game.load_game())
        self.assertEqual(self.game.state, GameState.PLAYING)

    def test_history_is_written(self) -> None:
        game = self.game
        game.finish("time")
        history = game.save_manager.load_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["seed"], 2024)
        self.assertIn("score", history[0])

    def test_save_load_preserves_upgrades_and_decisions(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("edr")[0])
        game.events.events.clear()
        game.turn = 3
        game.player.turn = 3
        game.end_turn()
        self.assertTrue(game.decision_screen.visible)
        game.choose_decision(1)
        self.assertTrue(game.save_game())
        schedule = dict(game.events.spawn_schedule)
        game.player.funds = 0
        game.seen_decisions.clear()
        self.assertTrue(game.load_game())
        self.assertIn("edr", game.player.upgrades)
        self.assertIn("customer_pressure", game.seen_decisions)
        self.assertEqual(game.events.spawn_schedule, schedule)
        self.assertGreater(game.player.funds, 0)

    def test_boss_event_spawns_at_turn8(self) -> None:
        game = self.game
        game.turn = 8
        game.events.start_turn(game)
        boss = game.events.get_event("EVT-ZERODAY-06")
        self.assertIsNotNone(boss)
        assert boss is not None
        self.assertEqual(boss.active_device_id, "WEB-01")
        self.assertEqual(game.threat_level, 3)

    def test_history_overlay_from_menu(self) -> None:
        game = self.game
        game.finish("time")
        self.assertTrue(game.save_manager.load_history())
        game.state = GameState.MENU
        game.update(0.016)
        game.draw()
        self._click(game.menu.buttons["history"].rect.center, game)
        self.assertTrue(game.history_screen.visible)
        game.draw()
        game.handle_event(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_ESCAPE, mod=0, unicode=""))
        self.assertFalse(game.history_screen.visible)

    # ------------------------------------------------------------------
    # 结局判定
    # ------------------------------------------------------------------
    def test_over_defense_ending(self) -> None:
        game = self.game
        for device_id in ("DB-01", "BAK-01", "GW-01", "WEB-01"):
            game.devices[device_id].isolate()
        game.recompute_availability("测试：大面积隔离")
        self.assertLessEqual(game.player.availability, settings.AVAILABILITY_FAIL)
        for _ in range(settings.AVAILABILITY_FAIL_TURNS):
            game.end_turn()
        self.assertEqual(game.state, GameState.RESULT)
        assert game.report is not None
        self.assertEqual(game.report.ending_key, "over_defense")

    def test_security_failure_ending(self) -> None:
        game = self.game
        game.player.security = 0
        game.end_turn()
        self.assertEqual(game.state, GameState.RESULT)
        assert game.report is not None
        self.assertEqual(game.report.ending_key, "security_breach")

    def test_ransomware_ending_mapping(self) -> None:
        report = ScoreSystem().evaluate(            {
                "reason": "ransomware",
                "turn": 8,
                "total_turns": 10,
                "security": 40,
                "funds": 400,
                "reputation": 40,
                "availability": 30,
                "integrity": 10,
                "total_events": 6,
                "resolved": 3,
                "missed": 3,
                "identified": 5,
                "average_response": 2.0,
                "false_positives_seen": 3,
                "false_positives_checked": 2,
                "false_isolations": 1,
                "data_leak": False,
                "ransomware_failed": True,
                "security_breach": False,
                "best_combo": 2,
            }
        )
        self.assertEqual(report.ending_key, "ransomware")

    def test_threat_level_and_combo(self) -> None:
        game = self.game
        self.assertEqual(game.threat_level, 2)
        self.assertTrue(game.events.events[0].is_active)
        config = game.events.get_event_config("EVT-LOGIN-02")
        assert config is not None
        second = SecurityEvent(config, game.turn)
        game.events.events.append(second)
        self.assertEqual(game.threat_level, 3)
        game.contain_event(second, "测试控制")
        self.assertEqual(game.combo, 0)
        self.assertTrue(second.contained)
        game.eradicate_event(second, "测试清除")
        self.assertEqual(game.combo, 1)
        game.eradicate_event(game.events.events[0], "测试清除")
        self.assertEqual(game.combo, 2)
        self.assertGreaterEqual(game.player.action_points, settings.ACTION_POINTS_PER_TURN)

    def test_services_income_and_sla(self) -> None:
        game = self.game
        views = game.services.views(game.devices)
        self.assertEqual(len(views), 6)
        self.assertEqual(game.services.income(game.devices), settings.TURN_INCOME)
        self.assertEqual(game.services.availability(game.devices), 100)
        self.assertEqual(game.services.critical_outages(game.devices), [])

        game.devices["WEB-01"].isolate()
        game.recompute_availability("测试隔离 Web 服务")
        self.assertLess(game.player.availability, 100)
        self.assertLess(game.services.income(game.devices), settings.TURN_INCOME)
        self.assertTrue(game.services.critical_outages(game.devices))
        before = game.player.reputation
        game.end_turn()
        self.assertLessEqual(game.player.reputation, before - 1)
        self.assertGreaterEqual(game.turn, 2)

    def test_control_then_eradicate_flow(self) -> None:
        game = self.game
        alert = self._real_alert()
        event = game.events.events[0]
        self._investigate(alert)
        game.select_device("PC-01")
        game.action_panel.sync(game)
        isolate = self._option("isolate")
        self.assertTrue(isolate.enabled, isolate.reason)
        game.perform_action(isolate, game.current_target())
        self.assertTrue(event.contained)
        self.assertFalse(event.eradicated)
        self.assertTrue(alert.controlled)
        self.assertFalse(alert.resolved)

        game.select_alert(alert)
        game.action_panel.sync(game)
        eradicate = self._option("eradicate")
        self.assertTrue(eradicate.enabled, eradicate.reason)
        result = game.perform_action(eradicate, game.current_target())
        self.assertTrue(result.success)
        self.assertTrue(event.eradicated)
        self.assertTrue(alert.resolved)
        self.assertFalse(alert.controlled)
        self.assertEqual(game.combo, 1)

    def test_preemptive_next_hop_block(self) -> None:
        game = self.game
        config = game.events.get_event_config("EVT-RANSOM-03")
        assert config is not None
        event = SecurityEvent(config, game.turn)
        game.events.events = [event]
        self.assertEqual(event.next_device_id, "FIN-01")
        # 先推进到“共享目录扩散”，下一跳就是数据库
        event.stage_index = 1
        self.assertEqual(event.next_device_id, "DB-01")
        game.devices["DB-01"].isolate()
        game.events.advance_events(game)
        self.assertEqual(event.stage_index, 1)
        self.assertTrue(event.is_active)

    # ------------------------------------------------------------------
    # 攻击战役（事件链）
    # ------------------------------------------------------------------
    def test_campaigns_loaded_and_linked(self) -> None:
        events = self.game.events
        self.assertEqual(len(events.campaign_configs), 2)
        self.assertEqual(events.campaign_id_of("EVT-PHISH-01"), "CAM-NIGHTJACK")
        self.assertEqual(events.campaign_id_of("EVT-INSIDER-05"), "CAM-NIGHTJACK")
        self.assertEqual(events.campaign_id_of("EVT-ZERODAY-06"), "CAM-CINDER")
        # 勒索软件是机会主义事件，不属于任何战役
        self.assertEqual(events.campaign_id_of("EVT-RANSOM-03"), "")
        self.assertEqual(events.events[0].campaign_id, "CAM-NIGHTJACK")
        alert = self._real_alert()
        campaign = self.game.campaign_for_alert(alert)
        self.assertIsNotNone(campaign)
        assert campaign is not None
        self.assertEqual(campaign.get("actor"), "APT-夜鸦")

    def test_campaign_reveal_when_second_member_spawns(self) -> None:
        game = self.game
        events = game.events
        events.spawn_schedule["EVT-LOGIN-02"] = game.turn + 1
        game.end_turn()
        self.assertIsNotNone(events.get_event("EVT-LOGIN-02"))
        self.assertTrue(events.campaign_runtime["CAM-NIGHTJACK"]["revealed"])
        self.assertEqual(events.campaign_status()[0]["active"] >= 1, True)

    def test_campaign_escalation_pulls_next_event_earlier(self) -> None:
        game = self.game
        events = game.events
        campaign = events.campaign_of("EVT-PHISH-01")
        assert campaign is not None
        original = events.spawn_schedule["EVT-LOGIN-02"]
        for _ in range(events._threshold(campaign)):
            events.advance_campaigns(game)
        self.assertEqual(events.spawn_schedule["EVT-LOGIN-02"], game.turn + 1)
        self.assertLess(events.spawn_schedule["EVT-LOGIN-02"], original)
        runtime = events.campaign_runtime["CAM-NIGHTJACK"]
        self.assertEqual(runtime["escalations"], 1)
        self.assertEqual(runtime["momentum"], 0)

    def test_campaign_escalation_accelerates_chain(self) -> None:
        game = self.game
        events = game.events
        # 让战役的所有成员都已经出现
        for event_id in ("EVT-LOGIN-02", "EVT-INSIDER-05"):
            config = events.get_event_config(event_id)
            assert config is not None
            event = SecurityEvent(config, game.turn)
            event.campaign_id = events.campaign_id_of(event_id)
            events.events.append(event)
            events.spawned_event_ids.add(event_id)
            events.spawn_schedule.pop(event_id, None)
        phish = events.events[0]
        before_stage = phish.stage_index
        campaign = events.campaign_of("EVT-PHISH-01")
        assert campaign is not None
        for _ in range(events._threshold(campaign)):
            events.advance_campaigns(game)
        self.assertGreater(phish.stage_index, before_stage)
        self.assertEqual(events.campaign_runtime["CAM-NIGHTJACK"]["escalations"], 1)

    def test_campaign_escalation_can_finish_the_job(self) -> None:
        game = self.game
        events = game.events
        phish = events.events[0]
        phish.stage_index = phish.max_stage_index
        for event_id in ("EVT-LOGIN-02", "EVT-INSIDER-05"):
            config = events.get_event_config(event_id)
            assert config is not None
            event = SecurityEvent(config, game.turn)
            event.campaign_id = events.campaign_id_of(event_id)
            events.events.append(event)
            events.spawned_event_ids.add(event_id)
            events.spawn_schedule.pop(event_id, None)
        campaign = events.campaign_of("EVT-PHISH-01")
        assert campaign is not None
        for _ in range(events._threshold(campaign)):
            events.advance_campaigns(game)
        # 放着不管到最后一阶段，攻击者会直接收尾而不是继续等
        self.assertEqual(game.state, GameState.RESULT)
        self.assertTrue(game.data_leak)

    def test_campaign_pressure_drops_when_all_controlled(self) -> None:
        game = self.game
        events = game.events
        for _ in range(2):
            events.advance_campaigns(game)
        self.assertEqual(events.campaign_runtime["CAM-NIGHTJACK"]["momentum"], 2)
        game.contain_event(events.events[0], "测试控制")
        events.advance_campaigns(game)
        self.assertEqual(events.campaign_runtime["CAM-NIGHTJACK"]["momentum"], 1)

    def test_campaign_state_survives_save_load(self) -> None:
        game = self.game
        for _ in range(2):
            game.events.advance_campaigns(game)
        self.assertEqual(game.events.campaign_runtime["CAM-NIGHTJACK"]["momentum"], 2)
        self.assertTrue(game.save_game())
        game.events.campaign_runtime["CAM-NIGHTJACK"]["momentum"] = 0
        self.assertTrue(game.load_game())
        self.assertEqual(game.events.campaign_runtime["CAM-NIGHTJACK"]["momentum"], 2)
        self.assertEqual(game.events.events[0].campaign_id, "CAM-NIGHTJACK")

    def test_result_has_morning_news(self) -> None:
        game = self.game
        game.finish("time")
        assert game.report is not None
        self.assertTrue(game.report.news_headline)
        self.assertTrue(game.report.news_detail)

    def test_correct_action_feedback(self) -> None:
        game = self.game
        alert = self._real_alert()
        game.select_alert(alert)
        game.perform_action(self._option("investigate"), game.current_target())
        self.assertIsNotNone(game.effects.feedback)
        assert game.effects.feedback is not None
        self.assertTrue(game.effects.feedback.correct)
        self.assertEqual(game.effects.feedback.title, "调查成功")
        self.assertEqual(game.effects.feedback.stage, "调查")

        game.select_device("PC-01")
        game.perform_action(self._option("isolate"), game.current_target())
        assert game.effects.feedback is not None
        self.assertEqual(game.effects.feedback.title, "控制成功")
        self.assertEqual(game.effects.feedback.stage, "控制")
        game.draw()  # 反馈卡必须能实际绘制，不能只存在于状态里

    # ------------------------------------------------------------------
    # 界面/输入
    # ------------------------------------------------------------------
    def test_log_search_and_filters(self) -> None:
        game = self.game
        results = game.logs.search("PC-01")
        self.assertTrue(results)
        self.assertTrue(all("pc-01" in entry.haystack() for entry in results))
        alert_logs = game.logs.search("", "告警")
        self.assertTrue(all(entry.category == "告警" for entry in alert_logs))

    def test_click_alert_then_investigate(self) -> None:
        game = self.game
        game.draw()
        content = (settings.LAYOUT["alerts"][0] + 112, settings.LAYOUT["alerts"][1] + 50)
        self._click(content)
        self.assertIsNotNone(game.selected_alert)
        game.update(0.016)
        button, option = game.action_panel.buttons[0]
        self._click(button.rect.center)
        self.assertEqual(option.action_id, "investigate")
        self.assertEqual(game.player.action_points, settings.ACTION_POINTS_PER_TURN - 1)

    def test_log_input_does_not_advance_turn(self) -> None:
        game = self.game
        game.draw()
        self._click(game.log_panel.search_rect.center)
        self.assertTrue(game.log_panel.input_active)
        game.handle_event(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_SPACE, mod=0, unicode=" "))
        self.assertEqual(game.turn, 1)

    def test_menu_start_pause_and_continue(self) -> None:
        assert SCREEN is not None
        game = Game(SCREEN, seed=99, save_path=self.save_path, history_path=self.history_path)
        self.assertEqual(game.state, GameState.MENU)
        game.draw()
        self._click(game.menu.buttons["start"].rect.center, game)
        self.assertEqual(game.state, GameState.PLAYING)
        self.assertTrue(game.briefing.visible)
        self._click(game.briefing.button.rect.center, game)
        self.assertFalse(game.briefing.visible)
        game.update(0.016)
        self._click(game.bottom_buttons["advance"].rect.center, game)
        self.assertEqual(game.turn, 2)
        game.handle_event(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_ESCAPE, mod=0, unicode=""))
        self.assertEqual(game.state, GameState.PAUSED)
        game.update(0.016)
        self._click(game.pause_buttons["save"].rect.center, game)
        self.assertTrue(self.save_path.exists())
        game.update(0.016)
        self._click(game.pause_buttons["resume"].rect.center, game)
        self.assertEqual(game.state, GameState.PLAYING)

        game.state = GameState.MENU
        game.update(0.016)
        game.draw()
        self._click(game.menu.buttons["continue"].rect.center, game)
        self.assertEqual(game.state, GameState.PLAYING)

    def test_upgrade_shop_click(self) -> None:
        game = self.game
        game.shop.open()
        game.update(0.016)
        game.draw()
        self.assertTrue(game.shop.buy_buttons)
        button, upgrade_id = game.shop.buy_buttons[0]
        self._click(button.rect.center, game)
        self.assertIn(upgrade_id, game.player.upgrades)

    def test_result_screen_buttons(self) -> None:
        game = self.game
        game.finish("time")
        game.update(0.016)
        game.draw()
        self._click(game.result_screen.buttons["restart"].rect.center, game)
        self.assertEqual(game.state, GameState.PLAYING)
        game.finish("time")
        game.update(0.016)
        self._click(game.result_screen.buttons["menu"].rect.center, game)
        self.assertEqual(game.state, GameState.MENU)

    # ------------------------------------------------------------------
    # 新手教程
    # ------------------------------------------------------------------
    def test_tutorial_pages_and_practice(self) -> None:
        game = self.game
        game.state = GameState.MENU
        game.update(0.016)
        game.draw()
        self._click(game.menu.buttons["tutorial"].rect.center, game)
        self.assertTrue(game.tutorial_screen.visible)
        self.assertTrue(game.tutorial_mode)
        self.assertEqual(len(game.events.events), 1)
        self.assertEqual(len(game.events.alerts), 1)

        for _ in range(12):
            if not game.tutorial_screen.visible:
                break
            button = game.tutorial_screen.buttons[-1][0]
            self._click(button.rect.center, game)
        self.assertFalse(game.tutorial_screen.visible)
        self.assertTrue(game.tutorial_mode)

        game.update(0.016)
        alert_rect = (720, 112)
        self._click(alert_rect, game)
        game.update(0.016)
        self.assertEqual(game.tutorial_guide.step, 1)

        def action_button(action_id: str):
            for button, option in game.action_panel.buttons:
                if option.action_id == action_id:
                    return button
            return None

        investigate = action_button("investigate")
        self.assertIsNotNone(investigate)
        assert investigate is not None
        self._click(investigate.rect.center, game)
        game.update(0.016)
        self.assertEqual(game.tutorial_guide.step, 2)

        isolate = action_button("isolate")
        self.assertIsNotNone(isolate)
        assert isolate is not None
        self._click(isolate.rect.center, game)
        game.update(0.016)
        self.assertEqual(game.tutorial_guide.step, 3)

        eradicate = action_button("eradicate")
        self.assertIsNotNone(eradicate)
        assert eradicate is not None
        self._click(eradicate.rect.center, game)
        game.update(0.016)
        self.assertEqual(game.tutorial_guide.step, 4)

        unisolate = action_button("unisolate")
        self.assertIsNotNone(unisolate)
        assert unisolate is not None
        self._click(unisolate.rect.center, game)
        game.update(0.016)
        self.assertEqual(game.tutorial_guide.step, 5)

        self._click(game.bottom_buttons["advance"].rect.center, game)
        game.update(0.016)
        self.assertTrue(game.tutorial_guide.completed)
        self._click(game.tutorial_guide.start_button.rect.center, game)
        self.assertFalse(game.tutorial_mode)
        self.assertEqual(game.state, GameState.PLAYING)
        self.assertGreater(len(game.events.spawn_schedule), 1)

    def test_tutorial_skip_returns_to_menu(self) -> None:
        game = self.game
        game.state = GameState.MENU
        game.update(0.016)
        game.draw()
        self._click(game.menu.buttons["tutorial"].rect.center, game)
        self.assertTrue(game.tutorial_screen.visible)
        skip = game.tutorial_screen.buttons[1][0]
        self._click(skip.rect.center, game)
        self.assertFalse(game.tutorial_screen.visible)
        self.assertFalse(game.tutorial_mode)
        self.assertEqual(game.state, GameState.MENU)

    def _click(self, pos: tuple[int, int], game: Game | None = None) -> None:
        target = game or self.game
        target.handle_event(pygame.event.Event(pygame.MOUSEBUTTONDOWN, button=1, pos=pos))
        target.handle_event(pygame.event.Event(pygame.MOUSEBUTTONUP, button=1, pos=pos))


if __name__ == "__main__":
    unittest.main(verbosity=2)
