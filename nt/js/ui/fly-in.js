// 界面：流水 tab → 入账飞入
/**
 * 飞入动画（Web Animations API，约 200ms）
 * 层：第五层 · UI 渲染
 *
 * 目标行不在文档里（窗口没挂上）就跳过。不用 transition: all。
 */

export function flyInto(text, fromEl, toEl) {
  try {
    if (!fromEl || !toEl || !toEl.isConnected) return false;
    if (typeof fromEl.getBoundingClientRect !== 'function') return false;
    if (typeof toEl.getBoundingClientRect !== 'function') return false;
    if (typeof document === 'undefined' || !document.body) return false;
    if (typeof document.createElement !== 'function') return false;
    const a = fromEl.getBoundingClientRect();
    const b = toEl.getBoundingClientRect();
    const ghost = document.createElement('span');
    ghost.className = 'nt-fly-ghost';
    ghost.textContent = String(text == null ? '' : text);
    document.body.appendChild(ghost);
    const frames = [
      { left: a.left + 'px', top: a.top + 'px', opacity: 1 },
      { left: b.left + 'px', top: b.top + 'px', opacity: 0.15 },
    ];
    if (typeof ghost.animate !== 'function') {
      ghost.remove();
      return false;
    }
    const anim = ghost.animate(frames, { duration: 200, easing: 'ease-out' });
    const done = () => { if (ghost.parentNode) ghost.remove(); };
    if (anim && anim.finished && typeof anim.finished.then === 'function') anim.finished.then(done, done);
    else done();
    return true;
  } catch (e) {
    return false;
  }
}

/** 行不在当前挂载的表格里就一笔都不飞。 */
export function flyParts(container, fromEl, txId, parts) {
  if (!container || !txId || typeof container.querySelector !== 'function') return 0;
  let id = String(txId);
  try {
    if (typeof CSS !== 'undefined' && CSS.escape) id = CSS.escape(id);
  } catch (e) { /* 保持原 id */ }
  const tr = container.querySelector('tr[data-id="' + id + '"]');
  if (!tr || !tr.isConnected) return 0;
  let n = 0;
  for (const p of parts || []) {
    if (!p || !p.field) continue;
    const cell = tr.querySelector('[data-field="' + p.field + '"]');
    if (flyInto(p.text, fromEl, cell)) n += 1;
  }
  return n;
}
