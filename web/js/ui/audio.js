/* 程序化音效：WebAudio 合成，不加载任何音频文件。
 * 浏览器的自动播放策略要求先有一次用户手势；main.js 会负责初始化。
 * iOS/Safari 上 AudioContext 可能以 suspended 状态创建，所以每次播放前都尝试 resume。
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.analyser = null;
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
      if (!this.ctx) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return null;
        try {
          this.ctx = new Ctx();
          this.master = this.ctx.createGain();
          this.master.gain.value = this.muted ? 0 : 0.6;
          this.master.connect(this.ctx.destination);

          // 只用于自检/调试：不参与声音输出
          this.analyser = this.ctx.createAnalyser();
          this.analyser.fftSize = 1024;
          this.master.connect(this.analyser);
        } catch (error) {
          this.ctx = null;
          this.master = null;
          return null;
        }
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    get ready() {
      return Boolean(this.ctx && this.ctx.state === 'running');
    }

    get stateText() {
      return this.muted ? '音效已关闭' : '音效开启';
    }

    /** 播放一个短音，返回 Promise（便于测试等待真正出声）。 */
    play(name) {
      const ctx = this.ensure();
      if (!ctx || this.muted) return Promise.resolve(false);
      const run = () => {
        try {
          this.schedule(name);
          return true;
        } catch (error) {
          return false;
        }
      };
      if (ctx.state === 'suspended') {
        return ctx.resume().then(run).catch(() => false);
      }
      return Promise.resolve(run());
    }

    toggleMute() {
      this.muted = !this.muted;
      try {
        global.localStorage.setItem(this.mutedKey, this.muted ? '1' : '0');
      } catch (error) {
        // 忽略隐私模式下的写入失败
      }
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
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
      const peak = opts.gain === undefined ? 0.22 : opts.gain;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }

    schedule(name) {
      switch (name) {
        case 'click':
          this.tone(1320, 0.045, { type: 'triangle', gain: 0.18 });
          this.tone(880, 0.06, { type: 'triangle', gain: 0.1, delay: 0.02 });
          break;
        case 'key':
          // 终端按键：很短、很轻，避免连续输入时吵
          this.tone(1900 + Math.random() * 600, 0.014, { type: 'square', gain: 0.035 });
          break;
        case 'boot':
          // 终端接入：短促的低频上行，像老式终端通电
          this.tone(180, 0.14, { type: 'sine', gain: 0.09 });
          this.tone(540, 0.1, { type: 'triangle', gain: 0.06, delay: 0.05 });
          this.tone(1080, 0.08, { type: 'sine', gain: 0.04, delay: 0.12 });
          break;
        case 'alert':
          this.tone(880, 0.11, { type: 'square', gain: 0.2 });
          this.tone(660, 0.16, { type: 'square', gain: 0.18, delay: 0.14 });
          break;
        case 'success':
          [523.25, 659.25, 783.99].forEach((freq, index) => {
            this.tone(freq, 0.2, { type: 'triangle', gain: 0.26, delay: index * 0.07 });
          });
          break;
        case 'fail':
          this.tone(320, 0.32, { type: 'sawtooth', gain: 0.22, slideTo: 110 });
          break;
        case 'warn':
          this.tone(300, 0.16, { type: 'square', gain: 0.16 });
          this.tone(240, 0.2, { type: 'square', gain: 0.14, delay: 0.12 });
          break;
        case 'turn':
          this.tone(392, 0.12, { type: 'sine', gain: 0.18 });
          this.tone(523.25, 0.16, { type: 'sine', gain: 0.16, delay: 0.1 });
          break;
        case 'upgrade':
          [392, 523.25, 659.25, 987.77].forEach((freq, index) => {
            this.tone(freq, 0.22, { type: 'sine', gain: 0.22, delay: index * 0.06 });
          });
          break;
        case 'combo':
          [660, 880, 1320].forEach((freq, index) => {
            this.tone(freq, 0.16, { type: 'square', gain: 0.14, delay: index * 0.05 });
          });
          break;
        default:
          this.tone(720, 0.06, { type: 'sine', gain: 0.12 });
      }
    }

    /** 一段更长的测试音，用来让玩家确认浏览器没有静音。 */
    soundTest() {
      this.ensure();
      if (this.muted) this.muted = false;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(0.6, this.ctx.currentTime, 0.02);
      }
      return this.play('success');
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
      gain.gain.value = 0.05;
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
