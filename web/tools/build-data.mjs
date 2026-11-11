#!/usr/bin/env node
/**
 * 把 ../data/*.json 打包成浏览器可直接加载的经典脚本 web/js/data/game-data.js。
 *
 * 为什么不用 fetch：网页版要能双击 index.html（file://）离线打开，
 * 此时浏览器会拦截 fetch/ES module。经典 <script> 不受影响，
 * 所以这里把 JSON 转成挂到 window.ZDD.data 上的脚本。
 *
 * 用法：node tools/build-data.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dataDir = resolve(root, '..', 'data');

const files = {
  events: 'events.json',
  devices: 'devices.json',
  services: 'services.json',
  upgrades: 'upgrades.json',
  decisions: 'decisions.json',
};

const datasets = {};
for (const [key, name] of Object.entries(files)) {
  const text = readFileSync(join(dataDir, name), 'utf8');
  datasets[key] = JSON.parse(text);
}

const out = `/* 自动生成，请勿手改；来源：../data/*.json
 * 重新生成：node tools/build-data.mjs
 */
(function (global) {
  'use strict';
  const ZDD = (global.ZDD = global.ZDD || {});
  ZDD.data = ZDD.data || {};
  ZDD.data.events = ${JSON.stringify(datasets.events)};
  ZDD.data.devices = ${JSON.stringify(datasets.devices)};
  ZDD.data.services = ${JSON.stringify(datasets.services)};
  ZDD.data.upgrades = ${JSON.stringify(datasets.upgrades)};
  ZDD.data.decisions = ${JSON.stringify(datasets.decisions)};
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

writeFileSync(join(root, 'js', 'data', 'game-data.js'), out, 'utf8');

const summary = Object.entries(datasets)
  .map(([key, value]) => {
    const count = Array.isArray(value)
      ? value.length
      : Object.entries(value)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => `${k}:${v.length}`)
          .join(' ');
    return `  ${key}: ${count}`;
  })
  .join('\n');
console.log(`已生成 web/js/data/game-data.js\n${summary}`);
