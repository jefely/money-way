// 界面：导入 → 手动指定列
/**
 * 列映射对话框
 * 层：第五层 · UI
 *
 * 认不出表头时用：让用户指着表说「这行是表头、这列是日期、那列是金额」。
 * 解析仍走 core/import-table 的 genericRowsToItems —— 这里只产出 {idx, map}，不碰数据格式。
 *
 * 为什么需要它：账单预设和通用列名都认不出时，旧版只能报「这张表认不出来」，
 * 而用户手上那张表往往只是列名写法不一样（「交易日期」「发生额」），并不真的没法导。
 */

import * as NtModal from './modal.js';
import { genericRowsToItems, findGenericHeader, guessMapForRow } from '../core/import-table.js';

/** 角色 → 显示名（顺序即界面顺序） */
const ROLES = [
  ['date', '日期'],
  ['amount', '金额'],
  ['from', '转出'],
  ['to', '转入'],
  ['note', '备注'],
];

const HEAD_CHOICES = 8;    // 表头最多从这前 8 行里挑
const PREVIEW_ROWS = 6;    // 预览这么多行
const PREVIEW_COLS = 9;    // 预览这么多列（宽表只看开头，够判断了）

/**
 * @param {string[][]} rows 整张表（含表头）
 * @param {(res:{items:Array, map:object, headerIdx:number})=>void} onMapped
 */
export function openColumnMapper(rows, onMapped) {
  const list = (rows || []).filter(Array.isArray);
  if (!list.length) return;

  const auto = findGenericHeader(list);
  let headIdx = auto.idx >= 0 ? auto.idx : 0;
  let roles = (auto.idx === headIdx) ? { ...auto.map } : {};
  let errEl = null;

  function paint(body) {
    body.textContent = '';

    const hint = document.createElement('p');
    hint.className = 'nt-sync-hint';
    hint.textContent = '认不出表头。先选哪一行是表头，再指定每列装什么；'
      + '日期和金额必选，转出 / 转入至少选一列。';
    body.appendChild(hint);

    // ---- 表头行 ----
    const headRow = document.createElement('label');
    headRow.className = 'nt-import-role';

    const hs = document.createElement('span');
    hs.textContent = '表头行';
    headRow.appendChild(hs);

    const headSel = document.createElement('select');
    headSel.className = 'nt-input nt-input-sm';
    for (let i = 0; i < Math.min(list.length, HEAD_CHOICES); i += 1) {
      const op = document.createElement('option');
      op.value = String(i);
      op.textContent = `第 ${i + 1} 行`;
      headSel.appendChild(op);
    }
    headSel.value = String(headIdx);
    headSel.addEventListener('change', () => {
      headIdx = Number(headSel.value) || 0;
      roles = guessMapForRow(list[headIdx] || []);
      paint(body);
    });
    headRow.appendChild(headSel);
    body.appendChild(headRow);

    // ---- 预览：前几行，列号写在表头上 ----
    body.appendChild(previewTable(list, headIdx));

    // ---- 五个角色 ----
    const grid = document.createElement('div');
    grid.className = 'nt-import-roles';
    for (const [key, label] of ROLES) {
      grid.appendChild(roleSelect(key, label, list, headIdx, roles, (v) => { roles[key] = v; }));
    }
    body.appendChild(grid);

    errEl = document.createElement('p');
    errEl.className = 'nt-import-map-err';
    body.appendChild(errEl);
  }

  function fail(text) {
    if (errEl) errEl.textContent = text;
  }

  function submit(close) {
    if (roles.date == null) return fail('日期列必须指定');
    if (roles.amount == null) return fail('金额列必须指定');
    if (roles.date === roles.amount) return fail('日期列和金额列不能是同一列');
    if (roles.from == null && roles.to == null) {
      return fail('转出 / 转入至少要指定一列，否则每一笔都会因为「账户认不出」被跳过');
    }

    const map = {};
    for (const [key] of ROLES) if (roles[key] != null) map[key] = roles[key];

    const items = genericRowsToItems(list, { idx: headIdx, map });
    if (!items.length) {
      return fail('按这个映射一笔都没认出：检查日期列是不是 2026-10-01 / 261001 这类写法，'
        + '金额列是不是数字。');
    }

    close();
    if (onMapped) onMapped({ items, map, headerIdx: headIdx });
    return undefined;
  }

  NtModal.open({
    title: '指定列',
    build: (body) => { paint(body); },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '按这个映射解析',
        kind: 'primary',
        close: false,     // 校验不过要留在原地，由 submit 自己关
        onClick: ({ close }) => { submit(close); },
      },
    ],
  });
}

/** 预览表：列号当表头，表头行高亮 */
function previewTable(list, headIdx) {
  const table = document.createElement('table');
  table.className = 'nt-import-map-table';

  const cols = Math.min(
    Math.max(...list.slice(0, PREVIEW_ROWS + 1).map((r) => r.length), 0),
    PREVIEW_COLS,
  );

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (let c = 0; c < cols; c += 1) {
    const th = document.createElement('th');
    th.textContent = String(c + 1);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const show = Math.min(list.length, PREVIEW_ROWS);
  for (let i = 0; i < show; i += 1) {
    const tr = document.createElement('tr');
    if (i === headIdx) tr.className = 'is-head';
    for (let c = 0; c < cols; c += 1) {
      const td = document.createElement('td');
      td.textContent = String((list[i] || [])[c] == null ? '' : (list[i] || [])[c]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/** 一个角色的下拉：不用 / 第 N 列（列名） */
function roleSelect(key, label, list, headIdx, roles, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'nt-import-role';

  const name = document.createElement('span');
  name.textContent = label;
  wrap.appendChild(name);

  const sel = document.createElement('select');
  sel.className = 'nt-input nt-input-sm';
  sel.setAttribute('data-role', key);

  const none = document.createElement('option');
  none.value = '';
  none.textContent = '（不用）';
  sel.appendChild(none);

  const cells = list[headIdx] || [];
  for (let c = 0; c < cells.length; c += 1) {
    const op = document.createElement('option');
    op.value = String(c);
    const text = String(cells[c] == null ? '' : cells[c]).trim();
    op.textContent = `${c + 1}. ${text.slice(0, 8) || '（空）'}`;
    sel.appendChild(op);
  }

  sel.value = roles[key] == null ? '' : String(roles[key]);
  sel.addEventListener('change', () => {
    onChange(sel.value === '' ? null : Number(sel.value));
  });

  wrap.appendChild(sel);
  return wrap;
}
