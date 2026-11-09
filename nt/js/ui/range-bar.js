// 界面：单元格框选的工具条
/**
 * 框选工具条
 * 层：第五层 · UI
 *
 * 只负责「把四个按钮画出来、显示/隐藏」。
 * 复制 / 粘贴 / 删除行的实际动作由调用方通过 handlers 传入 ——
 * 那些动作要读选区和表格数据，属于 cell-range.js 的职责。
 */

const ACTS = [
  ['copy', '复制'],
  ['paste', '粘贴'],
  ['del', '删除行'],
  ['cancel', '取消'],
];

/**
 * @param {{onCopy:Function, onPaste:Function, onDelete:Function, onCancel:Function}} handlers
 */
export function bindBar(handlers) {
  let el = document.getElementById('nt-range-bar');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'nt-range-bar';
  el.className = 'nt-range-bar';
  el.hidden = true;

  for (const [act, text] of ACTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-range-btn';
    b.dataset.act = act;
    b.textContent = text;
    el.appendChild(b);
  }

  document.body.appendChild(el);

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('.nt-range-btn');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'copy') handlers.onCopy();
    else if (act === 'paste') handlers.onPaste();
    else if (act === 'del') handlers.onDelete();
    else handlers.onCancel();
  });

  return el;
}

/**
 * 显示并定位（定位走 CSS 变量，不使用内联 style）
 *
 * 按钮按这张表的能力裁剪：只读表（统计）没有「粘贴 / 删除行」，
 * 留着禁用按钮等于让用户反复点一个永远不会响的东西。
 */
export function showBar(tableEl, opts) {
  const el = document.getElementById('nt-range-bar');
  if (!el) return;

  const rect = tableEl.getBoundingClientRect();
  el.style.setProperty('--nt-range-top', Math.max(6, Math.round(rect.top + 4)) + 'px');
  el.style.setProperty('--nt-range-left', Math.round(rect.left + 8) + 'px');
  el.hidden = false;

  const o = opts || {};
  for (const b of el.querySelectorAll('.nt-range-btn')) {
    const act = b.dataset.act;
    if (act === 'paste') {
      b.hidden = o.canPaste === false;
      b.disabled = !o.hasClip;
    } else if (act === 'del') {
      b.hidden = o.canDelete === false;
    }
  }
}

export function hideBar() {
  const el = document.getElementById('nt-range-bar');
  if (el) el.hidden = true;
}

export function setPasteEnabled(on) {
  const el = document.getElementById('nt-range-bar');
  const paste = el && el.querySelector('[data-act="paste"]');
  if (paste) paste.disabled = !on;
}
