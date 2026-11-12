# -*- coding: utf-8 -*-
"""结算、评分与结局判定。"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import settings


@dataclass
class ScoreReport:
    score: int
    grade: str
    ending_key: str
    ending_title: str
    ending_text: str
    style: str
    style_comment: str
    stats: list[tuple[str, str]] = field(default_factory=list)
    achievements: list[str] = field(default_factory=list)
    news_headline: str = ""
    news_detail: str = ""
    doctrine: str = "混合型"
    timeline: list[dict[str, Any]] = field(default_factory=list)
    review: dict[str, Any] = field(default_factory=dict)


ENDINGS = {
    "perfect": (
        "完美防守",
        "所有真实威胁都在造成重大损失前被阻断，公司平安度过这个夜班。\n"
        "没有误封，没有数据外泄，值班记录干净得像一份教学范例。",
    ),
    "costly": (
        "成功但损失严重",
        "危机最终被控制，但数据、声誉或资金付出了明显代价。\n"
        "公司还在运转，只是这份值班报告不太适合在晨会上展示。",
    ),
    "data_leak": (
        "数据泄露",
        "核心数据已经外泄或被破坏，监管通报与客户索赔接踵而至。\n"
        "止损做得再快，也无法当作什么都没发生。",
    ),
    "over_defense": (
        "过度防御导致业务崩溃",
        "为了阻断攻击，你关闭或隔离了过多服务，业务连续性先于攻击崩溃。\n"
        "安全的目标是让业务安全地运行，而不是让业务停止运行。",
    ),
    "security_breach": (
        "安全体系崩溃",
        "安全度归零，告警、身份与边界控制全面失效。\n"
        "这不是某一次操作的失误，而是整晚响应节奏的累积结果。",
    ),
    "ransomware": (
        "模拟勒索软件失控",
        "勒索软件完成了对核心数据的模拟加密，且备份未能救场。\n"
        "业务恢复时间无法估算，这将是公司历史上最长的一个夜晚。",
    ),
}

STYLE_COMMENTS = {
    "激进隔离型": "你倾向于先隔离再调查，响应果断，但误封会伤害正常业务与声誉。",
    "反应迟缓型": "你花了较多回合才处理真实威胁，攻击链因此进入了更深的阶段。",
    "精准快速型": "你几乎在第一时间锁定并阻断了威胁，调查与处置的节奏非常干净。",
    "资源透支型": "你有效控制了风险，但资金消耗过大，后续运营压力明显。",
    "稳健均衡型": "你在安全、业务与成本之间保持了相对均衡，属于可持续的值班风格。",
    "善后不足型": "你成功压制了攻击，但把清除根因留到了最后；控制不等于解决。",
}


class ScoreSystem:
    """根据结算数据计算分数、等级、结局与风格评价。"""

    GRADE_THRESHOLDS = ((98, "S"), (82, "A"), (66, "B"), (48, "C"), (0, "D"))

    def evaluate(self, summary: dict[str, Any]) -> ScoreReport:
        ending_key = self._choose_ending(summary)
        ending_title, ending_text = ENDINGS[ending_key]
        score = self._score(summary)
        grade = self._cap_grade(self._grade(score), ending_key)
        style = self._style(summary)
        stats = self._stats(summary)
        news_headline, news_detail = self._news(summary, ending_key)
        return ScoreReport(
            score=score,
            grade=grade,
            ending_key=ending_key,
            ending_title=ending_title,
            ending_text=ending_text,
            style=style,
            style_comment=STYLE_COMMENTS.get(style, ""),
            stats=stats,
            achievements=self._achievements(summary, ending_key),
            news_headline=news_headline,
            news_detail=news_detail,
            doctrine=str(summary.get("doctrine", "混合型")),
            timeline=list(summary.get("timeline", [])),
            review=self._review(summary),
        )

    def _review(self, summary: dict[str, Any]) -> dict[str, Any]:
        """从真实记录的时间线提取复盘，不按最终分数反推。"""
        timeline = [item for item in summary.get("timeline", []) if isinstance(item, dict)]
        dangerous = summary.get("dangerous_event") or {}
        correct = None
        if dangerous.get("name"):
            for item in timeline:
                if item.get("kind") == "eradicate" and dangerous.get("name") in str(item.get("text", "")):
                    correct = item
                    break
        if correct is None:
            correct = next((item for item in timeline if item.get("kind") == "eradicate"), None)
        if correct is None:
            correct = next((item for item in timeline if item.get("kind") == "contain"), None)
        if correct is None:
            correct = next((item for item in timeline if item.get("kind") == "investigate"), None)
        mistake = next(
            (item for item in timeline if item.get("kind") in ("false_isolation", "mistake")),
            None,
        )
        if mistake is None:
            missed_names = [str(name) for name in summary.get("missed_names", []) if name]
            if missed_names:
                mistake = {
                    "text": f"漏掉未处置的真实攻击：{'、'.join(missed_names[:3])}",
                }
            elif summary.get("data_leak"):
                mistake = {"text": "关键攻击链在最终阶段前没有被彻底清除，导致数据泄露。"}
        delayed = [
            item for item in timeline
            if item.get("kind") == "delayed"
            and isinstance(item.get("effects"), dict)
            and any(int(value) < 0 for value in item["effects"].values())
        ]
        return {
            "key_correct": str(correct.get("text", "")) if correct else "本局没有可确认的关键正确处置。",
            "key_mistake": str(mistake.get("text", "")) if mistake else "未发生误封或无效操作。",
            "invalid_actions": int(summary.get("invalid_actions", 0)),
            "false_isolation_loss": int(summary.get("false_isolation_loss", 0)),
            "dangerous_event": dangerous,
            "delayed": delayed,
            "doctrine": str(summary.get("doctrine", "混合型")),
        }

    def _achievements(self, summary: dict[str, Any], ending_key: str) -> list[str]:
        achievements: list[str] = []
        if ending_key == "perfect":
            achievements.append("完美防守")
        if int(summary.get("false_isolations", 0)) == 0:
            achievements.append("零误封")
        if int(summary.get("identified", 0)) >= int(summary.get("total_events", 1)) > 0:
            achievements.append("情报闭环")
        if int(summary.get("best_combo", 0)) >= 3:
            achievements.append("连击大师")
        average = float(summary.get("average_response", 0.0))
        if 0 < average <= 1.0 and int(summary.get("resolved", 0)) > 0:
            achievements.append("闪电响应")
        if int(summary.get("funds", 0)) >= 1000:
            achievements.append("预算管家")
        return achievements[:5]

    # ------------------------------------------------------------------
    def _choose_ending(self, summary: dict[str, Any]) -> str:
        reason = summary.get("reason", "time")
        if reason == "security":
            return "security_breach"
        if reason == "availability":
            return "over_defense"
        if reason == "integrity":
            return "data_leak"
        if reason == "ransomware":
            return "ransomware"
        if reason == "data_leak":
            return "data_leak"
        if summary.get("ransomware_failed"):
            return "ransomware"
        if summary.get("security_breach"):
            return "security_breach"
        if summary.get("data_leak"):
            return "data_leak"
        total = int(summary.get("total_events", 0))
        resolved = int(summary.get("resolved", 0))
        controlled_only = int(summary.get("controlled_only", 0))
        perfect = (
            total > 0
            and resolved == total
            and controlled_only == 0
            and int(summary.get("integrity", 0)) >= 90
            and int(summary.get("security", 0)) >= 60
            and int(summary.get("availability", 0)) >= 80
            and int(summary.get("false_isolations", 0)) == 0
        )
        return "perfect" if perfect else "costly"

    def _score(self, summary: dict[str, Any]) -> int:
        security = int(summary.get("security", 0))
        integrity = int(summary.get("integrity", 0))
        reputation = int(summary.get("reputation", 0))
        availability = int(summary.get("availability", 0))
        funds = int(summary.get("funds", 0))
        total = max(1, int(summary.get("total_events", 0)))
        resolved = int(summary.get("resolved", 0))
        controlled_only = int(summary.get("controlled_only", 0))
        checked = int(summary.get("false_positives_checked", 0))
        false_isolations = int(summary.get("false_isolations", 0))
        missed = int(summary.get("missed", 0))

        funds_ratio = min(funds, 1200) / 1200 * 100
        score = (
            security * 0.22
            + integrity * 0.25
            + reputation * 0.12
            + availability * 0.20
            + funds_ratio * 0.08
        )
        score += (resolved + controlled_only * 0.35) / total * 18
        score += checked * 2
        score += int(summary.get("best_combo", 0)) * 3
        score -= false_isolations * 12
        score -= missed * 15
        score -= controlled_only * 2
        return int(max(0, min(130, round(score))))

    def _grade(self, score: int) -> str:
        for threshold, grade in self.GRADE_THRESHOLDS:
            if score >= threshold:
                return grade
        return "D"

    def _cap_grade(self, grade: str, ending_key: str) -> str:
        """危险结局不能拿高等级：S 只属于完美防守。"""
        ranks = {"S": 0, "A": 1, "B": 2, "C": 3, "D": 4}
        caps = {
            "perfect": "S",
            "costly": "A",
            "data_leak": "C",
            "over_defense": "C",
            "ransomware": "D",
            "security_breach": "D",
        }
        cap = caps.get(ending_key, "D")
        return grade if ranks.get(grade, 4) >= ranks[cap] else cap

    def _style(self, summary: dict[str, Any]) -> str:
        if int(summary.get("false_isolations", 0)) >= 2:
            return "激进隔离型"
        if int(summary.get("controlled_only", 0)) >= 2:
            return "善后不足型"
        if int(summary.get("missed", 0)) >= 1:
            return "反应迟缓型"
        average = float(summary.get("average_response", 0.0))
        if (
            average > 0
            and average <= 1.5
            and int(summary.get("resolved", 0)) >= int(summary.get("total_events", 0)) > 0
        ):
            return "精准快速型"
        if int(summary.get("funds", 0)) <= 200:
            return "资源透支型"
        return "稳健均衡型"

    def _news(self, summary: dict[str, Any], ending_key: str) -> tuple[str, str]:
        """结算页的“早间新闻”，让结局落到具体叙事里。"""
        company = "云栖示例科技"
        controlled = int(summary.get("controlled_only", 0))
        headlines = {
            "perfect": f"{company}夜班零事故，客户称“完全没感觉到攻击”",
            "costly": f"{company}凌晨经历服务抖动，早间已恢复",
            "data_leak": f"{company}疑似客户数据外泄，监管已介入",
            "over_defense": f"为防攻击全面停服，{company}早间遭客户投诉",
            "security_breach": f"{company}安全体系失守，早会紧急取消",
            "ransomware": f"{company}核心数据被加密，恢复时间未定",
        }
        details = {
            "perfect": "安全团队在 08:00 前清除全部攻击链，官网与下单服务始终保持在线。",
            "costly": "威胁已被压制，但服务降级、声誉损失与善后成本写进了今早的复盘报告。",
            "data_leak": "凌晨的异常外联没有被及时切断，客户名单出现在不该出现的地方。",
            "over_defense": "攻击没有击垮业务，连续的隔离与停服先让下单服务崩溃了。",
            "security_breach": "身份与边界控制全面失效，值班记录被移交到应急委员会。",
            "ransomware": "备份未能及时保护，核心数据库被模拟加密，恢复窗口仍未知。",
        }
        headline = headlines.get(ending_key, f"{company}经历了一个不平静的夜班")
        detail = details.get(ending_key, "")
        if controlled:
            detail += f" 另有 {controlled} 条攻击链只完成控制、未清除根因。"
        return headline, detail

    def _stats(self, summary: dict[str, Any]) -> list[tuple[str, str]]:
        total = int(summary.get("total_events", 0))
        identified = int(summary.get("identified", 0))
        resolved = int(summary.get("resolved", 0))
        controlled_only = int(summary.get("controlled_only", 0))
        average = float(summary.get("average_response", 0.0))
        avg_text = f"{average:.1f} 回合" if average > 0 else "—"
        checked = int(summary.get("false_positives_checked", 0))
        seen = int(summary.get("false_positives_seen", 0))
        return [
            ("正确识别事件", f"{identified} / {total}"),
            ("彻底清除事件", f"{resolved} / {total}"),
            ("仅控制未清除", f"{controlled_only} 个"),
            ("漏掉的真实威胁", f"{int(summary.get('missed', 0))} 个"),
            ("误报告警处理", f"{checked} / {seen}"),
            ("误封次数", f"{int(summary.get('false_isolations', 0))} 次"),
            ("平均响应回合", avg_text),
            ("最终资金", settings.format_money(int(summary.get("funds", 0)))),
            ("最终可用性", f"{int(summary.get('availability', 0))}%"),
            ("最终数据完整度", f"{int(summary.get('integrity', 0))}%"),
            ("剩余安全度", f"{int(summary.get('security', 0))}%"),
            ("最高连击", f"×{int(summary.get('best_combo', 0))}"),
        ]
