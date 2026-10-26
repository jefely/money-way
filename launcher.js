/**
 * NT账本 · 启动器
 *
 * 只有一个下拉框：选版本号 → 进入。
 * 清单来自 versions.json（加一项就多一个选项，本文件不用改）。
 */

const LIST = './versions.json';

let items = [];

/** 选项文本：版本号 · 类型 */
function labelOf(item) {
  const kind = item.kind === 'multi' ? '多文件版' : '单文件版';
  return `${item.label} · ${kind}`;
}

function note(text, bad) {
  const el = document.getElementById('la-note');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('la-note-bad', !!bad);
}

/** 进到选中的版本 */
function go(index) {
  const item = items[index];
  if (!item || !item.path) return;
  location.href = item.path;
}

function fill() {
  const sel = document.getElementById('la-select');
  sel.textContent = '';
  items.forEach((item, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = labelOf(item);
    sel.appendChild(opt);
  });

  // 默认选「当前」那个
  const current = items.findIndex((it) => it.current);
  sel.value = String(current >= 0 ? current : 0);

  sel.addEventListener('change', () => go(Number(sel.value)));
}

function bindForm() {
  const form = document.getElementById('la-form');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const sel = document.getElementById('la-select');
    go(Number(sel.value));
  });
}

async function main() {
  try {
    const res = await fetch(LIST, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('清单为空');
    fill();
    bindForm();
    note('');
  } catch (e) {
    note('版本清单读取失败：' + e.message, true);
  }
}

main();
