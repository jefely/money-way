// 界面：节点设置「序」菜单的上移/删除与再次点击收起
import { hideCellMenu } from './cell-menu.js';

export function decorateAccountSeqMenu(id, moveUp, removeAcc) {
  const menu = document.querySelector('.nt-cell-menu');
  if (!menu || menu.hidden) return;
  menu.querySelectorAll('[data-acc-act]').forEach((b) => b.remove());
  const make = (act, text, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nt-cell-menu-btn';
    b.dataset.accAct = act;
    b.textContent = text;
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      hideCellMenu();
      fn();
    });
    return b;
  };
  menu.prepend(make('del', '删除', () => removeAcc(id)));
  menu.prepend(make('up', '上移', () => moveUp(id)));
}

export function bindAccountSeqExtras(tbody, grid, moveUp, removeAcc) {
  // 已是整行选中时再点「序」：取消选择并收起菜单。
  // 必须抢在菜单 outside-click 之前处理，否则它清完选择后 cell-select 会重新选中。
  let suppress = 0;
  const selectedRow = (td) => {
    const tr = td && td.parentElement;
    return tr && tr.dataset.id && tr.querySelectorAll('.nt-range-sel').length >= 3 ? tr : null;
  };
  tbody.addEventListener('pointerdown', (ev) => {
    const td = ev.target.closest && ev.target.closest('.nt-cell-seq');
    if (!td || !selectedRow(td)) return;
    suppress = Date.now() + 500;
    ev.preventDefault();
    ev.stopPropagation();
    grid.select.clear();
  }, true);
  tbody.addEventListener('click', (ev) => {
    const td = ev.target.closest && ev.target.closest('.nt-cell-seq');
    if (!td) return;
    if (Date.now() < suppress) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (selectedRow(td)) {
      ev.preventDefault();
      ev.stopPropagation();
      grid.select.clear();
    }
  }, true);
  tbody.addEventListener('click', (ev) => {
    const td = ev.target.closest && ev.target.closest('.nt-cell-seq');
    if (!td) return;
    const id = td.parentElement && td.parentElement.dataset.id;
    if (!id) return;
    setTimeout(() => decorateAccountSeqMenu(id, moveUp, removeAcc), 0);
  });
  tbody.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest && ev.target.closest('.nt-cell-seq')) return;
    const menu = document.querySelector('.nt-cell-menu');
    if (menu) menu.querySelectorAll('[data-acc-act]').forEach((b) => b.remove());
  }, true);
}
