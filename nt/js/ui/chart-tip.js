// 界面：路径 tab → 点击停留提示
/**
 * 环图提示。一个监听挂在容器上，不为每条弦单独绑事件。
 * 层：第五层 · UI
 *
 * 鼠标悬停时跟着走，移开就收。
 * 点一下（含手机触摸）停 3 秒；这段时间里再点另一段，立刻换字并重新计时。
 */

/**
 * 提示框与指针的垂直间隔：约 1cm。
 * CSS 参考像素是 1/96 英寸，38px ≈ 1.005cm；手机上也按这个视觉距离，
 * 手指按住/点选时提示框不会被指头挡住。
 */
export const TIP_GAP = 38;

/**
 * 计算提示框位置（纯函数，便于测试）。
 *
 * 规则：
 *   · 提示框**底边**在指针上方 TIP_GAP 处（不是顶边 —— 顶边留 1cm 的话，
 *     框体本身还会往下压到手指）；
 *   · 水平以指针为中心；
 *   · 顶部放不下才翻到指针下方（至少 16px），左右/上下再夹在视口内。
 *
 * @param {{x:number,y:number,w:number,h:number,vw:number,vh:number,gap?:number}} o
 * @returns {{x:number,y:number}}
 */
export function tipPosition(o) {
  const gap = Number.isFinite(o.gap) ? o.gap : TIP_GAP;
  const w = Math.max(0, Number(o.w) || 0);
  const h = Math.max(0, Number(o.h) || 0);
  const vw = Math.max(0, Number(o.vw) || 0);
  const vh = Math.max(0, Number(o.vh) || 0);
  const pad = 8;

  let x = o.x - w / 2;
  x = Math.min(Math.max(pad, x), Math.max(pad, vw - w - pad));

  let y = o.y - gap - h;
  if (y < pad) y = o.y + 16;   // 上方放不下：翻到下方，别贴边
  y = Math.min(Math.max(pad, y), Math.max(pad, vh - h - pad));

  return { x: Math.round(x), y: Math.round(y) };
}

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
    return `${b.label || id}\n${b.type || ''} · 净额 ${b.amountText || '0'}`;
  }

  const chord = el.classList && (el.classList.contains('mw-chord') || el.classList.contains('mw-hitarea'));
  if (!chord) return '';
  const idx = Number(el.getAttribute('data-tx'));
  const t = (model.txs || [])[idx];
  if (!t) return '';
  // 环图/路径追踪的金额一律取整显示（用户 2026-11：不要两位小数）
  const amt = String(Math.round(Number(t.amount) || 0));
  const note = t.note ? `\n${t.note}` : '';
  return `${t.date || ''}\n${nameOf(t.from_id)} → ${nameOf(t.to_id)}\n${amt}${note}`;
}

/** 点中一段后提示停留这么久。再点另一段会清掉上一次并重计。 */
export const TIP_HOLD_MS = 3000;

/**
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
    // 先让内容落地再量尺寸：offsetWidth / offsetHeight 会触发布局，
    // 量出来的就是这一条提示的真实大小。
    const pos = tipPosition({
      x: ev.clientX,
      y: ev.clientY,
      w: tip.offsetWidth,
      h: tip.offsetHeight,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
    tip.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  }
}
