/**
 * 公约自动检查：任何一条不过 → 退出码 1（= 不准合并到 main）。
 *
 *   node nt/tools/check-rules.mjs
 *
 * 全部是机械判定，不靠自觉。检查项对应 CODE-RULES.md 的硬性条款。
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative, dirname } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'vendor']);
const MAX_JS_LINES = 300;

const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (!['.html', '.js', '.mjs', '.css'].includes(ext)) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  // ① 内联事件（HTML / 模板里出现 on\w+="）
  if (ext === '.html') {
    lines.forEach((line, i) => {
      if (/\son[a-z]+\s*=\s*["']/i.test(line)) {
        problems.push(`${rel(file)}:${i + 1} 内联事件 —— 禁止 onclick/onchange 等（公约 1.1）`);
      }
      // ② 内联样式（<style> 标签内的不算）
      if (/\sstyle\s*=\s*["']/i.test(line)) {
        problems.push(`${rel(file)}:${i + 1} 内联样式 —— 用类名或 CSS 变量（公约 1.2）`);
      }
    });

    // ③ 深层嵌套：连续出现的 div 开标签层数
    const depth = computeDivDepth(text);
    if (depth.max >= 6) {
      problems.push(`${rel(file)} 出现 ${depth.max} 层 <div> 嵌套（上限 5，公约 1.3）`);
    }
  }

  // ④ 单文件行数（只算有效代码行：注释与空行不计，注释不该被惩罚）
  if (ext === '.js' || ext === '.mjs') {
    let inBlock = false;
    const codeLines = lines.filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (inBlock) {
        if (t.includes('*/')) inBlock = false;
        return false;
      }
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) inBlock = true;
        return false;
      }
      if (t.startsWith('//')) return false;
      return true;
    });
    if (codeLines.length > MAX_JS_LINES) {
      problems.push(`${rel(file)} ${codeLines.length} 行有效代码（去注释/空行），超过 ${MAX_JS_LINES} 行上限（公约 3.1）`);
    }
    // ⑤ 相对 import 必须能解析到真实文件（这类错误在浏览器里只表现为"整页不动"）
    const importRe = /(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
    let im;
    while ((im = importRe.exec(text))) {
      const spec = im[1] || im[2];
      if (!spec || !spec.startsWith('.')) continue;
      const target = join(dirname(file), spec);
      if (!existsSync(target)) {
        problems.push(`${rel(file)} import 指向不存在的文件：${spec}（应解析为 ${rel(target)}）`);
      }
    }
    // ⑦ 渲染器禁止三角函数（坐标必须由 calculator 算好）
    if (rel(file).includes('mw-svg-renderer')) {
      lines.forEach((line, i) => {
        if (/Math\.(sin|cos)\s*\(/.test(line)) {
          problems.push(`${rel(file)}:${i + 1} 渲染器里出现三角函数 —— 坐标必须由 graph/ 算好（CHECKLIST ☐13）`);
        }
      });
    }

    // ⑧ 纯计算层禁止碰浏览器 API（core / timeline / graph 都是「脱离浏览器能用 Node 跑」的层）
    const pureLayers = ['/core/', '/timeline/', '/graph/'];
    if (pureLayers.some((p) => rel(file).includes(p))) {
      const banned = ['window.', 'document.', 'localStorage', 'navigator.userAgent'];
      lines.forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('*') || t.startsWith('//')) return;
        for (const b of banned) {
          if (line.includes(b)) {
            problems.push(`${rel(file)}:${i + 1} 纯计算层里出现 ${b}（公约 3.3：必须能脱离浏览器跑测试）`);
          }
        }
      });
    }
  }

  // ⑥ CSS 类名前缀 + 禁止层级选择器
  if (ext === '.css') {
    lines.forEach((line, i) => {
      const sel = line.trim();
      if (!sel || sel.startsWith('/*') || sel.startsWith('*') || sel.startsWith('@') || sel.includes('{') === false) return;
      // 层级选择器：出现 "> div" 或连续裸标签
      if (/\bdiv\b\s*>|\>\s*div\b/.test(sel)) {
        problems.push(`${rel(file)}:${i + 1} 层级/裸标签选择器 —— 会随结构变化失效（公约 3.4）`);
      }
    });
  }
}

/** 粗略估算同一文件里 <div> 的最大嵌套深度。 */
function computeDivDepth(html) {
  let depth = 0;
  let max = 0;
  const re = /<(\/?)div\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === '/') depth = Math.max(0, depth - 1);
    else { depth += 1; max = Math.max(max, depth); }
  }
  return { max };
}

if (problems.length) {
  console.error(`✗ 公约检查未通过（${problems.length} 处）：\n`);
  for (const p of problems) console.error('  - ' + p);
  console.error('\n按 CODE-RULES.md，这些代码不允许合并到 main。');
  process.exit(1);
}

console.log(`✓ 公约检查通过：${files.length} 个文件，${MAX_JS_LINES} 行/文件上限，core/ 无浏览器 API。`);
