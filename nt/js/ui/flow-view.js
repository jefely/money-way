/**
 * 视图：流水列表与页脚。
 *
 * 公约 2.2：结构一律来自 <template>，这里只做「克隆 + 填值」，不拼 HTML 字符串。
 * 公约 2.3：所有数字都是 core/ 算好的，这里不做任何业务计算。
 */

export const CLASS = {
  row: 'nt-row',
  empty: 'nt-empty',
  seq: 'nt-cell-seq',
  date: 'nt-cell-date',
  from: 'nt-cell-from',
  to: 'nt-cell-to',
  amount: 'nt-cell-amount',
  note: 'nt-cell-note',
  action: 'nt-cell-action',
  footer: 'nt-footer',
};

/** 找模板并取出它的**根元素**。
 *  <template>.content 是 DocumentFragment，直接 cloneNode 拿到的是片段，
 *  不是 <tr> —— 于是 tr.dataset 为 undefined，一赋值就抛错。
 *  这里统一返回 content.firstElementChild。 */
function tpl(id) {
  const el = document.getElementById(id);
  if (!el || !el.content) return null;
  return el.content.firstElementChild;
}

/** 渲染流水表体。rows 是 core 算好的纯数据。 */
export function renderFlowList(tbody, rows) {
  tbody.textContent = '';

  const rowTpl = tpl('tpl-flow-row');
  const emptyTpl = tpl('tpl-empty');

  if (!rows || !rows.length) {
    if (emptyTpl) tbody.appendChild(emptyTpl.cloneNode(true));
    return;
  }

  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = rowTpl.cloneNode(true);
    tr.dataset.id = r.id;
    tr.querySelector(`.${CLASS.seq}`).textContent = String(r.seq);
    tr.querySelector(`.${CLASS.date}`).textContent = r.dateText;
    tr.querySelector(`.${CLASS.from}`).textContent = r.from || '—';
    tr.querySelector(`.${CLASS.to}`).textContent = r.to || '—';
    tr.querySelector(`.${CLASS.amount}`).textContent = r.amountText;
    tr.querySelector(`.${CLASS.note}`).textContent = r.note || '';
    frag.appendChild(tr);
  }
  tbody.appendChild(frag);
}

/** 渲染页脚：条数 + 合计。 */
export function renderFooter(el, info) {
  el.textContent = `共 ${info.count} 笔 · 合计 ${info.totalText}`;
}
