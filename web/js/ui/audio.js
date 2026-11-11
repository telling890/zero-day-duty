/* 程序化音效：WebAudio 合成，不加载任何音频文件。
 * 浏览器的自动播放策略要求先有一次用户手势，main.js 会负责初始化。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
      this.ambient = null;
      this.mutedKey = 'zdd.muted';
      try {
        this.muted = global.localStorage.getItem(this.mutedKey) === '1';
      } catch (error) {
        this.muted = false;
      }
    }

    ensure() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
      }
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      try {
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.32;
        this.master.connect(this.ctx.destination);
      } catch (error) {
        this.ctx = null;
      }
      return this.ctx;
    }

    get stateText() {
      return this.muted ? '音效已关闭' : '音效开启';
    }

    toggleMute() {
      this.muted = !this.muted;
      try {
        global.localStorage.setItem(this.mutedKey, this.muted ? '1' : '0');
      } catch (error) {
        // 忽略隐私模式下的写入失败
      }
      if (this.master) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.32, this.ctx.currentTime, 0.02);
      }
      return this.muted;
    }

    tone(freq, duration, options) {
      if (!this.ctx || this.muted) return;
      const opts = options || {};
      const now = this.ctx.currentTime + (opts.delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, now);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), now + duration);
      const peak = opts.gain === undefined ? 0.16 : opts.gain;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    play(name) {
      if (!this.ctx || this.muted) return;
      switch (name) {
        case 'click':
          this.tone(1180, 0.05, { type: 'triangle', gain: 0.08 });
          break;
        case 'alert':
          this.tone(880, 0.12, { type: 'square', gain: 0.09 });
          this.tone(660, 0.16, { type: 'square', gain: 0.08, delay: 0.13 });
          break;
        case 'success':
          [523.25, 659.25, 783.99].forEach((freq, index) => {
            this.tone(freq, 0.18, { type: 'triangle', gain: 0.12, delay: index * 0.07 });
          });
          break;
        case 'fail':
          this.tone(320, 0.35, { type: 'sawtooth', gain: 0.1, slideTo: 120 });
          break;
        case 'turn':
          this.tone(440, 0.1, { type: 'sine', gain: 0.07 });
          this.tone(330, 0.14, { type: 'sine', gain: 0.05, delay: 0.08 });
          break;
        case 'upgrade':
          [392, 523.25, 659.25, 987.77].forEach((freq, index) => {
            this.tone(freq, 0.2, { type: 'sine', gain: 0.1, delay: index * 0.06 });
          });
          break;
        case 'combo':
          [660, 880, 1320].forEach((freq, index) => {
            this.tone(freq, 0.14, { type: 'square', gain: 0.07, delay: index * 0.05 });
          });
          break;
        default:
          this.tone(720, 0.06, { type: 'sine', gain: 0.06 });
      }
    }

    /** 低频环境底噪：程序化噪声 + 低通，音量很低。 */
    playAmbient() {
      if (!this.ctx || this.ambient || this.muted) return;
      const ctx = this.ctx;
      const seconds = 2;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0.035;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start();
      this.ambient = { source, gain, filter };
    }

    stopAmbient() {
      if (!this.ambient) return;
      try {
        this.ambient.source.stop();
      } catch (error) {
        // 已经停止
      }
      this.ambient = null;
    }
  }

  ZDD.AudioManager = AudioManager;
})(typeof globalThis !== 'undefined' ? globalThis : this);
