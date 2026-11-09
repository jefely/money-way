// 界面：单元格剪贴板（复制 / 剪切 / 清除 / 粘贴）
/**
 * 单元格剪贴板
 * 层：第五层 · UI
 *
 * 只做「DOM 格子 ↔ 二维字符串数组」的搬运：
 *   · 不碰 state、不碰业务规则；
 *   · 只认带 [data-field] / input 的格子，跨列表头行（colspan）整行跳过；
 *   · 内部剪贴板与系统剪贴板（TSV）同时写。
 *
 * 流水表（Excel 式菜单）和固定 / 分期表（长按框选条）共用这一份，
 * 所以「流水表里复制 → 固定表里粘贴」是通的。
 */

/** 二维字符串数组；null = 还没复制过 */
let clip = null;

export function getClip() { return clip; }

/** 一行的每个 td 都是整格（没有跨列）才取；跨列行整行跳过 */
function rowCells(tr) {
  const tds = [...tr.children];
  return tds.some((td) => td.colSpan > 1) ? null : tds;
}

function bodyRows(tableEl) {
  return [...tableEl.querySelectorAll('tbody tr')];
}

/** 读一个格子：有 input 读 value，否则读文本（只读表复制用） */
function cellValue(td) {
  const input = td.querySelector('input, textarea');
  return input ? input.value : td.textContent.trim();
}

/** 写一个格子；只读 / 禁用格返回 null（粘贴与清除都跳过） */
function writeCell(td, v) {
  const input = td.querySelector('input, textarea');
  if (!input || input.readOnly || input.disabled) return null;
  input.value = v;
  return input;
}

/**
 * 落值后统一派发。
 *
 * 流水表的 from/to 是**失焦才解析**的（输入过程中 state 没被改过），
 * 所以要补一个合成 focusout，让 row-editor 把「清空 / 粘进来的账户名」
 * 真正写回 from_id / to_id。只对已有记录行做 —— 空行收到 focusout 会去建单，
 * 正在批量写的旧 DOM 会被换掉。
 *
 * 固定 / 分期表不要这个：它们只认 change，多派发一次 focusout 可能提前建规则。
 * 所以由调用方用 opts.resolveAccounts 显式打开。
 */
function commit(input, opts) {
  try {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (e) { /* 已脱离 */ }
  if (!opts || !opts.resolveAccounts) return;
  const field = input.dataset.field;
  if (field !== 'from' && field !== 'to') return;
  const tr = input.closest('tr');
  if (!tr || tr.dataset.new === '1' || document.activeElement === input) return;
  try { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); } catch (e) { /* 忽略 */ }
}

/**
 * 复制矩形区域 → 内部剪贴板 + 系统剪贴板。
 * @returns {string[][]} 复制到的矩阵（行优先）
 */
export function copyCells(tableEl, r1, c1, r2, c2) {
  const rows = bodyRows(tableEl);
  const out = [];
  for (let r = r1; r <= r2; r += 1) {
    const tds = rows[r] ? rowCells(rows[r]) : null;
    if (!tds) continue;
    const line = [];
    for (let c = c1; c <= c2; c += 1) line.push(tds[c] ? cellValue(tds[c]) : '');
    out.push(line);
  }
  clip = out;
  const tsv = out.map((line) => line.join('\t')).join('\n');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).catch(() => { /* 无权限就算了 */ });
    }
  } catch (e) { /* 忽略 */ }
  return out;
}

/** 清空矩形区域里的可编辑格；返回实际清掉的格数 */
export function clearCells(tableEl, r1, c1, r2, c2, opts) {
  const rows = bodyRows(tableEl);
  const inputs = [];
  for (let r = r1; r <= r2; r += 1) {
    const tds = rows[r] ? rowCells(rows[r]) : null;
    if (!tds) continue;
    for (let c = c1; c <= c2; c += 1) {
      const input = tds[c] ? writeCell(tds[c], '') : null;
      if (input) inputs.push(input);
    }
  }
  for (const input of inputs) commit(input, opts);
  return inputs.length;
}

/**
 * 从 (r1, c1) 开始铺一块矩阵。
 * @returns {{written:number, blocked:number}}
 */
export function pasteCells(tableEl, r1, c1, matrix, opts) {
  const m = matrix || [];
  const rows = bodyRows(tableEl);
  const inputs = [];
  let blocked = 0;

  m.forEach((line, dr) => {
    const tds = rows[r1 + dr] ? rowCells(rows[r1 + dr]) : null;
    (line || []).forEach((v, dc) => {
      const td = tds ? tds[c1 + dc] : null;
      const input = td ? writeCell(td, v == null ? '' : String(v)) : null;
      if (input) inputs.push(input);
      else blocked += 1;
    });
  });

  // 值先全部落地，再统一派发 —— 否则第一格的 input 触发重画，后面的格就写在旧节点上了
  for (const input of inputs) commit(input, opts);

  // 粘进空行：值已经写好了，但空行不会自己变成流水（建单要等 focusout）。
  // 给有账户/金额的空行补一次合成 focusout，让 row-editor 的 120ms 建单跑起来，
  // 这样粘贴才进 state / 撤销栈。
  if (opts && opts.createRows) {
    for (let r = r1; r < r1 + m.length; r += 1) {
      const tr = rows[r];
      if (!tr || tr.dataset.new !== '1') continue;
      const from = tr.querySelector('input[data-field="from"]');
      const to = tr.querySelector('input[data-field="to"]');
      const amount = tr.querySelector('input[data-field="amount"]');
      const has = (el) => !!(el && String(el.value || '').trim());
      if (!has(from) && !has(to) && !has(amount)) continue;
      const target = amount || from || to;
      const ev = new FocusEvent('focusout', { bubbles: true });
      ev.__ntSynthetic = true;
      try { target.dispatchEvent(ev); } catch (e) { /* 忽略 */ }
    }
  }

  return { written: inputs.length, blocked };
}
