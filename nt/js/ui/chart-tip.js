// 界面：路径 tab → 悬停提示
/**
 * 环图悬停。一个监听挂在容器上，不为每条弦单独绑事件。
 * 层：第五层 · UI
 */

/** 纯文本，方便测试。el 需要 classList 和 getAttribute。 */
export function tipText(model, el) {
  if (!model || !el || !el.getAttribute) return '';
  const blocks = model.blocks || [];
  const nameOf = (id) => {
    const b = blocks.find((x) => x && x.acc === id);
    return (b && b.label) || id || '—';
  };

  if (el.classList && el.classList.contains('mw-ring')) {
    const id = el.getAttribute('data-node') || '';
    const b = blocks.find((x) => x && x.acc === id);
    if (!b) return '';
    return `${b.label || id}\n${b.type || ''} · 净额 ${b.amountText || '0.00'}`;
  }

  const chord = el.classList && (el.classList.contains('mw-chord') || el.classList.contains('mw-hitarea'));
  if (!chord) return '';
  const idx = Number(el.getAttribute('data-tx'));
  const t = (model.txs || [])[idx];
  if (!t) return '';
  const amt = (Number(t.amount) || 0).toFixed(2);
  const note = t.note ? `\n${t.note}` : '';
  return `${t.date || ''}\n${nameOf(t.from_id)} → ${nameOf(t.to_id)}\n${amt}${note}`;
}

export function bindChartTip(host) {
  if (!host || host.dataset.tipBound === '1') return;
  host.dataset.tipBound = '1';
  const tip = document.getElementById('pw-tip');
  if (!tip) return;

  const hide = () => { tip.hidden = true; tip.textContent = ''; };

  host.addEventListener('pointerover', (ev) => show(ev));
  host.addEventListener('pointermove', (ev) => {
    if (!tip.hidden) move(ev);
  });
  host.addEventListener('pointerout', (ev) => {
    if (!host.contains(ev.relatedTarget)) hide();
  });

  function show(ev) {
    if (host.classList.contains('is-dragging')) { hide(); return; }
    const text = tipText(host.__chartModel, ev.target);
    if (!text) { hide(); return; }
    tip.textContent = text;
    tip.hidden = false;
    move(ev);
  }

  function move(ev) {
    const x = Math.min(ev.clientX + 12, window.innerWidth - 220);
    const y = Math.min(ev.clientY + 16, window.innerHeight - 80);
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
}
