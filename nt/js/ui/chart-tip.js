// 界面：路径 tab → 点击停留提示
/**
 * 环图提示。一个监听挂在容器上，不为每条弦单独绑事件。
 * 层：第五层 · UI
 *
 * 鼠标悬停时跟着走，移开就收。
 * 点一下（含手机触摸）停 3 秒；这段时间里再点另一段，立刻换字并重新计时。
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

/** 点中一段后提示停留这么久。再点另一段会清掉上一次并重计。 */
export const TIP_HOLD_MS = 3000;

/**
 * 这次事件该怎么处理提示。
 * 有文案就立刻换上；没文案但还在停留期内就保持；否则收起。
 */
export function tipHoldPlan(text, holding) {
  if (text) return { action: 'show', ms: TIP_HOLD_MS };
  return holding ? { action: 'keep', ms: TIP_HOLD_MS } : { action: 'hide', ms: 0 };
}

export function bindChartTip(host) {
  if (!host || host.dataset.tipBound === '1') return;
  host.dataset.tipBound = '1';
  const tip = document.getElementById('pw-tip');
  if (!tip) return;

  let timer = 0;
  const holding = () => timer !== 0;

  const hide = () => {
    clearTimeout(timer);
    timer = 0;
    tip.hidden = true;
    tip.textContent = '';
  };

  const present = (ev, text, sticky) => {
    tip.textContent = text;
    tip.hidden = false;
    move(ev);
    if (!sticky) return;
    clearTimeout(timer);
    timer = setTimeout(hide, TIP_HOLD_MS);
  };

  const consider = (ev, sticky) => {
    if (host.classList.contains('is-dragging')) return;
    const text = tipText(host.__chartModel, ev.target);
    const plan = tipHoldPlan(text, holding() || sticky);
    if (plan.action === 'hide') { hide(); return; }
    if (plan.action !== 'show') return;
    present(ev, text, sticky || holding());
  };

  host.addEventListener('pointerover', (ev) => {
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    consider(ev, false);
  });
  host.addEventListener('pointermove', (ev) => {
    if (tip.hidden || host.classList.contains('is-dragging')) return;
    move(ev);
    const text = tipText(host.__chartModel, ev.target);
    if (!text || text === tip.textContent) return;
    present(ev, text, holding());
  });
  host.addEventListener('pointerout', (ev) => {
    if (holding()) return;
    if (ev.pointerType && ev.pointerType !== 'mouse') return;
    if (host.contains(ev.relatedTarget)) return;
    hide();
  });
  host.addEventListener('pointerup', (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    consider(ev, true);
  }, true);

  function move(ev) {
    const x = Math.min(ev.clientX + 12, window.innerWidth - 220);
    const y = Math.min(ev.clientY + 16, window.innerHeight - 80);
    tip.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
}
