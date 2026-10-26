/**
 * 行内编辑（UI 层）
 *
 * 只做一件事：把「哪个格子被改成了什么」转成回调，其余交给调用方。
 * 不碰 state、不碰存储 —— 所以这里没有任何业务判断。
 *
 * 为什么不在每次 keydown 就写盘：IndexedDB 事务有固定开销，
 * 连续打字会排一长串事务。由调用方做防抖（300ms）即可，
 * 加密本身只要 2ms（见 _tools/bench_crypto.mjs），不是瓶颈。
 */

/**
 * @param {HTMLElement} tbody
 * @param {{
 *   onEdit:(id:string, field:string, value:string)=>void,
 *   onCreate:(fields:Record<string,string>)=>void,
 *   onDelete:(id:string)=>void,
 *   onCommit:()=>void
 * }} handlers
 */
export function bindRowEditing(tbody, handlers) {
  // 输入：改已有行 → onEdit；改「新增行」→ 攒着，失焦时 onCreate
  tbody.addEventListener('input', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || !input.dataset.field) return;

    const tr = input.closest('tr');
    if (!tr) return;

    if (tr.dataset.new === '1') return;   // 新增行等失焦再建单

    const id = tr.dataset.id;
    if (!id) return;
    handlers.onEdit(id, input.dataset.field, input.value);
  });

  // 聚焦即全选：金额格里有「¥1,400.00」，直接打字就能覆盖，不用先删符号
  tbody.addEventListener('focusin', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT') return;
    if (input.dataset.field === 'amount' || input.dataset.field === 'date') {
      try { input.select(); } catch (e) {}
    }
  });

  // 回车：跳到下一格；在最后一格则提交
  tbody.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || !input.dataset.field) return;
    ev.preventDefault();
    input.blur();
    handlers.onCommit();
  });

  // 新增行失焦：有内容就建单
  tbody.addEventListener('focusout', (ev) => {
    const input = ev.target;
    if (!input || input.tagName !== 'INPUT' || !input.dataset.field) return;
    const tr = input.closest('tr');
    if (!tr || tr.dataset.new !== '1') return;

    // 整行读一遍（用户可能连填了几格）
    const fields = {};
    tr.querySelectorAll('input[data-field]').forEach((el) => {
      const v = String(el.value || '').trim();
      if (v) fields[el.dataset.field] = v;
    });
    // 至少要有金额或一个账户，才算一笔
    if (!fields.amount && !fields.from && !fields.to) return;
    handlers.onCreate(fields);
  });

  // 删除
  tbody.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.nt-cell-action button');
    if (!btn) return;
    const tr = btn.closest('tr');
    if (!tr || !tr.dataset.id) return;
    handlers.onDelete(tr.dataset.id);
  });
}
