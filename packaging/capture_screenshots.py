# -*- coding: utf-8 -*-
"""重新生成 assets/screenshots/*.png（README 与项目主页用）。

用法（在项目根目录）：
    py -3.10 packaging/capture_screenshots.py

无窗口运行（SDL dummy），只依赖仓库里的真实游戏逻辑；
每个场景都从新的一局开始，保证截图可复现（固定种子 2024）。
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pygame  # noqa: E402

import settings  # noqa: E402
from game import Game  # noqa: E402
from ui import draw_utils  # noqa: E402

OUT = ROOT / "assets" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

SCREEN: pygame.Surface | None = None
_temps: list[tempfile.TemporaryDirectory] = []


def new_game(**kwargs) -> Game:
    temp = tempfile.TemporaryDirectory()
    _temps.append(temp)
    root = Path(temp.name)
    game = Game(
        SCREEN,  # type: ignore[arg-type]
        seed=2024,
        save_path=root / "savegame.json",
        history_path=root / "history.json",
    )
    if kwargs.get("menu"):
        return game
    game.new_game(**{k: v for k, v in kwargs.items() if k != "menu"})
    return game


def click(game: Game, pos: tuple[int, int]) -> None:
    for kind in (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP):
        game.handle_event(pygame.event.Event(kind, {"pos": pos, "button": 1}))


def action_button(game: Game, action_id: str):
    for button, option in game.action_panel.buttons:
        if option.action_id == action_id:
            return button
    return None


def shot(game: Game, name: str, advance: float = 0.016) -> None:
    game.update(advance)
    # 截图不保留临时浮层（新告警横幅会压住左下角面板），其余界面照常
    game.effects.banners.clear()
    game.effects.combo_text = ""
    game.draw()
    pygame.image.save(SCREEN, str(OUT / f"{name}.png"))
    print(f"saved {name}.png")


def prepare() -> None:
    global SCREEN
    pygame.init()
    draw_utils.set_font_path(settings.find_chinese_font())
    SCREEN = pygame.display.set_mode(settings.SCREEN_SIZE)


def main() -> int:
    prepare()

    # 1. 主菜单
    menu_game = new_game(menu=True)
    shot(menu_game, "menu")

    # 2. 夜班简报
    briefing = new_game(briefing=True)
    shot(briefing, "briefing")

    # 3. 值班界面：选中告警并调查
    game = new_game()
    game.select_alert(game.events.alerts[0])
    game.update(0.016)
    investigate = action_button(game, "investigate")
    if investigate is not None:
        click(game, investigate.rect.center)
    shot(game, "gameplay")

    # 4. 操作反馈：现在就写在操作面板的提示行里
    game.update(0.016)
    delete_mail = action_button(game, "delete_mail")
    if delete_mail is not None:
        click(game, delete_mail.rect.center)
    # 让目标位置的浮动文字淡掉，只留下提示行里的结果
    shot(game, "feedback", advance=1.1)

    # 5. 值班简报（业务视图）：先隔离一台设备造成中断，再点空白回到总览
    services = new_game()
    services.select_device("BAK-01")
    services.action_panel.sync(services)
    isolate = action_button(services, "isolate")
    if isolate is not None:
        click(services, isolate.rect.center)
    services.clear_selection()
    shot(services, "services")

    # 6. 剧情决策：第 4 回合触发
    decision = new_game()
    decision.turn = 3
    decision.start_turn()
    shot(decision, "decision")

    # 7. 结算：把第一条链完整处置一遍再收工，数字才像一局真实的班
    result = new_game()
    result.select_alert(result.events.alerts[0])
    for action_id in ("investigate", "isolate"):
        result.action_panel.sync(result)
        button = action_button(result, action_id)
        if button is not None:
            click(result, button.rect.center)
    result.action_panel.sync(result)
    eradicate = action_button(result, "eradicate")
    if eradicate is not None:
        click(result, eradicate.rect.center)
    result.end_turn()
    result.end_turn()
    result.turn = settings.TOTAL_TURNS
    result.finish("time")
    shot(result, "result")

    # 8. 新手教程
    tutorial = new_game()
    tutorial.tutorial_screen.open()
    shot(tutorial, "tutorial")

    # 9. 教程带练：实战提示卡
    guide = new_game(tutorial=True)
    guide.tutorial_guide.reset()
    guide.update(0.016)
    shot(guide, "tutorial_guide")

    # 10. 安全加固
    upgrades = new_game()
    upgrades.shop.open()
    shot(upgrades, "upgrades")

    pygame.quit()
    for temp in _temps:
        temp.cleanup()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
