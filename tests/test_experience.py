# -*- coding: utf-8 -*-
"""体验包 A+B（v1.7.0）回归测试。

覆盖桌面版这一轮的四条表现层改动与四条节奏改动：
    A1 禁用按钮把原因写在按钮上
    A2 关闭服务器 / 解除隔离要两次确认
    A3 零星告警时的值守空态
    A4 日志的时间戳与正文分出层次
    B1 推进回合后的结算摘要（1.7 秒）
    B2 夜色随时钟走 + 整点节拍
    B3 安全度趋势预判
    B4 连续低可用性的失败预兆

运行方式（在 cyber_defense_game 目录下）：
    py -3.10 tests/test_experience.py
测试使用 SDL dummy 驱动，不会弹出窗口。
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
from models.player_state import MetricChange  # noqa: E402
from ui import draw_utils  # noqa: E402

SCREEN: pygame.Surface | None = None


def setUpModule() -> None:
    global SCREEN
    pygame.init()
    draw_utils.set_font_path(settings.find_chinese_font())
    SCREEN = pygame.display.set_mode(settings.SCREEN_SIZE)


def tearDownModule() -> None:
    pygame.quit()


class ExperienceTest(unittest.TestCase):
    def setUp(self) -> None:
        assert SCREEN is not None
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.game = Game(
            SCREEN,
            seed=2024,
            save_path=root / "savegame.json",
            history_path=root / "history.json",
        )
        self.game.new_game()

    def tearDown(self) -> None:
        self.temp.cleanup()

    # ------------------------------------------------------------------
    def click(self, pos: tuple[int, int]) -> None:
        for kind in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP):
            self.game.handle_event(pygame.event.Event(kind, {"pos": pos, "button": 1}))

    def action_button(self, action_id: str):
        for button, option in self.game.action_panel.buttons:
            if option.action_id == action_id:
                return button
        return None

    # ==================================================================
    # A1 禁用理由
    # ==================================================================
    def test_disabled_button_shows_short_reason(self) -> None:
        game = self.game
        game.select_alert(game.events.alerts[0])
        game.action_panel.sync(game)
        disabled = [(button, option) for button, option in game.action_panel.buttons if not option.enabled]
        self.assertTrue(disabled, "未调查的告警应当有禁用操作")
        for button, option in disabled:
            self.assertNotEqual(button.subtitle, "不可用")
            self.assertTrue(button.subtitle)
            # 按钮上只放第一句，逗号之后的话留给悬停提示
            self.assertNotIn("，", button.subtitle)
            self.assertTrue(option.reason.startswith(button.subtitle.split("…")[0][:4]))

    # ==================================================================
    # A2 两次确认
    # ==================================================================
    def test_shutdown_needs_two_clicks(self) -> None:
        game = self.game
        game.select_device("DB-01")
        game.action_panel.sync(game)
        button = self.action_button("shutdown")
        self.assertIsNotNone(button)
        assert button is not None

        self.click(button.rect.center)
        self.assertEqual(game.action_panel.pending_action(), "shutdown")
        self.assertTrue(game.devices["DB-01"].online, "第一次点击不应该关机")

        self.click(button.rect.center)
        self.assertEqual(game.action_panel.pending_action(), "")
        self.assertFalse(game.devices["DB-01"].online, "第二次点击才真正关机")

    def test_pending_confirm_expires(self) -> None:
        game = self.game
        game.action_panel.pending = ("shutdown", 0)
        self.assertEqual(game.action_panel.pending_action(), "")

    def test_switching_target_cancels_confirm(self) -> None:
        game = self.game
        game.select_device("DB-01")
        game.action_panel.sync(game)
        button = self.action_button("shutdown")
        assert button is not None
        self.click(button.rect.center)
        self.assertEqual(game.action_panel.pending_action(), "shutdown")

        game.select_device("WEB-01")
        game.action_panel.sync(game)
        self.assertEqual(game.action_panel.pending_action(), "", "换目标后确认应当作废")

    def test_unisolate_needs_two_clicks(self) -> None:
        game = self.game
        game.select_alert(game.events.alerts[0])
        game.action_panel.sync(game)
        isolate = self.action_button("isolate")
        assert isolate is not None
        self.click(isolate.rect.center)
        self.assertTrue(game.devices["PC-01"].isolated)

        game.action_panel.sync(game)
        unisolate = self.action_button("unisolate")
        assert unisolate is not None
        self.click(unisolate.rect.center)
        self.assertTrue(game.devices["PC-01"].isolated, "第一次点击只上膛")
        self.assertEqual(game.action_panel.pending_action(), "unisolate")

        self.click(unisolate.rect.center)
        self.assertFalse(game.devices["PC-01"].isolated)

    # ==================================================================
    # A3 值守空态
    # ==================================================================
    def test_idle_block_when_few_alerts(self) -> None:
        game = self.game
        game.alert_panel.draw(game.screen, game) if False else None
        game.alert_panel.draw(SCREEN, game)  # type: ignore[arg-type]
        self.assertIsNotNone(game.alert_panel.idle_rect)

    def test_no_idle_block_when_alerts_pile_up(self) -> None:
        game = self.game
        game.events.alerts = game.events.alerts * 4
        game.alert_panel.draw(SCREEN, game)  # type: ignore[arg-type]
        self.assertIsNone(game.alert_panel.idle_rect)

    # ==================================================================
    # A4 日志层次
    # ==================================================================
    def test_log_rows_have_prefix_gutter(self) -> None:
        game = self.game
        game.log_panel._cache_key = None
        game.log_panel.draw(SCREEN, game)  # type: ignore[arg-type]
        self.assertGreater(game.log_panel._gutter, 0)
        first = game.log_panel._rows[0]
        self.assertIn("prefix", first)
        self.assertIn("lines", first)
        self.assertTrue(str(first["prefix"]).startswith("["))

    # ==================================================================
    # B1 回合结算摘要
    # ==================================================================
    def test_turn_recap_after_end_turn(self) -> None:
        game = self.game
        game.end_turn()
        self.assertIsNotNone(game.turn_recap)
        assert game.turn_recap is not None
        self.assertEqual(game.turn_recap["turn"], 1)
        self.assertTrue(game.recap_visible())
        self.assertTrue(game.turn_recap["items"] or game.turn_recap["next"])
        game.draw()  # 摘要绘制不应抛异常

    def test_turn_recap_expires(self) -> None:
        game = self.game
        game.end_turn()
        game.recap_until = pygame.time.get_ticks() - 1
        self.assertFalse(game.recap_visible())
        game.draw()

    def test_turn_recap_reset_on_new_game(self) -> None:
        game = self.game
        game.end_turn()
        self.assertIsNotNone(game.turn_recap)
        game.new_game()
        self.assertIsNone(game.turn_recap)
        self.assertFalse(game.recap_visible())

    # ==================================================================
    # B2 夜色与整点
    # ==================================================================
    def test_night_shifts_with_turn(self) -> None:
        game = self.game
        game.turn = 1
        early = game._night_color()
        game.turn = 5
        deepest = game._night_color()
        game.turn = 10
        dawn = game._night_color()
        self.assertNotEqual(early, deepest)
        self.assertNotEqual(deepest, dawn)

    def test_night_tint_only_when_playing(self) -> None:
        game = self.game
        game.state = GameState.MENU
        before = SCREEN.copy()  # type: ignore[union-attr]
        game._draw_night_tint()
        self.assertEqual(pygame.image.tobytes(before, "RGB"), pygame.image.tobytes(SCREEN, "RGB"))

    def test_whole_hour_beat(self) -> None:
        game = self.game
        game.turn = 3
        game.start_turn()  # → 第 4 回合（01:00）
        self.assertEqual(game.turn, 4)
        # 横幅可能被同一回合的高危事件覆盖，所以以日志为准
        messages = " ".join(entry.message for entry in game.logs.entries)
        self.assertIn("01:00", messages)

    # ==================================================================
    # B3 趋势预判
    # ==================================================================
    def test_security_trend_uses_last_two_turns(self) -> None:
        game = self.game
        game.turn = 3
        game.player.security = 40
        game.player.changes.append(MetricChange(1, "security", -14, "测试"))
        game.player.changes.append(MetricChange(2, "security", -13, "测试"))
        trend = game.dashboard.security_trend(game)
        self.assertIsNotNone(trend)
        assert trend is not None
        self.assertIn("失守", str(trend["text"]))
        self.assertEqual(trend["turn"], 6)

    def test_no_trend_without_history(self) -> None:
        self.assertIsNone(self.game.dashboard.security_trend(self.game))

    def test_no_trend_when_security_stable(self) -> None:
        game = self.game
        game.turn = 3
        game.player.changes.append(MetricChange(1, "security", 0, "测试"))
        game.player.changes.append(MetricChange(2, "security", 0, "测试"))
        self.assertIsNone(game.dashboard.security_trend(game))

    # ==================================================================
    # B4 失败预兆
    # ==================================================================
    def test_collapse_warning_draws_without_error(self) -> None:
        game = self.game
        game.low_availability_turns = 0
        game._draw_collapse_warning()
        game.low_availability_turns = 2
        game.player.availability = 32
        game._draw_collapse_warning()
        game.draw()


if __name__ == "__main__":
    unittest.main(verbosity=2)
