/* 网络拓扑：绝对定位节点 + SVG 连线 + 流动攻击虚线。 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});
  const SVG_NS = 'http://www.w3.org/2000/svg';

  class Topology {
    constructor(options) {
      this.wrap = options.wrap;
      this.svg = options.svg;
      this.layer = options.layer;
      this.game = options.game;
      this.onSelect = options.onSelect || function noop() {};
      this.nodes = new Map();
      this.centers = new Map();
      this.built = false;
      this.resizeObserver = null;
      this.raf = null;
    }

    build() {
      this.layer.textContent = '';
      this.nodes.clear();
      for (const device of Object.values(this.game.devices)) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'topo-node';
        el.dataset.device = device.deviceId;
        el.innerHTML = `
          <span class="node-top"><b></b><span class="node-glyph"></span></span>
          <span class="node-bottom"><span class="node-name"></span><span class="node-status"></span></span>
        `;
        el.addEventListener('click', () => this.onSelect(device.deviceId));
        el.addEventListener('pointerenter', () => {
          const latest = this.game.devices[device.deviceId];
          if (!latest) return;
          let text = `${latest.name}｜${latest.statusLabel}｜健康 ${latest.health}`;
          if (latest.isolated) text += '｜已隔离';
          el.title = text;
        });
        this.layer.appendChild(el);
        this.nodes.set(device.deviceId, el);
      }
      this.built = true;
      if (global.ResizeObserver) {
        this.resizeObserver = new ResizeObserver(() => this.layout());
        this.resizeObserver.observe(this.wrap);
      }
      global.addEventListener('resize', () => this.layout());
      this.layout();
    }

    layout() {
      const width = this.wrap.clientWidth;
      const height = this.wrap.clientHeight;
      if (!width || !height) return;
      const first = this.nodes.values().next().value;
      const nodeWidth = first ? first.offsetWidth : 104;
      const nodeHeight = first ? first.offsetHeight : 44;
      const pad = 10;
      const usableW = Math.max(1, width - pad * 2 - nodeWidth);
      const usableH = Math.max(1, height - pad * 2 - nodeHeight);
      this.centers.clear();
      for (const [deviceId, el] of this.nodes) {
        const device = this.game.devices[deviceId];
        if (!device) continue;
        const x = pad + nodeWidth / 2 + device.pos[0] * usableW;
        const y = pad + nodeHeight / 2 + device.pos[1] * usableH;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        this.centers.set(deviceId, { x, y });
      }
      this.drawLinks();
    }

    clearSvg() {
      while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);
    }

    line(points, className) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(points.x1));
      line.setAttribute('y1', String(points.y1));
      line.setAttribute('x2', String(points.x2));
      line.setAttribute('y2', String(points.y2));
      line.setAttribute('class', className);
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      return line;
    }

    drawLinks() {
      this.clearSvg();
      if (!this.game) return;
      const drawn = new Set();
      for (const device of Object.values(this.game.devices)) {
        for (const neighborId of device.neighbors) {
          const other = this.game.devices[neighborId];
          if (!other) continue;
          const key = [device.deviceId, neighborId].sort().join('|');
          if (drawn.has(key)) continue;
          drawn.add(key);
          const a = this.centers.get(device.deviceId);
          const b = this.centers.get(neighborId);
          if (!a || !b) continue;
          let cls = 'link';
          if (device.isolated || other.isolated) cls += ' isolated';
          else if (device.status === '感染' || other.status === '感染') cls += ' infected';
          else if (device.status === '可疑' || other.status === '可疑') cls += ' suspicious';
          this.svg.appendChild(this.line({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, cls));
        }
      }
      for (const event of this.game.activeEvents) {
        const start = this.centers.get(event.targetId);
        const end = this.centers.get(event.activeDeviceId);
        if (!start || !end) continue;
        if (event.targetId === event.activeDeviceId) continue;
        this.svg.appendChild(this.line({ x1: start.x, y1: start.y, x2: end.x, y2: end.y }, 'attack'));
      }
    }

    render() {
      if (!this.built) return;
      const selectedId = this.game.selectedDeviceId;
      const activeIds = new Set(this.game.activeEvents.map((event) => event.activeDeviceId));
      for (const [deviceId, el] of this.nodes) {
        const device = this.game.devices[deviceId];
        if (!device) continue;
        el.dataset.status = device.status;
        el.dataset.selected = deviceId === selectedId ? 'true' : 'false';
        el.dataset.active = activeIds.has(deviceId) ? 'true' : 'false';
        el.querySelector('.node-top b').textContent = device.deviceId;
        el.querySelector('.node-glyph').textContent = ZDD.STATUS_GLYPHS[device.status] || '?';
        el.querySelector('.node-name').textContent = device.shortName;
        el.querySelector('.node-status').textContent = device.status;
        el.setAttribute(
          'aria-label',
          `${device.name}，状态${device.status}，健康值 ${device.health}${device.isolated ? '，已隔离' : ''}`,
        );
      }
      this.drawLinks();
    }

    nodeElement(deviceId) {
      return this.nodes.get(deviceId) || null;
    }

    refresh() {
      if (this.raf) global.cancelAnimationFrame(this.raf);
      this.raf = global.requestAnimationFrame(() => {
        this.raf = null;
        this.layout();
        this.render();
      });
    }
  }

  ZDD.Topology = Topology;
})(typeof globalThis !== 'undefined' ? globalThis : this);
