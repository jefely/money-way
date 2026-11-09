// 界面：流水 tab / 查询 tab → 账户候选气泡
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

      // 关键：在 **pointerdown** 里选中，而不是等 click。
      // 手指/鼠标按下的默认动作会把焦点从输入框移走 → focusout 立刻
      // resolveField() → hideSuggest()，气泡（连同这个按钮）先被隐藏，
      // 随后的 click 只能落在 body 上 —— 用户看到的就是「点了没反应，
      // 只是把输入的字解析了一下」（2026-11 用户报「候选点选失效」）。
      // pointerdown 早于默认的 blur；preventDefault 再把焦点留在输入框。
      let picked = false;
      const pick = () => {
        if (picked) return;
        picked = true;
        if (_onPick) _onPick(acc);
        hideSuggest();
      };
      row.addEventListener('pointerdown', (ev) => {
        if (ev.button !== 0 && ev.pointerType === 'mouse') return;
        ev.preventDefault();
        ev.stopPropagation();
        pick();
      });
      // 键盘/辅助技术触发的合成 click 仍保留
      row.addEventListener('click', pick);
      pop.appendChild(row);
    }
  }

  place(anchor);
  pop.hidden = false;
}

/** 定位：默认在输入框下方，超出**可视区**就翻到上方（键盘弹出后 innerHeight 已经不是真值） */
function place(anchor) {
  const pop = _pop;
  if (!pop || !anchor) return;

  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, r.left) + 'px';
  pop.style.minWidth = Math.max(160, r.width) + 'px';

  const vv = window.visualViewport;
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;

  // 先放下去量高度，再决定翻不翻
  pop.style.top = (r.bottom + 4) + 'px';
  const h = pop.offsetHeight || 0;
  const overflow = r.bottom + 4 + h > (viewBottom - 8);
  if (overflow) {
    pop.style.top = Math.max(vv ? vv.offsetTop + 8 : 8, r.top - 4 - h) + 'px';
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
