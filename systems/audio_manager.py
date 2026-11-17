# -*- coding: utf-8 -*-
"""程序化音效：不依赖任何外部音频文件。

用 Python 标准库生成短音调，交给 pygame.mixer 播放；
如果运行环境没有音频设备，则静默降级，不影响游戏。
"""

from __future__ import annotations

import array
import math
import random

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
                # ---- 动作音色（C1）：同一个“做对了”，听起来必须不一样 ----
                "investigate": self._tone([(1850, 0.015), (2150, 0.015), (1180, 0.06)], 0.09),
                "isolate": self._mixed(
                    [("noise", 2400.0, 0.05, 0.16)],
                    [("sweep", 320.0, 110.0, 0.20, 0.20)],
                ),
                "restore": self._mixed(
                    [("sweep", 180.0, 560.0, 0.24, 0.16)],
                    [("tone", 880.0, 0.09, 0.07)],
                ),
                "clean": self._mixed(
                    [("sweep", 700.0, 1500.0, 0.18, 0.09)],
                    [("tone", 1500.0, 0.06, 0.06)],
                ),
                "patch": self._mixed(
                    [("noise", 2000.0, 0.03, 0.10), ("noise", 2000.0, 0.03, 0.10)],
                    [("tone", 440.0, 0.13, 0.09)],
                ),
                "block": self._mixed(
                    [("noise", 900.0, 0.07, 0.12)],
                    [("tone", 120.0, 0.13, 0.20)],
                ),
                "backup": self._tone([(220, 0.18), (660, 0.08), (880, 0.08)], 0.08),
                "powerdown": self._mixed(
                    [("sweep", 420.0, 60.0, 0.30, 0.16)],
                    [("noise", 700.0, 0.09, 0.08)],
                ),
                "powerup": self._sweep(70.0, 460.0, 0.34, 0.13),
                "mail": self._mixed([("noise", 1400.0, 0.04, 0.10), ("noise", 1200.0, 0.04, 0.08)], []),
                "reset": self._mixed(
                    [("noise", 2400.0, 0.012, 0.06) for _ in range(3)],
                    [("tone", 990.0, 0.07, 0.06)],
                ),
                "deny": self._tone([(300, 0.10), (200, 0.14)], 0.13),
            }
            self.ambient = self._ambient()
            self.ambient_channel: pygame.mixer.Channel | None = None
            self.enabled = True
        except (pygame.error, OSError):
            self.enabled = False
            self.ambient = None
            self.ambient_channel = None

    # ------------------------------------------------------------------
    def _ambient(self) -> pygame.mixer.Sound:
        """4 秒低频值班室底噪，循环播放；音量很低，不盖过提示音。"""
        duration = 4.0
        count = int(_SAMPLE_RATE * duration)
        data = array.array("h")
        for index in range(count):
            t = index / _SAMPLE_RATE
            sample = (
                0.42 * math.sin(2.0 * math.pi * 55.0 * t)
                + 0.20 * math.sin(2.0 * math.pi * 110.0 * t)
                + 0.06 * math.sin(2.0 * math.pi * 220.0 * t)
            )
            data.append(int(32767 * 0.035 * sample))
        sound = pygame.mixer.Sound(buffer=data.tobytes())
        sound.set_volume(0.18)
        return sound

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

    # ------------------------------------------------------------------
    # C1 动作音色：在上面这套正弦音之外，补上噪声与滑音，才有“手感”
    # ------------------------------------------------------------------
    def _sweep(self, start: float, end: float, duration: float, volume: float) -> pygame.mixer.Sound:
        return self._render([(0.0, "sweep", start, end, duration, volume)])

    def _mixed(self, lead: list[tuple], body: list[tuple]) -> pygame.mixer.Sound:
        """lead 先响（错开 30ms），body 从 50ms 起叠上去。

        例：隔离 = 一记机械咔哒（噪声）压着一段断电下行（滑音）。
        """
        events: list[tuple] = []
        delay = 0.0
        for part in lead:
            events.append((delay, *part))
            delay += 0.03
        delay = 0.05
        for part in body:
            events.append((delay, *part))
            delay += 0.03
        return self._render(events)

    def _render(self, events: list[tuple]) -> pygame.mixer.Sound:
        duration = 0.02
        for delay, kind, *params in events:
            length = {"tone": params[1], "sweep": params[2], "noise": params[2]}[kind]
            duration = max(duration, delay + float(length))
        count = int(_SAMPLE_RATE * duration) + 1
        samples = [0.0] * count
        for delay, kind, *params in events:
            start = int(_SAMPLE_RATE * delay)
            if kind == "tone":
                frequency, length, volume = params
                size = int(_SAMPLE_RATE * length)
                for index in range(size):
                    envelope = min(1.0, index / 200.0, max(0.0, (size - index) / 200.0))
                    samples[start + index] += (
                        volume * envelope * math.sin(2.0 * math.pi * frequency * index / _SAMPLE_RATE)
                    )
            elif kind == "sweep":
                begin, end, length, volume = params
                size = int(_SAMPLE_RATE * length)
                phase = 0.0
                for index in range(size):
                    frequency = begin + (end - begin) * (index / max(1, size))
                    phase += 2.0 * math.pi * frequency / _SAMPLE_RATE
                    envelope = min(1.0, index / 240.0, max(0.0, (size - index) / 240.0))
                    samples[start + index] += volume * envelope * math.sin(phase)
            else:  # noise：一阶低通，听起来不是白噪声而是“咔哒/纸张”
                cutoff_hint, length, volume = params
                size = int(_SAMPLE_RATE * length)
                alpha = max(0.02, min(0.9, 420.0 / max(120.0, cutoff_hint)))
                last = 0.0
                for index in range(size):
                    decay = 1.0 - index / max(1, size)
                    last += alpha * (random.uniform(-1.0, 1.0) - last)
                    samples[start + index] += volume * decay * decay * last
        data = array.array("h")
        for value in samples:
            data.append(max(-32767, min(32767, int(32767 * value))))
        return pygame.mixer.Sound(buffer=data.tobytes())

    def play_ambient(self) -> None:
        if not self.enabled or self.ambient is None or self.muted:
            return
        try:
            if self.ambient_channel is None or not self.ambient_channel.get_busy():
                self.ambient_channel = self.ambient.play(loops=-1)
                if self.ambient_channel is not None:
                    self.ambient_channel.set_volume(0.18)
        except pygame.error:
            pass

    def stop_ambient(self) -> None:
        if self.ambient_channel is not None:
            try:
                self.ambient_channel.stop()
            except pygame.error:
                pass

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
        if self.ambient_channel is not None:
            try:
                self.ambient_channel.set_volume(0.0 if self.muted else 0.18)
            except pygame.error:
                pass
        if not self.muted:
            self.play_ambient()
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
