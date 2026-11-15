# -*- coding: utf-8 -*-
"""Steam 桥接层的单元测试：判定逻辑 + 无 Steam 环境时的降级行为。

运行：py -3.10 -m pytest tests/test_steam_bridge.py -q
     或 py -3.10 -m unittest tests.test_steam_bridge
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import steam_bridge  # noqa: E402


class FakeReport:
    def __init__(self, ending_key: str) -> None:
        self.ending_key = ending_key


class FakeBackend:
    """记录调用的假后端。"""

    name = "fake"

    def __init__(self, ok: bool = True) -> None:
        self.ok = ok
        self.inited: list[int | None] = []
        self.unlocked: list[str] = []
        self.closed = False

    def init(self, app_id: int | None = None) -> bool:
        self.inited.append(app_id)
        return self.ok

    def unlock(self, api_name: str) -> bool:
        if not self.ok:
            return False
        self.unlocked.append(api_name)
        return True

    def shutdown(self) -> None:
        self.closed = True


class DeriveTests(unittest.TestCase):
    def setUp(self) -> None:
        steam_bridge.reset()

    def test_perfect_run_unlocks_everything_computable(self) -> None:
        summary = {
            "false_isolations": 0,
            "identified": 6,
            "total_events": 6,
            "best_combo": 4,
            "average_response": 0.8,
            "resolved": 6,
            "funds": 1200,
        }
        names = steam_bridge.derive_achievements(FakeReport("perfect"), summary)
        self.assertIn("ACH_PERFECT", names)
        self.assertIn("ACH_ZERO_FALSE", names)
        self.assertIn("ACH_INTEL_LOOP", names)
        self.assertIn("ACH_COMBO", names)
        self.assertIn("ACH_FAST_RESPONSE", names)
        self.assertIn("ACH_BUDGET", names)
        self.assertIn("ACH_ALL_CHAINS", names)
        self.assertIn("ACH_FIRST_SHIFT", names)
        self.assertNotIn("ACH_SURVIVE_OVERDEFENSE", names)

    def test_over_defense_ending(self) -> None:
        summary = {
            "false_isolations": 3,
            "resolved": 1,
            "funds": 200,
        }
        names = steam_bridge.derive_achievements(FakeReport("over_defense"), summary)
        self.assertIn("ACH_SURVIVE_OVERDEFENSE", names)
        self.assertIn("ACH_FIRST_SHIFT", names)
        self.assertNotIn("ACH_PERFECT", names)
        self.assertNotIn("ACH_ZERO_FALSE", names)
        self.assertNotIn("ACH_BUDGET", names)

    def test_empty_summary_does_not_invent_achievements(self) -> None:
        names = steam_bridge.derive_achievements(FakeReport("security_breach"), {})
        self.assertEqual(names, ["ACH_FIRST_SHIFT"])

    def test_all_names_are_declared(self) -> None:
        summary = {
            "false_isolations": 0,
            "identified": 6,
            "total_events": 6,
            "best_combo": 9,
            "average_response": 0.5,
            "resolved": 6,
            "funds": 5000,
        }
        names = steam_bridge.derive_achievements(FakeReport("perfect"), summary)
        self.assertEqual(len(names), len(set(names)), "不应重复上报")
        for name in names:
            self.assertIn(name, steam_bridge.ALL_API_NAMES)

    def test_no_duplicate_report_after_first_shift(self) -> None:
        summary = {"false_isolations": 1}
        first = steam_bridge.derive_achievements(FakeReport("timeout"), summary)
        second = steam_bridge.derive_achievements(FakeReport("timeout"), summary)
        self.assertEqual(first, second)


class DegradeTests(unittest.TestCase):
    """没装 steamworks / 没登录 Steam 时必须安静失败。"""

    def setUp(self) -> None:
        steam_bridge.reset()

    def tearDown(self) -> None:
        steam_bridge.reset()

    def test_init_without_library_returns_false(self) -> None:
        self.assertFalse(steam_bridge.init())
        self.assertFalse(steam_bridge.is_ready())

    def test_unlock_without_init_is_noop(self) -> None:
        self.assertFalse(steam_bridge.unlock("ACH_PERFECT"))
        self.assertEqual(steam_bridge.unlock_from_report(FakeReport("perfect"), {}), [])
        steam_bridge.shutdown()  # 不应抛异常

    def test_failed_backend_stays_silent(self) -> None:
        backend = FakeBackend(ok=False)
        self.assertFalse(steam_bridge.init(backend=backend))
        self.assertEqual(steam_bridge.unlock_from_report(FakeReport("perfect"), {"false_isolations": 0}), [])
        self.assertEqual(backend.unlocked, [])

    def test_working_backend_reports_and_dedupes(self) -> None:
        backend = FakeBackend(ok=True)
        self.assertTrue(steam_bridge.init(app_id=1234560, backend=backend))
        self.assertEqual(backend.inited, [1234560])

        summary = {"false_isolations": 0, "resolved": 6, "funds": 1500}
        done = steam_bridge.unlock_from_report(FakeReport("perfect"), summary)
        self.assertIn("ACH_PERFECT", done)
        self.assertIn("ACH_FIRST_SHIFT", done)

        again = steam_bridge.unlock_from_report(FakeReport("perfect"), summary)
        self.assertEqual(again, [], "已上报的成就不该重复调用 SDK")
        self.assertEqual(len(backend.unlocked), len(set(backend.unlocked)))

        steam_bridge.shutdown()
        self.assertTrue(backend.closed)

    def test_app_id_from_env(self) -> None:
        old = os.environ.get("STEAM_APP_ID")
        try:
            os.environ["STEAM_APP_ID"] = "998877"
            self.assertEqual(steam_bridge.read_app_id(), 998877)
            os.environ["STEAM_APP_ID"] = "not-a-number"
            self.assertIsNone(steam_bridge.read_app_id())
        finally:
            if old is None:
                os.environ.pop("STEAM_APP_ID", None)
            else:
                os.environ["STEAM_APP_ID"] = old


if __name__ == "__main__":
    unittest.main(verbosity=2)
