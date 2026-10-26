/**
 * 候选气泡（输入简码时的联想列表）
 * 层：第五层 · UI 渲染
 *
 * 只负责"把候选摆在哪、点了回什么"，不查账户、不做解析。
 * 手机上气泡最多 5 项，且自动避开键盘（放不下就翻到输入框上方）。
 */

const CLS = {
  pop: 'nt-suggest',
  item: 'nt-suggest-item',
  code: 'nt-suggest-code',
  name: 'nt-suggest-name',
  cat: 'nt-suggest-cat',
  empty: 'nt-suggest-empty',
};

let _pop = null;
let _anchor = null;
let _onPick = null;

function ensure() {
  if (_pop && document.body.contains(_pop)) return _pop;
  _pop = document.createElement('div');
  _pop.className = CLS.pop;
  _pop.hidden = true;
  _pop.setAttribute('role', 'listbox');
  document.body.appendChild(_pop);

  // 点外面就收起（捕获阶段，避免被输入框的失焦抢先）
  document.addEventListener('pointerdown', (ev) => {
    if (!_pop || _pop.hidden) return;
    if (_pop.contains(ev.target) || ev.target === _anchor) return;
    hideSuggest();
  }, true);

  return _pop;
}

/**
 * 展示候选。
 * @param {HTMLElement} anchor 输入框
 * @param {Array<{acc:object}>} items
 * @param {(acc:object)=>void} onPick
 */
export function showSuggest(anchor, items, onPick) {
  const pop = ensure();
  _anchor = anchor;
  _onPick = onPick;

  pop.textContent = '';

  if (!items || !items.length) {
    const empty = document.createElement('div');
    empty.className = CLS.empty;
    empty.textContent = '没有匹配的账户';
    pop.appendChild(empty);
  } else {
    for (const it of items) {
      const acc = it.acc;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = CLS.item;
      row.setAttribute('role', 'option');

      const code = document.createElement('span');
      code.className = CLS.code;
      code.textContent = acc.code || '—';

      const name = document.createElement('span');
      name.className = CLS.name;
      name.textContent = acc.name || '';

      const cat = document.createElement('span');
      cat.className = CLS.cat;
      cat.textContent = acc.category || '';

      row.appendChild(code);
      row.appendChild(name);
      row.appendChild(cat);
      row.addEventListener('click', () => {
        if (_onPick) _onPick(acc);
        hideSuggest();
      });
      pop.appendChild(row);
    }
  }

  place(anchor);
  pop.hidden = false;
}

/** 定位：默认在输入框下方，超出视口就翻到上方 */
function place(anchor) {
  const pop = _pop;
  if (!pop || !anchor) return;

  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, r.left) + 'px';
  pop.style.minWidth = Math.max(160, r.width) + 'px';

  // 先放下去量高度，再决定翻不翻
  pop.style.top = (r.bottom + 4) + 'px';
  const h = pop.offsetHeight || 0;
  const overflow = r.bottom + 4 + h > (window.innerHeight - 8);
  if (overflow) {
    pop.style.top = Math.max(8, r.top - 4 - h) + 'px';
  }
}

export function hideSuggest() {
  if (_pop) _pop.hidden = true;
  _anchor = null;
  _onPick = null;
}

/** 当前气泡是否挂在这个输入框上 */
export function isSuggestFor(el) {
  return !!_pop && !_pop.hidden && _anchor === el;
}
