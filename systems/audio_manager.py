# -*- coding: utf-8 -*-
"""程序化音效：不依赖任何外部音频文件。

用 Python 标准库生成短音调，交给 pygame.mixer 播放；
如果运行环境没有音频设备，则静默降级，不影响游戏。
"""

from __future__ import annotations

import array
import math

import pygame

_SAMPLE_RATE = 44100
_audio: "AudioManager | None" = None


class AudioManager:
    def __init__(self) -> None:
        self.enabled = False
        self.muted = False
        self.sounds: dict[str, pygame.mixer.Sound] = {}
        try:
            if not pygame.mixer.get_init():
                pygame.mixer.init(frequency=_SAMPLE_RATE, size=-16, channels=1, buffer=512)
            self.sounds = {
                "click": self._tone([(880, 0.035)], 0.10),
                "alert": self._tone([(520, 0.09), (760, 0.10)], 0.16),
                "upgrade": self._tone([(660, 0.08), (880, 0.10), (1100, 0.12)], 0.14),
                "success": self._tone([(700, 0.07), (980, 0.11)], 0.13),
                "fail": self._tone([(300, 0.10), (220, 0.16)], 0.15),
                "turn": self._tone([(480, 0.09), (600, 0.09)], 0.10),
                "combo": self._tone([(880, 0.06), (1100, 0.07), (1320, 0.10)], 0.13),
            }
            self.enabled = True
        except (pygame.error, OSError):
            self.enabled = False

    # ------------------------------------------------------------------
    def _tone(self, notes: list[tuple[float, float]], volume: float) -> pygame.mixer.Sound:
        data = array.array("h")
        for frequency, duration in notes:
            count = max(1, int(_SAMPLE_RATE * duration))
            fade = max(1, min(240, count // 4))
            for index in range(count):
                if index < fade:
                    envelope = index / fade
                elif index > count - fade:
                    envelope = max(0.0, (count - index) / fade)
                else:
                    envelope = 1.0
                sample = math.sin(2.0 * math.pi * frequency * index / _SAMPLE_RATE)
                data.append(int(32767 * volume * envelope * sample))
        return pygame.mixer.Sound(buffer=data.tobytes())

    def play(self, name: str) -> None:
        if not self.enabled or self.muted:
            return
        sound = self.sounds.get(name)
        if sound is None:
            return
        try:
            sound.play()
        except pygame.error:
            pass

    def toggle_mute(self) -> bool:
        self.muted = not self.muted
        return self.muted

    @property
    def state_text(self) -> str:
        if not self.enabled:
            return "音效不可用"
        return "音效关" if self.muted else "音效开"


def get_audio() -> AudioManager:
    """延迟初始化，避免在 pygame.init() 之前创建 mixer。"""
    global _audio
    if _audio is None:
        _audio = AudioManager()
    return _audio
