# -*- coding: utf-8 -*-
"""界面特效层：浮动数字、告警横幅、连击提示与屏幕闪光。

这些效果只影响观感，不参与游戏判定；所有状态都由 Game 主动推送。
"""

from __future__ import annotations

from dataclasses import dataclass
import math
import random as _random

import pygame

import settings
from ui import draw_utils


@dataclass
class Floater:
    text: str
    color: tuple[int, int, int]
    x: float
    y: float
    life: float
    total: float
    vy: float = -24.0


@dataclass
class Banner:
    title: str
    detail: str
    color: tuple[int, int, int]
    life: float
    total: float


@dataclass
class Feedback:
    title: str
    detail: str
    color: tuple[int, int, int]
    stage: str
    correct: bool
    life: float
    total: float


@dataclass
class Particle:
    x: float
    y: float
    vx: float
    vy: float
    life: float
    total: float
    color: tuple[int, int, int]
    size: int


class EffectsManager:
    def __init__(self) -> None:
        self.floaters: list[Floater] = []
        self.banners: list[Banner] = []
        self.particles: list[Particle] = []
        self.combo_text = ""
        self.combo_color = settings.ACCENT
        self.combo_life = 0.0
        self.combo_total = 1.0
        self.flash_color = settings.RED
        self.flash_alpha = 0.0
        self._floater_serial = 0
        self.feedback: Feedback | None = None

    # ------------------------------------------------------------------
    def show_feedback(
        self,
        title: str,
        detail: str,
        *,
        color: tuple[int, int, int] = settings.GREEN,
        stage: str = "",
        correct: bool = True,
        duration: float = 3.2,
    ) -> None:
        """操作面板上方“正确/注意”反馈卡：让玩家清楚知道刚才为什么对。"""
        self.feedback = Feedback(
            title=title,
            detail=detail,
            color=color,
            stage=stage,
            correct=correct,
            life=duration,
            total=duration,
        )

    # ------------------------------------------------------------------
    def add_floater(
        self,
        text: str,
        color: tuple[int, int, int],
        pos: tuple[int, int] | None = None,
        *,
        duration: float = 1.1,
    ) -> None:
        self._floater_serial += 1
        if pos is None:
            pos = (settings.SCREEN_WIDTH - 190 - (self._floater_serial % 4) * 24, 92)
        self.floaters.append(
            Floater(text=text, color=color, x=float(pos[0]), y=float(pos[1]), life=duration, total=duration)
        )
        if len(self.floaters) > 18:
            self.floaters = self.floaters[-18:]

    def add_banner(self, title: str, detail: str, color: tuple[int, int, int]) -> None:
        # 只保留最新一条，避免连续告警把屏幕盖满
        self.banners = [Banner(title=title, detail=detail, color=color, life=2.2, total=2.2)]

    def add_combo(self, text: str, color: tuple[int, int, int] = settings.ACCENT) -> None:
        self.combo_text = text
        self.combo_color = color
        self.combo_life = 1.2
        self.combo_total = 1.2

    def flash(self, color: tuple[int, int, int], strength: int = 60) -> None:
        self.flash_color = color
        self.flash_alpha = max(self.flash_alpha, float(strength))

    def add_burst(
        self,
        pos: tuple[int, int],
        color: tuple[int, int, int],
        count: int = 14,
    ) -> None:
        rng = _random.Random((pos[0] * 31 + pos[1] * 17 + count) & 0xFFFF)
        for _ in range(count):
            angle = rng.uniform(0, math.pi * 2)
            speed = rng.uniform(40, 150)
            life = rng.uniform(0.35, 0.8)
            self.particles.append(
                Particle(
                    x=float(pos[0]),
                    y=float(pos[1]),
                    vx=math.cos(angle) * speed,
                    vy=math.sin(angle) * speed,
                    life=life,
                    total=life,
                    color=color,
                    size=rng.randint(2, 4),
                )
            )
        if len(self.particles) > 120:
            self.particles = self.particles[-120:]

    # ------------------------------------------------------------------
    def update(self, dt: float) -> None:
        survivors: list[Floater] = []
        for floater in self.floaters:
            floater.life -= dt
            floater.y += floater.vy * dt
            if floater.life > 0:
                survivors.append(floater)
        self.floaters = survivors

        particles: list[Particle] = []
        for particle in self.particles:
            particle.life -= dt
            particle.x += particle.vx * dt
            particle.y += particle.vy * dt
            particle.vy += 90 * dt
            if particle.life > 0:
                particles.append(particle)
        self.particles = particles

        banners: list[Banner] = []
        for banner in self.banners:
            banner.life -= dt
            if banner.life > 0:
                banners.append(banner)
        self.banners = banners

        if self.combo_life > 0:
            self.combo_life = max(0.0, self.combo_life - dt)
        if self.feedback is not None:
            self.feedback.life -= dt
            if self.feedback.life <= 0:
                self.feedback = None
        if self.flash_alpha > 0:
            self.flash_alpha = max(0.0, self.flash_alpha - dt * 180)

    # ------------------------------------------------------------------
    def draw(self, surface: pygame.Surface) -> None:
        if self.flash_alpha > 0:
            overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
            overlay.fill((*self.flash_color, int(min(110, self.flash_alpha))))
            surface.blit(overlay, (0, 0))

        self._draw_banners(surface)
        self._draw_particles(surface)
        self._draw_floaters(surface)
        self._draw_combo(surface)
        self._draw_feedback(surface)

    def _draw_feedback(self, surface: pygame.Surface) -> None:
        feedback = self.feedback
        if feedback is None:
            return
        progress = 1.0 - feedback.life / feedback.total
        alpha = 255
        if feedback.life < 0.55:
            alpha = int(255 * feedback.life / 0.55)
        title = feedback.title
        font = draw_utils.get_font(34, True)
        text = font.render(title, True, feedback.color)
        text.set_alpha(alpha)
        x = settings.SCREEN_WIDTH // 2 - text.get_width() // 2
        y = settings.SCREEN_HEIGHT // 2 - text.get_height() // 2 - int(progress * 24)
        # 只保留一句结果，不加底板、不加边框；用深色描边保证在复杂背景上可读。
        shadow = font.render(title, True, (3, 7, 10))
        shadow.set_alpha(int(alpha * 0.8))
        for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            surface.blit(shadow, (x + dx, y + dy))
        surface.blit(text, (x, y))

    def _draw_particles(self, surface: pygame.Surface) -> None:
        for particle in self.particles:
            alpha = int(255 * max(0.0, particle.life / particle.total))
            color = (*particle.color, alpha)
            layer = pygame.Surface((particle.size * 2, particle.size * 2), pygame.SRCALPHA)
            pygame.draw.circle(layer, color, (particle.size, particle.size), particle.size)
            surface.blit(layer, (int(particle.x), int(particle.y)))

    def _draw_banners(self, surface: pygame.Surface) -> None:
        for index, banner in enumerate(reversed(self.banners)):
            progress = 1.0 - banner.life / banner.total
            slide = min(1.0, progress * 6.0)
            alpha = 255
            if banner.life < 0.5:
                alpha = int(255 * banner.life / 0.5)
            font = draw_utils.get_font(settings.FONT_SMALL, True)
            detail_font = draw_utils.get_font(10)
            width = max(
                320,
                min(560, max(font.size(banner.title)[0], detail_font.size(banner.detail)[0]) + 54),
            )
            height = 40
            x = 18
            y = int(560 - (1.0 - slide) * 34)
            panel = pygame.Surface((width, height), pygame.SRCALPHA)
            pygame.draw.rect(panel, (10, 16, 24, min(alpha, 225)), panel.get_rect(), border_radius=8)
            pygame.draw.rect(panel, (*banner.color, alpha), panel.get_rect(), 1, border_radius=8)
            pygame.draw.rect(panel, (*banner.color, alpha), (0, 0, 5, height), border_radius=3)
            title_surface = font.render(banner.title, True, (*banner.color, alpha))
            detail_surface = detail_font.render(banner.detail, True, settings.TEXT_DIM)
            panel.blit(title_surface, (18, 3))
            panel.blit(detail_surface, (18, 21))
            surface.blit(panel, (x, y))

    def _draw_floaters(self, surface: pygame.Surface) -> None:
        font = draw_utils.get_font(settings.FONT_SMALL, True)
        for floater in self.floaters:
            alpha = int(255 * min(1.0, floater.life / (floater.total * 0.7)))
            image = font.render(floater.text, True, floater.color)
            image.set_alpha(alpha)
            surface.blit(image, (int(floater.x), int(floater.y)))

    def _draw_combo(self, surface: pygame.Surface) -> None:
        if self.combo_life <= 0:
            return
        progress = 1.0 - self.combo_life / self.combo_total
        scale = 1.0 + 0.25 * max(0.0, 0.25 - progress)
        font = draw_utils.get_font(int(38 * scale), True)
        alpha = int(255 * min(1.0, self.combo_life / 0.5))
        image = font.render(self.combo_text, True, self.combo_color)
        image.set_alpha(alpha)
        x = settings.SCREEN_WIDTH // 2 - image.get_width() // 2
        y = 236 - int(progress * 22)
        shadow = font.render(self.combo_text, True, (0, 0, 0))
        shadow.set_alpha(alpha // 2)
        surface.blit(shadow, (x + 2, y + 2))
        surface.blit(image, (x, y))
