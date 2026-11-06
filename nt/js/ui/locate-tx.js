// 界面：从校验跳到出问题的那一笔
/**
 * 点校验里的问题条目 → 切到流水页并把那一行高亮两秒（用户 2026-11）。
 *
 * 用「点 tab」而不是调某个 switchView 函数：tab 的点击处理是现成的，
 * 而且视图切过去之后流水表会自己重画，这里等一帧再找那一行就行。
 * 找不到（比如那笔已经被删了）就静默返回，不报错。
 */
export function locateTx(id) {
  if (!id) return;
  const tab = document.querySelector('[data-tab="flow"]');
  if (tab) tab.click();
  setTimeout(() => {
    const tr = document.querySelector(`#nt-flow-body tr[data-id="${id}"]`);
    if (!tr) return;
    tr.scrollIntoView({ block: 'center' });
    tr.classList.add('nt-row-locate');
    setTimeout(() => tr.classList.remove('nt-row-locate'), 2200);
  }, 160);
}
