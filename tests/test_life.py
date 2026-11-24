# -*- coding: utf-8 -*-
"""生活线（v1.9.0）回归测试。

覆盖桌面版这一轮的生活线改动：
    1. 初始生活值
    2. 第 1 回合不消耗 / 第 2 回合按表消耗（含 clamp 到 0）
    3. 体力 72 / 54 / 29 三档行动点 6 / 5 / 4
    4. 心情 39 时 confidence_bonus 比基础值低 0.10
    5. 真实 data/decisions.json 的生活场景：生活值、AP、公司指标按数据变化
    6. 存档往返含生活值；旧存档（无字段）读成初始值
    7. build_summary 含生活字段，ScoreSystem.evaluate 产出生活分与评语
    8. 生活逻辑不消耗随机数（同种子可复现）

运行方式（在 cyber_defense_game 目录下）：
    py -3.10 -m pytest tests -q
"""

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
from models.player_state import PlayerState  # noqa: E402
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


class LifeLineTest(unittest.TestCase):
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
    def life_logs(self, prefix: str = "") -> list[str]:
        return [
            entry.message
            for entry in self.game.logs.entries
            if entry.category == settings.LIFE_CATEGORY
            and (not prefix or entry.message.startswith(prefix))
        ]

    def trigger_life_decision(self, turn: int, decision_id: str) -> None:
        game = self.game
        game.events.events.clear()
        game.events.alerts.clear()
        game.turn = turn
        game.player.turn = turn
        game._maybe_trigger_decision()
        self.assertTrue(game.decision_screen.visible)
        self.assertIsNotNone(game.decision_screen.decision)
        assert game.decision_screen.decision is not None
        self.assertEqual(game.decision_screen.decision["id"], decision_id)

    # ==================================================================
    # 1. 初始值
    # ==================================================================
    def test_initial_life_values(self) -> None:
        player = self.game.player
        self.assertEqual(player.energy, 72)
        self.assertEqual(player.mood, 70)
        self.assertEqual(player.family, 60)
        self.assertEqual((settings.INITIAL_ENERGY, settings.INITIAL_MOOD, settings.INITIAL_FAMILY), (72, 70, 60))
        self.assertEqual(player.life_score, 67)  # round((72+70+60)/3)
        self.assertEqual(self.game.turn, 1)
        # 第 1 回合仍然是满行动点
        self.assertEqual(player.action_points, 6)
        self.assertEqual(settings.ACTION_POINTS_PER_TURN, 6)
        # 初始体力档位不扣 AP
        self.assertEqual(player.life_ap_penalty(), 0)

    # ==================================================================
    # 2. 每回合消耗
    # ==================================================================
    def test_first_turn_has_no_decay(self) -> None:
        self.assertEqual(self.game.turn, 1)
        self.assertEqual((self.game.player.energy, self.game.player.mood, self.game.player.family), (72, 70, 60))
        self.assertEqual(self.life_logs("夜班消耗"), [])

    def test_second_turn_decay_and_single_log(self) -> None:
        game = self.game
        game.end_turn()
        self.assertEqual(game.turn, 2)
        self.assertEqual(game.player.energy, 69)
        self.assertEqual(game.player.mood, 68)
        self.assertEqual(game.player.family, 57)
        # 三行消耗只写一条合并日志
        logs = self.life_logs("夜班消耗")
        self.assertEqual(len(logs), 1, logs)
        self.assertEqual(logs[0], "夜班消耗：体力 −3 · 心情 −2 · 家庭 −3（当前 69 / 68 / 57）")

    def test_decay_clamps_at_zero(self) -> None:
        game = self.game
        game.player.energy = 2
        game.player.mood = 1
        game.player.family = 0
        game.end_turn()
        self.assertEqual((game.player.energy, game.player.mood, game.player.family), (0, 0, 0))
        self.assertEqual(game.player.life_score, 0)
        # clamp 后仍然只有一条日志，且写的是真实变化量
        logs = self.life_logs("夜班消耗")
        self.assertEqual(len(logs), 1, logs)
        self.assertIn("当前 0 / 0 / 0", logs[0])

    # ==================================================================
    # 3. 体力 → 行动点三档
    # ==================================================================
    def test_action_points_three_tiers(self) -> None:
        game = self.game
        for energy, expected in ((72, 6), (55, 6), (54, 5), (30, 5), (29, 4), (0, 4)):
            game.player.energy = energy
            game.player.refresh_turn(game.turn)
            self.assertEqual(game.player.action_points, expected, f"体力 {energy}")
        # 下限 3：基数被抬高时不会低于 3
        game.player.energy = 0
        game.player.max_action_points = 3
        self.assertEqual(game.player.ap_for_turn(), 3)

    def test_ap_penalty_message_and_log(self) -> None:
        game = self.game
        game.player.energy = 60
        game.end_turn()  # 第 2 回合：60 - 3 = 57，仍然满 AP
        self.assertEqual(game.player.energy, 57)
        self.assertEqual(game.player.action_points, 6)
        game.player.energy = 57
        game.end_turn()  # 第 3 回合：57 - 3 = 54 → AP -1
        self.assertEqual(game.player.energy, 54)
        self.assertEqual(game.player.action_points, 5)
        self.assertIn("体力不支：本回合行动点 −1（体力 54）", self.life_logs())

    # ==================================================================
    # 4. 心情 → 判断力
    # ==================================================================
    def test_low_mood_lowers_confidence(self) -> None:
        game = self.game
        base = game.confidence_bonus
        self.assertEqual(base, 0.0)
        game.player.mood = 40
        self.assertEqual(game.confidence_bonus, base)  # 40 不惩罚
        game.player.mood = 39
        self.assertAlmostEqual(game.confidence_bonus, base - 0.10)
        # 已有加固加成时，仍然是在基础上再 -0.10
        self.assertTrue(game.buy_upgrade("log_plugin")[0])
        self.assertAlmostEqual(game.confidence_bonus, 0.15 - 0.10)

    def test_low_mood_widens_risk_interval(self) -> None:
        game = self.game
        alert = next(item for item in game.events.alerts if not item.false_positive)
        event = game.event_for_alert(alert)
        assert event is not None
        device = game.devices[event.active_device_id]
        game.player.mood = 70
        low_calm, high_calm, confidence_calm = game.risk.estimate(
            event, device, game.turn, game.confidence_bonus
        )
        game.player.mood = 39
        low_tired, high_tired, confidence_tired = game.risk.estimate(
            event, device, game.turn, game.confidence_bonus
        )
        self.assertLess(confidence_tired, confidence_calm)
        self.assertGreaterEqual(
            high_tired - low_tired, high_calm - low_calm, "心情差时风险区间不应变窄"
        )

    # ==================================================================
    # 5. 真实生活场景
    # ==================================================================
    def test_life_decision_data_is_present(self) -> None:
        life = [item for item in self.game.decisions if item.get("kind") == "life"]
        self.assertEqual(len(life), 5)
        self.assertEqual(
            sorted(int(item["turn"]) for item in life),
            [2, 3, 6, 9, 10],
        )

    def test_payday_choice_changes_family_and_mood(self) -> None:
        game = self.game
        self.trigger_life_decision(2, "life_payday")
        game.choose_decision(0)  # 先给家里转两千：家庭 +14，心情 +3
        self.assertFalse(game.decision_screen.visible)
        self.assertEqual(game.player.family, 74)
        self.assertEqual(game.player.mood, 73)
        self.assertEqual(game.player.energy, 72)
        self.assertIn("家庭 +14（生活场景「工资到账」）", self.life_logs())
        self.assertIn("心情 +3（生活场景「工资到账」）", self.life_logs())
        self.assertTrue(any(item["id"] == "life_payday" for item in game.decision_history))

    def test_family_call_costs_action_point(self) -> None:
        game = self.game
        self.trigger_life_decision(6, "life_family_call")
        before_ap = game.player.action_points
        game.choose_decision(0)  # 接三分钟：行动点 -1，家庭 +16，心情 +6
        self.assertEqual(game.player.action_points, before_ap - 1)
        self.assertEqual(game.player.family, 76)
        self.assertEqual(game.player.mood, 76)
        self.assertIn("行动点 −1（生活场景「家里打来了视频」）", self.life_logs())

    def test_life_decision_mixes_company_metric_and_ap(self) -> None:
        game = self.game
        self.trigger_life_decision(6, "life_family_call")
        before_security = game.player.security
        before_ap = game.player.action_points
        game.choose_decision(2)  # 开视频陪孩子：AP -2，家庭 +20，心情 +8，安全 -1
        self.assertEqual(game.player.action_points, before_ap - 2)
        self.assertEqual(game.player.security, before_security - 1)
        self.assertEqual(game.player.family, 80)
        self.assertEqual(game.player.mood, 78)
        # 公司指标仍然走原来的「系统」日志
        self.assertTrue(
            any(
                entry.category == "系统" and "系统安全度 -1" in entry.message
                for entry in game.logs.entries
            )
        )

    def test_life_delayed_effect_uses_life_condition(self) -> None:
        game = self.game
        self.trigger_life_decision(2, "life_payday")
        game.choose_decision(1)  # 点宵夜：资金 -60，心情 +12，体力 +8 + 延迟（体力 < 35 时 +6）
        self.assertEqual(len(game.pending_delayed), 1)
        pending = game.pending_delayed[0]
        self.assertEqual(pending["due_turn"], 4)
        self.assertEqual(pending["condition"], {"energy_below": 35})

        # 体力高 → 走 else_effects（心情 +2）
        game.player.energy = 60
        game.turn = 4
        mood_before = game.player.mood
        game.process_delayed_effects()
        self.assertEqual(game.player.mood, mood_before + 2)
        self.assertTrue(any("延迟后果结算" in text for text in self.life_logs()))

    def test_life_delayed_effect_else_branch_on_low_energy(self) -> None:
        game = self.game
        self.trigger_life_decision(2, "life_payday")
        game.choose_decision(1)
        game.player.energy = 30
        game.turn = 4
        game.process_delayed_effects()
        self.assertEqual(game.player.energy, 36)  # 命中 effects: energy +6
        self.assertTrue(any("体力 +6" in text for text in self.life_logs()))

    # ==================================================================
    # 6. 存档
    # ==================================================================
    def test_save_and_load_keeps_life_values(self) -> None:
        game = self.game
        self.trigger_life_decision(2, "life_payday")
        game.choose_decision(0)
        game.player.energy = 48
        self.assertTrue(game.save_game())
        game.player.energy = 100
        game.player.mood = 100
        game.player.family = 100
        self.assertTrue(game.load_game())
        self.assertEqual(
            (game.player.energy, game.player.mood, game.player.family),
            (48, 73, 74),
        )
        self.assertEqual(game.state, GameState.PLAYING)

    def test_old_save_without_life_fields_loads_initial_values(self) -> None:
        game = self.game
        self.assertTrue(game.save_game())
        data = json.loads(self.save_path.read_text(encoding="utf-8"))
        self.assertEqual(data["version"], 1, "存档版本号必须保持 1")
        for key in settings.LIFE_KEYS:
            data["player"].pop(key, None)
        self.save_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        game.player.energy = 0
        game.player.mood = 0
        game.player.family = 0
        self.assertTrue(game.load_game())
        self.assertEqual(
            (game.player.energy, game.player.mood, game.player.family),
            (72, 70, 60),
        )

    def test_player_state_roundtrip(self) -> None:
        state = PlayerState(energy=33, mood=21, family=99)
        restored = PlayerState.from_dict(state.to_dict())
        self.assertEqual((restored.energy, restored.mood, restored.family), (33, 21, 99))
        snapshot = state.snapshot()
        self.assertEqual((snapshot["energy"], snapshot["mood"], snapshot["family"]), (33, 21, 99))
        # 越界值会被夹回 0–100
        clamped = PlayerState(energy=200, mood=-5, family=100)
        self.assertEqual((clamped.energy, clamped.mood, clamped.family), (100, 0, 100))

    # ==================================================================
    # 7. 结算：summary / 生活分 / 评语
    # ==================================================================
    def test_build_summary_contains_life_fields(self) -> None:
        summary = self.game.build_summary("time")
        self.assertEqual(summary["energy"], 72)
        self.assertEqual(summary["mood"], 70)
        self.assertEqual(summary["family"], 60)
        self.assertEqual(summary["life_score"], 67)

    def _summary(self, **overrides: object) -> dict[str, object]:
        summary = self.game.build_summary("time")
        summary.update(overrides)
        return summary

    def test_score_report_life_block(self) -> None:
        report = ScoreSystem().evaluate(self._summary())
        self.assertEqual(report.life["energy"], 72)
        self.assertEqual(report.life["mood"], 70)
        self.assertEqual(report.life["family"], 60)
        self.assertEqual(report.life["score"], 67)
        self.assertEqual(report.life["comment"], "夜班结束，你还站得住。")

    def test_life_comment_family_broken(self) -> None:
        report = ScoreSystem().evaluate(self._summary(energy=80, mood=80, family=25))
        self.assertEqual(report.life["comment"], "公司守住了，家里的灯没等到你。")
        # 评语只在生活区块出现一次，结局正文保持公司叙事
        self.assertNotIn("公司守住了，家里的灯没等到你。", report.ending_text)

    def test_life_comment_family_bonded(self) -> None:
        report = ScoreSystem().evaluate(self._summary(energy=50, mood=60, family=70))
        self.assertEqual(report.life["comment"], "回家时天刚亮，家里还给你留着一份早饭。")

    def test_life_comment_priority_and_fallback(self) -> None:
        # 体力 ≤ 25 优先于心情 ≤ 30
        report = ScoreSystem().evaluate(self._summary(energy=25, mood=20, family=40))
        self.assertEqual(report.life["comment"], "你守住了系统，但没守住自己。")
        report = ScoreSystem().evaluate(self._summary(energy=60, mood=30, family=40))
        self.assertEqual(report.life["comment"], "整晚都在硬撑，你的判断力比平时差了一截。")
        # 家庭 ≥ 70 但体力 < 50 → 拿不到“早饭”
        report = ScoreSystem().evaluate(self._summary(energy=40, mood=60, family=75))
        self.assertEqual(report.life["comment"], "夜班结束，你还站得住。")

    def test_life_score_affects_total(self) -> None:
        system = ScoreSystem()
        bad = system.evaluate(self._summary(energy=0, mood=0, family=0))
        neutral = system.evaluate(self._summary(energy=55, mood=55, family=55))
        good = system.evaluate(self._summary(energy=100, mood=100, family=100))
        self.assertEqual(bad.life["score"], 0)
        self.assertEqual(neutral.life["score"], 55)
        self.assertEqual(good.life["score"], 100)
        self.assertEqual(neutral.score, system.evaluate(self._summary(energy=55, mood=55, family=55)).score)
        self.assertGreater(good.score, neutral.score)
        self.assertGreater(neutral.score, bad.score)
        # round((0-55)*0.12) = -7，round((100-55)*0.12) = +5
        self.assertEqual(good.score - neutral.score, round((100 - 55) * 0.12))
        self.assertEqual(bad.score - neutral.score, round((0 - 55) * 0.12))

    def test_summary_without_life_fields_degrades_safely(self) -> None:
        summary = self.game.build_summary("time")
        for key in (*settings.LIFE_KEYS, "life_score"):
            summary.pop(key, None)
        report = ScoreSystem().evaluate(summary)  # 不能抛 KeyError
        self.assertFalse(report.life["available"])
        self.assertEqual(report.life["comment"], "")
        self.assertEqual(report.life["score"], settings.LIFE_SCORE_BASELINE)
        base = ScoreSystem().evaluate(
            {**summary, "energy": 55, "mood": 55, "family": 55}
        )
        self.assertEqual(report.score, base.score, "缺生活数据时不应加减分")

    def test_life_achievements(self) -> None:
        achievements = ScoreSystem().evaluate(
            self._summary(energy=60, mood=60, family=60)
        ).achievements
        self.assertIn("生活还在", achievements)
        achievements = ScoreSystem().evaluate(
            self._summary(energy=90, mood=90, family=20)
        ).achievements
        self.assertIn("只赢了公司", achievements)
        self.assertLessEqual(len(achievements), 5)

    # ==================================================================
    # 8. 生活逻辑不消耗随机数
    # ==================================================================
    def test_life_logic_does_not_touch_rng(self) -> None:
        game = self.game
        before = game.rng.getstate()
        game.player.decay_life()
        game.adjust_life("energy", -5, "测试")
        game.adjust_life("mood", 4, "测试")
        game.adjust_action_points(-1, "测试")
        game.player.life_ap_penalty()
        game.player.ap_for_turn()
        game.player.life_score
        _ = game.confidence_bonus
        self.assertEqual(game.rng.getstate(), before)

    def test_same_seed_reproduces_events_with_life_line(self) -> None:
        assert SCREEN is not None
        other = Game(
            SCREEN,
            seed=2024,
            save_path=self.save_path,
            history_path=self.history_path,
        )
        other.new_game()
        self.assertEqual(self.game.seed, other.seed)
        self.assertEqual(self.game.events.spawn_schedule, other.events.spawn_schedule)
        self.assertEqual(self.game.events.alerts[0].title, other.events.alerts[0].title)
        # 推进两回合（生活线开始扣数值）后，事件序列仍然一致
        for _ in range(2):
            self.game.decision_screen.close()
            self.game.end_turn()
            other.decision_screen.close()
            other.end_turn()
        self.assertEqual(self.game.rng.getstate(), other.rng.getstate())
        self.assertEqual(
            [alert.title for alert in self.game.events.alerts],
            [alert.title for alert in other.events.alerts],
        )
        self.assertEqual(self.game.player.energy, 66)

    # ==================================================================
    # 界面：顶栏 / 结算 / 决策浮层都能画出来
    # ==================================================================
    def test_dashboard_life_cell_and_tooltip_draw(self) -> None:
        game = self.game
        game.draw()
        cells = game.dashboard._cells(game)
        life_cell = next(item for item in cells if item.get("kind") == "life")
        self.assertEqual(life_cell["label"], "值班员状态")
        self.assertEqual([row[0] for row in life_cell["life"]], ["energy", "mood", "family"])
        self.assertIsNotNone(game.dashboard.life_rect)
        assert game.dashboard.life_rect is not None
        # 9 个指标格必须铺满顶栏且不越界
        self.assertLessEqual(game.dashboard.life_rect.right, settings.SCREEN_WIDTH)
        # 悬停时画提示框
        pygame.mouse.set_pos(game.dashboard.life_rect.center)
        game.draw()

    def test_result_screen_draws_life_block(self) -> None:
        game = self.game
        game.finish("time")
        self.assertEqual(game.state, GameState.RESULT)
        assert game.report is not None
        self.assertTrue(game.report.life["available"])
        game.draw()

    def test_life_decision_overlay_draws(self) -> None:
        game = self.game
        self.trigger_life_decision(2, "life_payday")
        game.draw()  # 生活浮层（暖色眉题/说明行）必须真的画得出来
        decision = game.decision_screen.decision
        assert decision is not None
        self.assertEqual(decision["kind"], "life")
        # 三个选项不能越出面板底边（1280x720 不溢出）
        self.assertEqual(len(game.decision_screen.buttons), 3)
        rect = game.decision_screen.rect
        for button in game.decision_screen.buttons:
            self.assertLessEqual(button.rect.bottom, rect.bottom)
        self.assertLessEqual(rect.bottom, settings.SCREEN_HEIGHT)

    def test_non_life_decision_keeps_original_panel(self) -> None:
        game = self.game
        game.turn = 4
        game.player.turn = 4
        game._maybe_trigger_decision()
        self.assertTrue(game.decision_screen.visible)
        assert game.decision_screen.decision is not None
        self.assertNotEqual(game.decision_screen.decision.get("kind"), "life")
        self.assertEqual(len(game.decision_screen.buttons), 2)
        self.assertEqual(game.decision_screen.rect.size, (820, 400))

    def test_tutorial_has_life_page(self) -> None:
        from ui.tutorial_screen import PAGES

        titles = [page.title for page in PAGES]
        self.assertIn("值班之外：生活线", titles)
        self.assertEqual(len(PAGES), 13)
        page = PAGES[titles.index("值班之外：生活线")]
        self.assertTrue(any("体力" in bullet for bullet in page.bullets))
        self.assertTrue(any("行动点" in bullet for bullet in page.bullets))
        self.assertTrue(any("判断力" in bullet for bullet in page.bullets))
        self.assertTrue(any("结局" in bullet for bullet in page.bullets))
        self.assertTrue(any("值班员不是机器" in bullet for bullet in page.bullets))
        # 页码顺序不能被打乱：生活页仍在一回合顺序之前
        self.assertLess(titles.index("值班之外：生活线"), titles.index("一个回合的完整顺序"))

    def test_life_log_category_is_registered(self) -> None:
        from systems.log_system import LOG_CATEGORIES
        from ui.log_panel import CATEGORY_COLORS, LogPanel

        self.assertIn("生活", LOG_CATEGORIES)
        self.assertIn("生活", LogPanel.CATEGORIES)
        self.assertEqual(CATEGORY_COLORS["生活"], settings.ORANGE)
        self.game.end_turn()
        entries = self.game.logs.search("", "生活")
        self.assertTrue(entries)
        self.assertTrue(all(entry.category == "生活" for entry in entries))


if __name__ == "__main__":
    unittest.main(verbosity=2)
