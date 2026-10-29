// 界面：共用的 datalist（类型候选）
/**
 * 输入框的候选列表（用户 2026-10-30：类型可以自己填，候选要动态更新）
 *
 * 同一 id 只建一个 <datalist>，内容变了才重写。
 * 调用方负责给 input 加 `list="<id>"`。
 */

export function ensureDatalist(id, values) {
  let dl = document.getElementById(id);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = id;
    document.body.appendChild(dl);
  }
  const list = (values || []).slice();
  if ([...dl.options].map((o) => o.value).join('\u0000') === list.join('\u0000')) return;
  dl.textContent = '';
  for (const v of list) {
    const o = document.createElement('option');
    o.value = v;
    dl.appendChild(o);
  }
}
