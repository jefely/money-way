/**
 * 生成 / 校对 JS-MAP.md
 *
 *   node nt/tools/js-map.mjs --write    写回 nt/JS-MAP.md
 *   node nt/tools/js-map.mjs            打印到标准输出（不写）
 *
 * 单一事实来源是每个 JS 文件**第一行**的 `// 界面：…`，
 * 这张表只是它的汇总。手写表在 150+ 个文件时必然漂 ——
 * 之前那张表就漏了 frame 一半的文件（cell-range / fixed-table / inst-table …）。
 *
 * 门禁（check-rules.mjs）会比对这张表与文件头，不一致就退出 1。
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const JS_DIR = join(ROOT, 'js');
const OUT = join(ROOT, 'JS-MAP.md');

const HEAD = `# NT账本 · JS → 界面位置 映射

> 本表由 \`nt/tools/js-map.mjs\` 从每个文件头第一行的 \`// 界面：…\` **生成**，不要手改。
> 改界面位置就改文件头，然后 \`node nt/tools/js-map.mjs --write\`。
> \`（无界面）\` 表示纯逻辑，被其他模块调用，不直接对应某个 DOM 区域。

| JS 文件 | 对应界面位置 |
|---|---|
`;

/** 递归收集 .js 文件 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/**
 * 文件头的描述。
 *
 * 约定是 `// 界面：…`，但仓库里有两种历史写法：
 *   · `// 数据：…` / `// 核心：…`（早期纯逻辑模块）
 *   · `/**` 块注释 + 标题行（core/version.js 这类）
 * 生成器都认，缺了就在表里标出来 —— 表是给人看的，别为了整齐而丢信息。
 */
function labelOf(file) {
  // 有些文件带 UTF-8 BOM（app.js 就有），不去掉的话开头的 `//` 匹配不上
  const lines = readFileSync(file, 'utf8').split(/\r?\n/, 12).map((l) => l.replace(/^\uFEFF/, ''));

  for (const line of lines) {
    const m = line.match(/^\s*(?:\/\/|\*)\s*(?:界面|数据|核心|工具)：(.*)$/);
    if (m) return m[1].trim();
  }

  for (const line of lines) {
    const t = line.trim();
    if (!t || t === '/**' || t === '*/' || t.startsWith('//!')) continue;
    const m = t.match(/^(?:\/\/|\*)\s*(.+)$/);
    if (m && !/^[-=*]+$/.test(m[1])) return '（未标注界面）' + m[1].trim();
  }

  return '（缺注释）';
}

/** 生成整张表（纯函数：给 root 就出字符串，便于门禁复用） */
export function buildJsMap(root = ROOT) {
  const dir = join(root, 'js');
  const files = walk(dir)
    .map((p) => ({ rel: relative(dir, p).split(sep).join('/'), label: labelOf(p) }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const rows = files.map((f) => `| \`${f.rel}\` | ${f.label} |`).join('\n');
  return HEAD + rows + '\n';
}

function main() {
  const write = process.argv.includes('--write');
  const text = buildJsMap(ROOT);

  if (write) {
    writeFileSync(OUT, text, 'utf8');
    console.log('已写入 nt/JS-MAP.md（' + (text.match(/^\| `/gm) || []).length + ' 个文件）');
    return;
  }

  process.stdout.write(text);
}

// 只有直接运行才执行；被 check-rules.mjs import 时只提供 buildJsMap
const SELF = pathToFileURL(process.argv[1] || '').href;
if (import.meta.url === SELF) main();
