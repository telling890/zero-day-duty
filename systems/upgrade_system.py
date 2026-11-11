# -*- coding: utf-8 -*-
"""安全加固树：三条线 × 两层，带前置条件与互斥专精。

数据全部来自 data/upgrades.json，本模块只负责结构校验与效果聚合，
具体数值如何起作用仍由 Game / ActionManager / EventManager 调用。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

from settings import DataError

DEFAULT_TRACK_COLOR = "accent"


@dataclass(frozen=True)
class Track:
    """加固线：检测 / 响应 / 韧性。"""

    track_id: str
    name: str
    tagline: str = ""
    description: str = ""
    color: str = DEFAULT_TRACK_COLOR


@dataclass
class Upgrade:
    """一个加固项目。effects 里的键由使用方约定，见 README「安全加固」。"""

    upgrade_id: str
    name: str
    track: str
    tier: int
    cost: int
    description: str
    effects: dict[str, float] = field(default_factory=dict)
    requires: tuple[str, ...] = ()
    requires_any: tuple[str, ...] = ()
    excludes: tuple[str, ...] = ()

    def effect(self, key: str, default: float = 0.0) -> float:
        value = self.effects.get(key, default)
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(default)


class UpgradeTree:
    """加载与查询接口。owned 是玩家已启用项目 id 的集合。"""

    def __init__(self, payload: dict[str, Any] | None) -> None:
        raw = payload if isinstance(payload, dict) else {}
        raw_tracks = raw.get("tracks", [])
        raw_upgrades = raw.get("upgrades", [])
        if not isinstance(raw_upgrades, list) or not raw_upgrades:
            raise DataError("upgrades.json 中必须包含非空的 upgrades 列表")
        if not isinstance(raw_tracks, list):
            raise DataError("upgrades.json 中的 tracks 必须是列表")

        self.tracks: list[Track] = self._parse_tracks(raw_tracks)
        if not self.tracks:
            raise DataError("upgrades.json 中必须包含至少一条加固线（tracks）")
        self._track_order = {track.track_id: index for index, track in enumerate(self.tracks)}
        self.upgrades: list[Upgrade] = self._parse_upgrades(raw_upgrades)
        self._by_id = {upgrade.upgrade_id: upgrade for upgrade in self.upgrades}
        self._validate_cross_references()

    # ------------------------------------------------------------------
    # 解析与校验
    # ------------------------------------------------------------------
    @staticmethod
    def _parse_tracks(raw_tracks: Iterable[Any]) -> list[Track]:
        tracks: list[Track] = []
        seen: set[str] = set()
        for item in raw_tracks:
            if not isinstance(item, dict):
                raise DataError("upgrades.json 中的每条加固线必须是 JSON 对象")
            track_id = str(item.get("id", "")).strip()
            if not track_id:
                raise DataError("加固线缺少 id")
            if track_id in seen:
                raise DataError(f"加固线 id 重复：{track_id}")
            seen.add(track_id)
            tracks.append(
                Track(
                    track_id=track_id,
                    name=str(item.get("name", track_id)),
                    tagline=str(item.get("tagline", "")),
                    description=str(item.get("description", "")),
                    color=str(item.get("color", DEFAULT_TRACK_COLOR)),
                )
            )
        return tracks

    def _parse_upgrades(self, raw_upgrades: Iterable[Any]) -> list[Upgrade]:
        upgrades: list[Upgrade] = []
        seen: set[str] = set()
        for item in raw_upgrades:
            if not isinstance(item, dict):
                raise DataError("upgrades.json 中的每个加固项目必须是 JSON 对象")
            upgrade_id = str(item.get("id", "")).strip()
            if not upgrade_id:
                raise DataError("加固项目缺少 id")
            if upgrade_id in seen:
                raise DataError(f"加固项目 id 重复：{upgrade_id}")
            seen.add(upgrade_id)
            try:
                tier = int(item.get("tier", 1))
                cost = int(item.get("cost", 0))
            except (TypeError, ValueError) as exc:
                raise DataError(f"加固项目 {upgrade_id} 的 tier/cost 必须是整数") from exc
            if tier < 1:
                raise DataError(f"加固项目 {upgrade_id} 的 tier 必须 >= 1")
            if cost < 0:
                raise DataError(f"加固项目 {upgrade_id} 的 cost 不能为负数")
            track = str(item.get("track", ""))
            if track not in self._track_order:
                raise DataError(f"加固项目 {upgrade_id} 引用了不存在的加固线：{track}")
            if not str(item.get("name", "")).strip():
                raise DataError(f"加固项目 {upgrade_id} 缺少名称")
            raw_effects = item.get("effects", {})
            if raw_effects is None:
                raw_effects = {}
            if not isinstance(raw_effects, dict):
                raise DataError(f"加固项目 {upgrade_id} 的 effects 必须是对象")
            effects: dict[str, float] = {}
            for key, value in raw_effects.items():
                if isinstance(value, bool):
                    effects[str(key)] = 1.0 if value else 0.0
                    continue
                try:
                    effects[str(key)] = float(value)
                except (TypeError, ValueError) as exc:
                    raise DataError(f"加固项目 {upgrade_id} 的效果 {key} 必须是数字") from exc
            upgrades.append(
                Upgrade(
                    upgrade_id=upgrade_id,
                    name=str(item.get("name", upgrade_id)),
                    track=track,
                    tier=tier,
                    cost=cost,
                    description=str(item.get("description", "")),
                    effects=effects,
                    requires=self._str_tuple(item.get("requires")),
                    requires_any=self._str_tuple(item.get("requires_any")),
                    excludes=self._str_tuple(item.get("excludes")),
                )
            )
        upgrades.sort(key=lambda upgrade: (self._track_order[upgrade.track], upgrade.tier))
        return upgrades

    @staticmethod
    def _str_tuple(value: Any) -> tuple[str, ...]:
        if not isinstance(value, (list, tuple)):
            return ()
        return tuple(str(item) for item in value if str(item))

    def _validate_cross_references(self) -> None:
        for upgrade in self.upgrades:
            for other_id in upgrade.requires + upgrade.requires_any + upgrade.excludes:
                if other_id == upgrade.upgrade_id:
                    raise DataError(f"加固项目 {upgrade.upgrade_id} 不能引用自身")
                if other_id not in self._by_id:
                    raise DataError(
                        f"加固项目 {upgrade.upgrade_id} 引用了不存在的加固项目：{other_id}"
                    )
            # 同层同线互斥必须对称，否则会造成单向锁定
            for other_id in upgrade.excludes:
                other = self._by_id[other_id]
                if upgrade.upgrade_id not in other.excludes:
                    other.excludes = other.excludes + (upgrade.upgrade_id,)

    # ------------------------------------------------------------------
    # 查询
    # ------------------------------------------------------------------
    def get(self, upgrade_id: str) -> Upgrade | None:
        return self._by_id.get(str(upgrade_id))

    def by_track(self) -> dict[str, list[Upgrade]]:
        grouped: dict[str, list[Upgrade]] = {track.track_id: [] for track in self.tracks}
        for upgrade in self.upgrades:
            grouped[upgrade.track].append(upgrade)
        return grouped

    def check(self, upgrade: Upgrade, owned: Iterable[str]) -> tuple[bool, str]:
        """是否允许购买（不考虑资金）；返回 (是否可用, 不可用原因)。"""
        owned_set = {str(item) for item in owned}
        if upgrade.upgrade_id in owned_set:
            return False, "该加固项目已经启用"
        # 互斥优先于前置：已经选了另一条路的专精时，先说清楚“回不去了”
        conflicts = [self._by_id[item].name for item in upgrade.excludes if item in owned_set]
        if conflicts:
            return False, f"与已启用的「{'、'.join(conflicts)}」互斥，本局只能二选一"
        missing = [self._by_id[item].name for item in upgrade.requires if item not in owned_set]
        if missing:
            return False, f"需要先启用「{'、'.join(missing)}」"
        if upgrade.requires_any and not any(item in owned_set for item in upgrade.requires_any):
            return False, "需要先启用同线的第一层加固"
        return True, ""

    def locked_by_upgrade(self, upgrade: Upgrade, owned: Iterable[str]) -> Upgrade | None:
        """若被某个已启用项目互斥锁住，返回那个项目，便于界面提示。"""
        owned_set = {str(item) for item in owned}
        for other_id in upgrade.excludes:
            if other_id in owned_set:
                return self._by_id[other_id]
        return None

    def modifiers(self, owned: Iterable[str]) -> dict[str, float]:
        """把已启用项目的效果累加成一个扁平字典（布尔效果按“或”合并）。"""
        totals: dict[str, float] = {}
        for upgrade_id in sorted({str(item) for item in owned}):
            upgrade = self._by_id.get(upgrade_id)
            if upgrade is None:
                continue
            for key, value in upgrade.effects.items():
                if key == "ransom_mitigation":
                    totals[key] = max(totals.get(key, 0.0), 1.0 if value else 0.0)
                    continue
                totals[key] = totals.get(key, 0.0) + float(value)
        return totals

    def describe(self, upgrade: Upgrade) -> str:
        """返回“加固线 · 第 N 层”这样的说明，供界面与日志复用。"""
        track = next((item for item in self.tracks if item.track_id == upgrade.track), None)
        track_name = track.name if track else upgrade.track
        return f"{track_name} · 第 {upgrade.tier} 层"
