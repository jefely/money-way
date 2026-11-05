// 界面：统计 → 分类查询的候选气泡（输入首字母弹出分类）
/**
 * 分类候选气泡
 * 层：第五层 · UI 渲染
 *
 * 「输入 c 就弹出储蓄」：只负责摆位置与点选，不查账户、不筛流水。
 * 视觉复用 suggest.css 的 .nt-suggest 系列（首字母 / 分类名 / 节点数）。
 *
 * 和账户候选气泡是**两个独立单例**：那个只在流水/查询页用，
 * 这个只在统计页的分类查询框用，互不干扰。
 */

const CLS = {
  pop: 'nt-suggest',
  item: 'nt-suggest-item',
  code: 'nt-suggest-code',
  name: 'nt-suggest-name',
  cat: 'nt-suggest-cat',
};

let pop = null;
let anchor = null;
let onPick = null;

function ensure() {
  if (pop && document.body.contains(pop)) return pop;
  pop = document.createElement('div');
  pop.className = CLS.pop;
  pop.hidden = true;
  pop.setAttribute('role', 'listbox');
  document.body.appendChild(pop);

  // 点外面收起（捕获阶段，早于输入框自己的处理）
  document.addEventListener('pointerdown', (ev) => {
    if (!pop || pop.hidden) return;
    if (pop.contains(ev.target) || ev.target === anchor) return;
    hideCatSuggest();
  }, true);

  return pop;
}

/**
 * 展示分类候选。
 * @param {HTMLInputElement} input 输入框
 * @param {Array<{name:string, initials:string, count:number}>} items
 * @param {(name:string)=>void} pick 选中回调
 */
export function showCatSuggest(input, items, pick) {
  const el = ensure();
  anchor = input;
  onPick = pick;
  el.textContent = '';

  for (const it of items || []) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = CLS.item;
    row.setAttribute('role', 'option');
    row.dataset.name = it.name;

    const ini = document.createElement('span');
    ini.className = CLS.code;
    ini.textContent = it.initials || '—';

    const name = document.createElement('span');
    name.className = CLS.name;
    name.textContent = it.name;

    const cnt = document.createElement('span');
    cnt.className = CLS.cat;
    cnt.textContent = it.count + ' 个节点';

    row.appendChild(ini);
    row.appendChild(name);
    row.appendChild(cnt);

    // 和账户气泡同一个原因：必须用 pointerdown 选中。
    // 等 click 的话，按下的默认动作已经让输入框失焦、气泡被收起，
    // click 落在 body 上 —— 用户看到「点了没反应」。
    let picked = false;
    const take = () => {
      if (picked) return;
      picked = true;
      if (onPick) onPick(it.name);
      hideCatSuggest();
    };
    row.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      ev.preventDefault();
      ev.stopPropagation();
      take();
    });
    row.addEventListener('click', take);

    el.appendChild(row);
  }

  place(input);
  el.hidden = false;
}

/** 定位：输入框下方，越界翻到上方 */
function place(input) {
  if (!pop || !input) return;
  const r = input.getBoundingClientRect();
  pop.style.left = Math.max(8, r.left) + 'px';
  pop.style.minWidth = Math.max(180, r.width) + 'px';
  pop.style.top = (r.bottom + 4) + 'px';

  const h = pop.offsetHeight || 0;
  if (r.bottom + 4 + h > (window.innerHeight - 8)) {
    pop.style.top = Math.max(8, r.top - 4 - h) + 'px';
  }
}

export function hideCatSuggest() {
  if (pop) pop.hidden = true;
  anchor = null;
  onPick = null;
}

/** 气泡是否挂在这个输入框上 */
export function isCatSuggestFor(el) {
  return !!pop && !pop.hidden && anchor === el;
}
