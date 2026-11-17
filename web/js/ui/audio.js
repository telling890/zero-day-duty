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

    /** 一段短噪声：机械声、纸张声、继电器声都靠它起头。 */
    noise(duration, options) {
      if (!this.ctx || this.muted) return;
      const opts = options || {};
      const now = this.ctx.currentTime + (opts.delay || 0);
      const frames = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) {
        const decay = 1 - i / frames;
        data[i] = (Math.random() * 2 - 1) * decay * decay;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = opts.type || 'bandpass';
      filter.frequency.value = opts.freq || 1800;
      filter.Q.value = opts.q === undefined ? 0.9 : opts.q;
      const gain = this.ctx.createGain();
      gain.gain.value = opts.gain === undefined ? 0.12 : opts.gain;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.stop(now + duration + 0.02);
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
        // ---------------- 动作音色：同一个“对了”，听起来必须不一样 ----------------
        case 'investigate':
          // 调查：键盘两下 + 一声“看清了”的上行短音
          this.noise(0.014, { freq: 2600, gain: 0.07 });
          this.noise(0.014, { freq: 2200, gain: 0.06, delay: 0.055 });
          this.tone(1180, 0.06, { type: 'triangle', gain: 0.08, delay: 0.11 });
          break;
        case 'isolate':
          // 隔离：机械咔哒 + 断电下行
          this.noise(0.05, { freq: 2400, gain: 0.16, q: 1.2 });
          this.tone(300, 0.2, { type: 'sine', gain: 0.2, slideTo: 110 });
          this.tone(90, 0.16, { type: 'triangle', gain: 0.12, delay: 0.04 });
          break;
        case 'restore':
          // 恢复：电流回升 + 继电器接合
          this.tone(180, 0.24, { type: 'sine', gain: 0.16, slideTo: 560 });
          this.noise(0.026, { freq: 3000, gain: 0.09, delay: 0.18 });
          this.tone(880, 0.09, { type: 'triangle', gain: 0.07, delay: 0.2 });
          break;
        case 'clean':
          // 清除：扫频 + 落定
          this.tone(700, 0.18, { type: 'sawtooth', gain: 0.07, slideTo: 1500 });
          this.tone(1500, 0.06, { type: 'triangle', gain: 0.06, delay: 0.18 });
          break;
        case 'patch':
          // 补丁：两下卡扣 + 低频确认
          this.noise(0.03, { freq: 2000, gain: 0.1 });
          this.noise(0.03, { freq: 2000, gain: 0.1, delay: 0.07 });
          this.tone(440, 0.13, { type: 'triangle', gain: 0.09, delay: 0.12 });
          break;
        case 'block':
          // 封禁：一记闷响，像把门关上
          this.tone(120, 0.13, { type: 'sine', gain: 0.22 });
          this.noise(0.07, { freq: 900, gain: 0.12 });
          break;
        case 'backup':
          // 备份保护：低频嗡 + 两声确认
          this.tone(220, 0.3, { type: 'sine', gain: 0.07 });
          this.tone(660, 0.08, { type: 'triangle', gain: 0.06, delay: 0.12 });
          this.tone(880, 0.08, { type: 'triangle', gain: 0.05, delay: 0.2 });
          break;
        case 'powerdown':
          // 关闭服务器：风扇停转
          this.tone(420, 0.34, { type: 'sawtooth', gain: 0.14, slideTo: 60 });
          this.noise(0.09, { freq: 700, gain: 0.09, delay: 0.24 });
          break;
        case 'powerup':
          // 启动服务器：风扇起转
          this.tone(70, 0.34, { type: 'sawtooth', gain: 0.12, slideTo: 460 });
          this.tone(520, 0.1, { type: 'triangle', gain: 0.06, delay: 0.26 });
          break;
        case 'mail':
          // 删除邮件：纸张两下
          this.noise(0.04, { freq: 1400, gain: 0.1, q: 0.7 });
          this.noise(0.04, { freq: 1200, gain: 0.08, q: 0.7, delay: 0.06 });
          break;
        case 'reset':
          // 重置凭据：三连击，键盘输入的感觉
          [0, 0.06, 0.12].forEach((delay) => {
            this.noise(0.012, { freq: 2400, gain: 0.06, delay });
          });
          this.tone(990, 0.07, { type: 'triangle', gain: 0.06, delay: 0.17 });
          break;
        case 'deny':
          // 操作未生效：一记下行的“不行”
          this.tone(300, 0.1, { type: 'square', gain: 0.14 });
          this.tone(200, 0.14, { type: 'square', gain: 0.12, delay: 0.08 });
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
