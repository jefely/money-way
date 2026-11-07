// 界面：流水 tab → 一句话输入的六元素预览
/**
 * 只读预览：把 parsePhrase 的 slots 摆成一行小标签。
 * 层：第五层 · UI（不算钱、不查账户）
 *
 * 六格对应：转出 / 转入 / 类型 / 分类 / 备注分类 / 备注关键字。
 * 没有的格不显示；空输入整行隐藏。
 */

const CLS = 'nt-phrase-chips';

const SLOTS = [
  ['from', '转出'],
  ['to', '转入'],
  ['type', '类型'],
  ['cat', '分类'],
  ['note', '备注'],
  ['kw', '关键字'],
];

function chip(slot, label, value) {
  const el = document.createElement('span');
  el.className = 'nt-phrase-chip';
  el.setAttribute('data-slot', slot);
  const s = document.createElement('span');
  s.className = 'nt-phrase-slot';
  s.textContent = label;
  const v = document.createElement('span');
  v.className = 'nt-phrase-val';
  v.textContent = value;
  el.appendChild(s);
  el.appendChild(v);
  return el;
}

/**
 * @param {HTMLElement} bar composer 根节点（.nt-composer）
 * @returns {{update:(slots:object|null)=>void, host:HTMLElement}}
 */
export function mountPhrasePreview(bar) {
  const host = document.createElement('div');
  host.className = CLS;
  host.hidden = true;
  bar.appendChild(host);

  function update(slots) {
    if (!slots || (!slots.from && !slots.to && !slots.note)) {
      host.hidden = true;
      host.textContent = '';
      return;
    }
    const values = {
      from: slots.from && slots.from.name,
      to: slots.to && slots.to.name,
      type: slots.nodeType,
      cat: slots.nodeCategory,
      note: slots.note && slots.note.type,
      kw: slots.note && slots.note.keyword,
    };
    host.textContent = '';
    let n = 0;
    for (const [key, label] of SLOTS) {
      const value = String(values[key] || '').trim();
      if (!value) continue;
      // 备注与关键字重复时只留「关键字」
      if (key === 'kw' && value === values.note) continue;
      host.appendChild(chip(key, label, value));
      n += 1;
    }
    host.hidden = n === 0;
  }

  return { update, host };
}
