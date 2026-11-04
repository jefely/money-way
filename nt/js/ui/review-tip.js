// 界面：设置页 → 新增序号气泡
/**
 * 序号变黄表示「新增，请核查」。点一下出气泡，点别处收起。
 * 层：第五层 · UI
 */

let tip = null;

function ensure() {
  if (tip && document.body.contains(tip)) return tip;
  tip = document.createElement('div');
  tip.className = 'nt-review-tip';
  tip.hidden = true;
  tip.textContent = '新增，请核查';
  document.body.appendChild(tip);
  document.addEventListener('pointerdown', (ev) => {
    if (!tip || tip.hidden) return;
    const cell = ev.target && ev.target.closest && ev.target.closest('.nt-seq-review');
    if (cell) return;
    tip.hidden = true;
  }, true);
  return tip;
}

/** 点黄色序号时，在格子下方打开气泡。 */
export function bindReviewTips(root) {
  if (!root || root.dataset.reviewBound) return;
  root.dataset.reviewBound = '1';
  root.addEventListener('click', (ev) => {
    const cell = ev.target && ev.target.closest && ev.target.closest('.nt-seq-review');
    if (!cell) return;
    const box = ensure();
    const r = cell.getBoundingClientRect();
    box.hidden = false;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - 140));
    box.style.left = left + 'px';
    box.style.top = (r.bottom + 6) + 'px';
  });
}
