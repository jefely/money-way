/**
 * 单页 7-tab 路由（UI 层）
 * 层：第五层 · UI
 *
 * 只做「切视图」：点 .nt-tab → 显示对应 .nt-view → 通知调用方。
 * 不碰 state、不算钱、不碰存储。
 */

/**
 * @param {{defaultTab?:string, onShow?:(name:string)=>void}} opts
 * @returns {{show:(name:string)=>void, current:()=>string}}
 */
export function bindTabs(opts) {
  const o = opts || {};
  const nav = document.querySelector('.nt-tabs');
  const views = Array.from(document.querySelectorAll('.nt-view'));

  let current = '';

  function show(name) {
    const target = String(name || 'flow');
    current = target;
    for (const v of views) {
      v.hidden = v.getAttribute('data-view') !== target;
    }
    const tabs = nav ? nav.querySelectorAll('.nt-tab') : [];
    for (const b of tabs) {
      b.setAttribute('aria-selected', b.getAttribute('data-tab') === target ? 'true' : 'false');
    }
    if (typeof o.onShow === 'function') o.onShow(target);
  }

  if (nav) {
    nav.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.nt-tab');
      if (btn) show(btn.getAttribute('data-tab'));
    });
  }

  show(o.defaultTab || 'flow');
  return { show, current: () => current };
}
