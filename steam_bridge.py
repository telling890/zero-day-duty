# -*- coding: utf-8 -*-
"""Steam 成就桥接层（可选，默认完全关闭）。

设计原则：

1. **没有 Steam 环境时是空操作**：找不到 `steamworks` 库、没有 `steam_api64.dll`、
   或者没登录 Steam 客户端，所有函数都安全返回，不抛异常、不改变游戏行为。
2. **成就判定是纯函数**：`derive_achievements()` 只吃结算数据，方便单测，
   也让"游戏内成就"和"Steam 成就"共用同一份判定。
3. **SDK 调用集中在一个后端类里**：换库（steamworks-py / 自己包的 ctypes）只改
   `SteamworksBackend`，上层不用动。

用法（宿主）::

    import steam_bridge
    steam_bridge.init()                       # 没有 Steam 就返回 False
    steam_bridge.unlock_from_report(report, summary)
    steam_bridge.shutdown()

本地调试时把 `steam_appid.txt`（内容为 AppID）放到 exe / 项目根目录，
或者设置环境变量 `STEAM_APP_ID`。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# 内部成就名 → Steam API Name
# ---------------------------------------------------------------------------
ACHIEVEMENT_MAP: dict[str, str] = {
    "完美防守": "ACH_PERFECT",
    "零误封": "ACH_ZERO_FALSE",
    "情报闭环": "ACH_INTEL_LOOP",
    "连击大师": "ACH_COMBO",
    "闪电响应": "ACH_FAST_RESPONSE",
    "预算管家": "ACH_BUDGET",
}

# 结算数据推出、但没有对应"游戏内成就"的那几个
EXTRA_ACHIEVEMENTS = {
    "all_chains": "ACH_ALL_CHAINS",
    "over_defense": "ACH_SURVIVE_OVERDEFENSE",
    "first_shift": "ACH_FIRST_SHIFT",
}

ALL_API_NAMES = set(ACHIEVEMENT_MAP.values()) | set(EXTRA_ACHIEVEMENTS.values())

_state: dict[str, Any] = {
    "backend": None,
    "ready": False,
    "tried": False,
    "unlocked": [],  # 本次进程内已上报的成就，避免重复调用
}


# ---------------------------------------------------------------------------
# 路径与 AppID
# ---------------------------------------------------------------------------
def app_dir() -> Path:
    """可写目录：打包后是 exe 所在目录，源码运行时是项目根目录。"""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def read_app_id() -> int | None:
    """AppID 来源：环境变量优先，其次 steam_appid.txt。"""
    raw = os.environ.get("STEAM_APP_ID", "").strip()
    if raw:
        try:
            return int(raw)
        except ValueError:
            return None
    path = app_dir() / "steam_appid.txt"
    if path.is_file():
        try:
            return int(path.read_text(encoding="utf-8").strip())
        except (OSError, ValueError):
            return None
    return None


# ---------------------------------------------------------------------------
# 后端
# ---------------------------------------------------------------------------
class NullBackend:
    """默认后端：什么都不做。"""

    name = "null"

    def init(self, app_id: int | None = None) -> bool:
        return False

    def unlock(self, api_name: str) -> bool:
        return False

    def shutdown(self) -> None:
        return None


class SteamworksBackend:
    """包一层 `steamworks`（steamworks-py）。

    不同版本导出的函数名不完全一致，这里按候选名探测，全部 try/except：
    探测失败就当作不可用，不影响游戏。
    """

    name = "steamworks"

    def __init__(self) -> None:
        self._lib: Any = None
        self.available = False

    def init(self, app_id: int | None = None) -> bool:
        try:
            import steamworks  # type: ignore
        except Exception:
            return False
        self._lib = steamworks

        for name in ("init", "steamworks_init", "init_ex"):
            func = getattr(steamworks, name, None)
            if not callable(func):
                continue
            ok = self._call(func, app_id)
            if ok:
                self.available = True
                return True
        return False

    @staticmethod
    def _call(func, app_id: int | None) -> bool:
        try:
            if app_id is None:
                return bool(func())
            return bool(func(app_id))
        except TypeError:
            try:
                return bool(func())
            except Exception:
                return False
        except Exception:
            return False

    def unlock(self, api_name: str) -> bool:
        if not self.available or self._lib is None:
            return False
        for name in ("set_achievement", "setAchievement", "SetAchievement"):
            func = getattr(self._lib, name, None)
            if not callable(func):
                continue
            try:
                func(api_name)
            except Exception:
                return False
            for store_name in ("store_stats", "storeStats", "StoreStats"):
                store = getattr(self._lib, store_name, None)
                if callable(store):
                    try:
                        store()
                    except Exception:
                        pass
                    break
            return True
        return False

    def shutdown(self) -> None:
        if self._lib is None:
            return
        for name in ("shutdown", "steamworks_shutdown"):
            func = getattr(self._lib, name, None)
            if callable(func):
                try:
                    func()
                except Exception:
                    pass
                return


# ---------------------------------------------------------------------------
# 公开 API
# ---------------------------------------------------------------------------
def configure(backend: Any) -> None:
    """注入自定义后端（测试或换库用）。"""
    _state["backend"] = backend
    _state["ready"] = False
    _state["tried"] = False
    _state["unlocked"] = []


def init(app_id: int | None = None, backend: Any = None) -> bool:
    """初始化 Steam，失败返回 False（这是正常路径，不是错误）。"""
    if backend is not None:
        configure(backend)
    if _state["backend"] is None:
        _state["backend"] = SteamworksBackend()
    if _state["tried"]:
        return bool(_state["ready"])
    _state["tried"] = True

    target = app_id if app_id is not None else read_app_id()
    try:
        ok = bool(_state["backend"].init(target))
    except Exception:
        ok = False
    _state["ready"] = ok
    return ok


def is_ready() -> bool:
    return bool(_state["ready"])


def unlock(api_name: str) -> bool:
    """上报单个成就；已上报过的直接返回 True。"""
    if not api_name or not _state["ready"]:
        return False
    if api_name in _state["unlocked"]:
        return True
    backend = _state["backend"]
    if backend is None:
        return False
    try:
        ok = bool(backend.unlock(api_name))
    except Exception:
        ok = False
    if ok:
        _state["unlocked"].append(api_name)
    return ok


def unlock_many(names: Iterable[str]) -> list[str]:
    """批量上报，返回**本次新上报成功**的名字（已上报过的跳过）。"""
    done: list[str] = []
    for name in names:
        if not name or name in _state["unlocked"]:
            continue
        if unlock(name):
            done.append(name)
    return done


def derive_achievements(report: Any = None, summary: dict[str, Any] | None = None) -> list[str]:
    """从结算数据推导应该解锁哪些 Steam 成就（纯函数，不碰 SDK）。

    判定条件和 `systems/score_system.py` 里的内部成就保持一致，
    只是把中文名换成 Steam 的 API Name，另外补三个额外的。
    """
    data: dict[str, Any] = dict(summary or {})
    ending_key = getattr(report, "ending_key", None) or data.get("ending_key")

    def num(key: str) -> float | None:
        """只认调用方真的给了的字段，避免默认 0 造出假成就。"""
        if key not in data:
            return None
        try:
            return float(data[key] or 0)
        except (TypeError, ValueError):
            return None

    names: list[str] = []

    if ending_key == "perfect":
        names.append(ACHIEVEMENT_MAP["完美防守"])

    false_isolations = num("false_isolations")
    if false_isolations is not None and false_isolations == 0:
        names.append(ACHIEVEMENT_MAP["零误封"])

    identified = num("identified")
    total_events = num("total_events")
    if identified is not None and total_events is not None and total_events > 0 and identified >= total_events:
        names.append(ACHIEVEMENT_MAP["情报闭环"])

    combo = num("best_combo")
    if combo is not None and combo >= 3:
        names.append(ACHIEVEMENT_MAP["连击大师"])

    average = num("average_response")
    resolved = num("resolved")
    if average is not None and 0 < average <= 1.0 and (resolved or 0) > 0:
        names.append(ACHIEVEMENT_MAP["闪电响应"])

    funds = num("funds")
    if funds is not None and funds >= 1000:
        names.append(ACHIEVEMENT_MAP["预算管家"])

    if resolved is not None and resolved >= 6:
        names.append(EXTRA_ACHIEVEMENTS["all_chains"])

    if ending_key == "over_defense":
        names.append(EXTRA_ACHIEVEMENTS["over_defense"])

    # 只要正常走到结算就算"第一个夜班"
    names.append(EXTRA_ACHIEVEMENTS["first_shift"])

    # 去重并保序
    seen: set[str] = set()
    result: list[str] = []
    for name in names:
        if name not in seen:
            seen.add(name)
            result.append(name)
    return result


def unlock_from_report(report: Any = None, summary: dict[str, Any] | None = None) -> list[str]:
    """结算后调用：推导 + 上报，返回上报成功的成就。"""
    if not _state["ready"]:
        return []
    try:
        names = derive_achievements(report, summary)
    except Exception:
        return []
    return unlock_many(names)


def shutdown() -> None:
    backend = _state["backend"]
    if backend is not None:
        try:
            backend.shutdown()
        except Exception:
            pass
    _state["ready"] = False


def reset() -> None:
    """测试用：回到未初始化状态。"""
    _state.update({"backend": None, "ready": False, "tried": False, "unlocked": []})
