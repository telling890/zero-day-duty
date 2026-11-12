# -*- coding: utf-8 -*-
"""推理深度与重复游玩测试：难度、延迟决策、攻击者性格、加固流派与时间线。"""

from __future__ import annotations

import json
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
from ui import draw_utils  # noqa: E402

SCREEN: pygame.Surface | None = None


def setUpModule() -> None:
    global SCREEN
    pygame.init()
    draw_utils.set_font_path(settings.find_chinese_font())
    SCREEN = pygame.display.set_mode(settings.SCREEN_SIZE)


def tearDownModule() -> None:
    pygame.quit()


class DepthTest(unittest.TestCase):
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
        self.game.new_game(difficulty="standard")

    def tearDown(self) -> None:
        self.temp.cleanup()

    # ------------------------------------------------------------------
    def _real_alert(self):
        return next(alert for alert in self.game.events.alerts if not alert.false_positive)

    def _option(self, action_id: str):
        options = self.game.actions.options_for(self.game, self.game.current_target())
        return next(option for option in options if option.action_id == action_id)

    def _investigate(self, alert=None) -> None:
        alert = alert or self._real_alert()
        self.game.select_alert(alert)
        self.game.perform_action(self._option("investigate"), self.game.current_target())

    def _logs(self) -> str:
        return "\n".join(str(entry.message) for entry in self.game.logs.entries)

    # ------------------------------------------------------------------
    # 难度：信息质量差异
    # ------------------------------------------------------------------
    def test_difficulty_modes_and_information_quality(self) -> None:
        self.assertEqual([mode.mode_id for mode in self.game.difficulty_set.modes], ["novice", "standard", "expert"])
        self.assertIn("标准", self.game.difficulty_mode.name)

        # 新手：完整建议 + 精确下一跳
        self.game.new_game(difficulty="novice")
        self._investigate()
        logs = self._logs()
        self.assertIn("建议处置：", logs)
        self.assertIn("风险提示：", logs)
        self.assertIn("预测下一跳：", logs)

        # 标准：只给处置方向，不给完整步骤/精确设备
        self.game.new_game(difficulty="standard")
        self._investigate()
        logs = self._logs()
        self.assertIn("处置方向：", logs)
        self.assertNotIn("建议处置：", logs)
        self.assertNotIn("预测下一跳：", logs)
        self.assertNotIn("风险提示：", logs)
        self.assertIn("下一跳方向：", logs)

        # 专家：无建议、无方向、带未验证噪声线索
        self.game.new_game(difficulty="expert")
        self._investigate()
        logs = self._logs()
        self.assertIn("处置建议：证据不足", logs)
        self.assertNotIn("建议处置：", logs)
        self.assertIn("下一跳：证据不足", logs)
        self.assertIn("未验证：", logs)

    def test_risk_margin_scales_by_difficulty(self) -> None:
        event = self._real_alert()
        event = self.game.event_for_alert(event)
        device = self.game.devices[event.active_device_id]
        novice = self.game.difficulty_set.get("novice")
        expert = self.game.difficulty_set.get("expert")
        low_n, high_n, _ = self.game.risk.estimate(event, device, self.game.turn, 0.0, novice.risk_scale)
        low_e, high_e, _ = self.game.risk.estimate(event, device, self.game.turn, 0.0, expert.risk_scale)
        self.assertLess(high_n - low_n, high_e - low_e)

    def test_novice_hint_is_one_time_and_before_action(self) -> None:
        game = self.game
        game.new_game(difficulty="novice")
        game.select_device("WEB-01")
        option = self._option("isolate")
        self.assertTrue(option.enabled, option.reason)
        hint = game.consume_action_hint(option, game.current_target())
        self.assertTrue(hint)
        self.assertIn("新手提示", self._logs())
        self.assertEqual(game.consume_action_hint(option, game.current_target()), "")

    def test_expert_stage_log_is_delayed_one_turn(self) -> None:
        game = self.game
        game.new_game(difficulty="expert")
        self.assertTrue(game.events.pending_logs)
        before = self._logs()
        self.assertNotIn("邮件网关记录", before)
        game.start_turn()
        after = self._logs()
        self.assertIn("[延迟到达]", after)

    # ------------------------------------------------------------------
    # 决策：已知成本、隐藏影响、延迟后果、三选一
    # ------------------------------------------------------------------
    def test_decision_hides_security_and_queues_delayed_effect(self) -> None:
        game = self.game
        game.turn = 4
        game._maybe_trigger_decision()
        self.assertTrue(game.decision_screen.visible)
        decision = game.decision_screen.decision
        self.assertIsNotNone(decision)
        self.assertEqual(len(decision["choices"]), 2)
        self.assertNotIn("安全", decision["choices"][0]["hint"])
        game.choose_decision(0)
        self.assertEqual(len(game.pending_delayed), 1)
        self.assertEqual(game.pending_delayed[0]["due_turn"], 6)
        self.assertEqual(len(game.decision_history), 1)
        self.assertTrue(any(item["kind"] == "decision" for item in game.timeline))

        game.turn = 6
        game.process_delayed_effects()
        self.assertEqual(game.pending_delayed, [])
        self.assertIn("延迟后果", self._logs())
        self.assertTrue(any(item["kind"] == "delayed" for item in game.timeline))

    def test_three_choice_decision_is_reachable_and_supported_by_ui(self) -> None:
        game = self.game
        game.turn = 5
        game._maybe_trigger_decision()
        self.assertTrue(game.decision_screen.visible)
        self.assertEqual(len(game.decision_screen.buttons), 3)
        game.choose_decision(2)
        self.assertEqual(game.decision_history[-1]["id"], "service_tradeoff")
        self.assertEqual(game.pending_delayed[0]["due_turn"], 7)

    def test_save_load_preserves_difficulty_delayed_and_timeline(self) -> None:
        game = self.game
        game.new_game(difficulty="expert")
        game.turn = 4
        game._maybe_trigger_decision()
        game.choose_decision(0)
        self.assertTrue(game.save_game())
        game.new_game(difficulty="standard")
        self.assertTrue(game.load_game())
        self.assertEqual(game.difficulty_id, "expert")
        self.assertEqual(len(game.pending_delayed), 1)
        self.assertTrue(game.timeline)

    def test_old_save_without_difficulty_fields_still_loads(self) -> None:
        game = self.game
        game.new_game(difficulty="expert")
        self.assertTrue(game.save_game())
        data = json.loads(self.save_path.read_text(encoding="utf-8"))
        for key in ("difficulty", "timeline", "pending_delayed", "decision_history", "hints_used"):
            data.pop(key, None)
        self.save_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        self.assertTrue(game.load_game())
        self.assertEqual(game.difficulty_id, "standard")
        self.assertEqual(game.timeline, [])
        self.assertEqual(game.pending_delayed, [])

    # ------------------------------------------------------------------
    # 攻击者性格
    # ------------------------------------------------------------------
    def test_nightjar_waits_under_mass_isolation_with_clue(self) -> None:
        game = self.game
        game.devices["WEB-01"].isolate()
        game.devices["DB-01"].isolate()
        event = game.events.events[0]
        stage = event.stage_index
        for _ in range(3):
            game.events.advance_campaigns(game)
        runtime = game.events.campaign_runtime["CAM-NIGHTJACK"]
        self.assertGreaterEqual(runtime["waits"], 1)
        self.assertEqual(event.stage_index, stage)
        self.assertIn("活动强度突然下降", self._logs())
        self.assertTrue(any(item["kind"] == "actor_wait" for item in game.timeline))

    def test_cinder_switches_away_from_patched_target_with_notice(self) -> None:
        game = self.game
        events = game.events
        web_config = events.get_event_config("EVT-WEB-04")
        web = SecurityEvent(web_config, 3)
        web.campaign_id = "CAM-CINDER"
        events.events.append(web)
        events.spawned_event_ids.add(web.event_id)
        game.devices["WEB-01"].patched = True
        config = events.get_event_config("EVT-ZERODAY-06")
        boss = SecurityEvent(config, 8)
        # 让零日阶段的落点落在数据库，制造“Web 已补丁 → 转向 DB”的可观察切换
        boss.stage["active_device"] = "DB-01"
        boss.campaign_id = "CAM-CINDER"
        game.devices["DB-01"].patched = False
        events.events.append(boss)
        events.spawned_event_ids.add(boss.event_id)
        game.turn = 8
        for _ in range(2):
            events.advance_campaigns(game)
        runtime = events.campaign_runtime["CAM-CINDER"]
        self.assertEqual(runtime["last_switch"], boss.event_id)
        self.assertIn("转向", self._logs())
        self.assertTrue(any(item["kind"] == "actor_switch" for item in game.timeline))

    # ------------------------------------------------------------------
    # 加固流派
    # ------------------------------------------------------------------
    def test_threat_intel_early_reveal_and_next_hop_detail(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("log_plugin")[0])
        self.assertTrue(game.buy_upgrade("threat_intel")[0])
        self._investigate()
        logs = self._logs()
        self.assertIn("情报插件推断下一跳", logs)
        campaign = game.events.get_campaign("CAM-NIGHTJACK")
        self.assertIsNotNone(campaign)
        self.assertTrue(game.events._maybe_reveal_campaign(game, campaign))
        self.assertTrue(game.events.campaign_runtime["CAM-NIGHTJACK"]["revealed"])

    def test_playbook_increases_false_isolation_penalty(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("edr")[0])
        self.assertTrue(game.buy_upgrade("playbook")[0])
        game.select_device("WEB-01")
        game.perform_action(self._option("isolate"), game.current_target())
        self.assertGreaterEqual(game.player.stats.get("false_isolation_loss", 0), 7)
        self.assertTrue(any(item["kind"] == "false_isolation" for item in game.timeline))

    def test_redundant_link_income_floor_and_doctrine(self) -> None:
        game = self.game
        self.assertTrue(game.buy_upgrade("offline_backup")[0])
        self.assertTrue(game.buy_upgrade("redundant_link")[0])
        game.devices["WEB-01"].isolate()
        self.assertGreaterEqual(game.services.income(game.devices, 60), 60)
        self.assertTrue(game.doctrine())

    # ------------------------------------------------------------------
    # 时间线与复现
    # ------------------------------------------------------------------
    def test_timeline_and_review_come_from_records(self) -> None:
        game = self.game
        self._investigate()
        game.turn = 10
        game.finish("time")
        self.assertEqual(game.state, GameState.RESULT)
        report = game.report
        self.assertIsNotNone(report)
        self.assertTrue(report.timeline)
        self.assertIn("key_correct", report.review)
        self.assertIn("key_mistake", report.review)
        self.assertTrue(report.doctrine)

    def test_same_seed_and_difficulty_reproducible(self) -> None:
        assert SCREEN is not None
        other = Game(SCREEN, seed=2024, save_path=self.save_path, history_path=self.history_path)
        other.new_game(difficulty="standard")
        self.assertEqual(self.game.seed, other.seed)
        self.assertEqual(self.game.events.spawn_schedule, other.events.spawn_schedule)
        self.assertEqual(self.game.events.alerts[0].title, other.events.alerts[0].title)
        self.assertEqual(self.game.difficulty_id, other.difficulty_id)


if __name__ == "__main__":
    unittest.main()
