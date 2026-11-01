// 界面：分期表上方的「月份范围」工具条
/**
 * 月份范围工具条
 *
 * 用户 2026-11-01：要能给分期表设起止月，用来延展 / 收缩月份列。
 * 两个输入框 + 一个「自动」。留空 = 按现有分期的首月到最后一期自动算。
 *
 * 只改 state.installRange（{ from, to }，'YYYY-MM'），不碰分期数据 ——
 * 收窄范围只是不显示那几列，格子还在（再放开范围就又能看到）。
 */

const MONTH_RE = /^\d{4}-\d{1,2}$/;

/** '2610' / '2026-10' / '2026/10' → '2026-10'；认不出返回空串 */
export function parseMonthText(raw) {
  const v = String(raw == null ? '' : raw).replace(/[^0-9-/]/g, '').replace(/\//g, '-');
  if (!v) return '';
  if (MONTH_RE.test(v)) {
    const [y, m] = v.split('-');
    return y + '-' + String(Number(m)).padStart(2, '0');
  }
  const d = v.replace(/-/g, '');
  if (d.length === 4) return '20' + d.slice(0, 2) + '-' + d.slice(2);
  if (d.length === 6) return d.slice(0, 4) + '-' + d.slice(4);
  return '';
}

/**
 * @param {{getState:Function, setState:Function, saveNow:Function, render:Function}} ctx
 * @param {HTMLElement} host 表格容器
 * @param {()=>void} onChange 改完之后的回调（通常是重新渲染）
 */
export function mountRangeBar(ctx, host, onChange) {
  let bar = document.getElementById('nt-inst-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'nt-inst-bar';
    bar.className = 'nt-inst-bar';
    if (host && host.parentNode) host.parentNode.insertBefore(bar, host);
  }

  function setRange(key, raw) {
    const st = ctx.getState();
    const next = { ...(st.installRange || {}) };
    const m = parseMonthText(raw);
    if (m) next[key] = m; else delete next[key];
    ctx.setState({ ...st, installRange: next });
    if (ctx.saveNow) ctx.saveNow();
    if (onChange) onChange();
  }

  function render() {
    const cur = ctx.getState().installRange || {};
    bar.textContent = '';

    const label = document.createElement('span');
    label.className = 'nt-inst-bar-label';
    label.textContent = '月份范围';
    bar.appendChild(label);

    for (const key of ['from', 'to']) {
      const inp = document.createElement('input');
      inp.className = 'nt-input nt-input-sm nt-inst-range';
      inp.type = 'text'; inp.inputMode = 'numeric';
      inp.value = cur[key] || '';
      inp.placeholder = key === 'from' ? '起 2610' : '止 2709';
      inp.setAttribute('aria-label', key === 'from' ? '起始月' : '结束月');
      inp.addEventListener('change', () => setRange(key, inp.value));
      bar.appendChild(inp);
    }

    const auto = document.createElement('button');
    auto.type = 'button';
    auto.className = 'nt-btn nt-btn-sm';
    auto.textContent = '自动';
    auto.title = '按现有分期的首月到最后一期自动算';
    auto.addEventListener('click', () => {
      const st = ctx.getState();
      ctx.setState({ ...st, installRange: {} });
      if (ctx.saveNow) ctx.saveNow();
      if (onChange) onChange();
    });
    bar.appendChild(auto);
  }

  return { render };
}
