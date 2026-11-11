#!/usr/bin/env node
/**
 * 把 web/ 同步到 docs/play/，让 GitHub Pages 无论用「分支 /docs」还是
 * 「GitHub Actions」发布都能直接访问 play/，本地打开 docs/index.html 也能试玩。
 *
 * docs/play/ 是生成产物，请改 web/ 后重新运行：
 *   node tools/sync-docs-play.mjs
 */
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..');
const target = resolve(source, '..', 'docs', 'play');
const skip = new Set(['tests', 'tools', 'node_modules']);

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

let files = 0;
let bytes = 0;
for (const entry of readdirSync(source)) {
  if (skip.has(entry)) continue;
  const from = join(source, entry);
  const to = join(target, entry);
  cpSync(from, to, { recursive: true });
  const walk = (path) => {
    const info = statSync(path);
    if (info.isDirectory()) {
      for (const child of readdirSync(path)) walk(join(path, child));
    } else {
      files += 1;
      bytes += info.size;
    }
  };
  walk(from);
}

console.log(`已同步 ${files} 个文件（${(bytes / 1024).toFixed(0)} KB）到 docs/play/`);
