// 界面：设置 tab → 新增/编辑账户弹窗
/**
 * 账户管理弹窗（UI 层）
 *
 * 列出账户并支持就地改：简码 / 名字 / 类型 / 统计分类。
 * 所有写操作交给调用方；本文件只收集输入、显示状态。
 *
 * 新增账户用 NtModal.prompt（不开原生 window.prompt）。
 */

import * as NtModal from './modal.js';

export const TYPES = ['资产类', '负债类', '权益类', '收入类', '费用类'];

/**
 * @param {{
 *   accounts: Array<{id,code,name,type,category,isHidden}>,
 *   onUpdate: (id:string, patch:object) => Promise<unknown>,
 *   onAdd: (patch:object) => Promise<unknown>,
 *   onRefresh: () => void,
 *   onClose?: () => void
 * }} opts
 */
export function openAccountDialog(opts) {
  const o = opts || {};

  const dlg = NtModal.open({
    title: '账户',
    build: (body) => {
      const list = document.createElement('div');
      list.className = 'nt-acc-list';

      const visible = (o.accounts || []).filter((a) => !a.isHidden);
      if (!visible.length) {
        const empty = document.createElement('p');
        empty.className = 'nt-acc-empty';
        empty.textContent = '还没有账户，往下点「新增账户」';
        list.appendChild(empty);
      }
      for (const acc of visible) list.appendChild(accRow(acc, o));

      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'nt-btn nt-btn-primary nt-acc-add';
      add.textContent = '＋ 新增账户';
      add.addEventListener('click', () => addFlow(o));

      body.appendChild(list);
      body.appendChild(add);
    },
    actions: [{ label: '完成', kind: 'primary', close: true }],
    onClose: o.onClose,
  });

  return dlg;
}

/** 一行账户：四个格子 + 删除 */
function accRow(acc, o) {
  const box = document.createElement('div');
  box.className = 'nt-acc-row';

  const code = input('nt-acc-code', acc.code, '简码', () => {
    Promise.resolve(o.onUpdate(acc.id, { code })).then(o.onRefresh);
  });
  const name = input('nt-acc-name', acc.name, '账户名称', () => {
    Promise.resolve(o.onUpdate(acc.id, { name })).then(o.onRefresh);
  });

  const type = document.createElement('select');
  type.className = 'nt-input nt-acc-type';
  type.setAttribute('aria-label', '账户类型');
  for (const t of TYPES) {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (t === acc.type) opt.selected = true;
    type.appendChild(opt);
  }
  type.addEventListener('change', () => {
    Promise.resolve(o.onUpdate(acc.id, { type: type.value })).then(o.onRefresh);
  });

  const cat = input('nt-acc-cat', acc.category, '统计分类', () => {
    Promise.resolve(o.onUpdate(acc.id, { category: cat })).then(o.onRefresh);
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'nt-btn nt-btn-icon';
  del.textContent = '×';
  del.title = '删账户（会连带删掉它的流水）';
  del.setAttribute('aria-label', '删除账户');
  del.addEventListener('click', () => {
    if (typeof o.onDelete !== 'function') return;
    NtModal.confirmDanger(
      '删除账户',
      `删除「${acc.name}」会同时删掉它参与的所有流水，不可恢复。`,
      () => { Promise.resolve(o.onDelete(acc.id)).then(o.onRefresh); },
      '确认删除',
    );
  });

  box.appendChild(code);
  box.appendChild(name);
  box.appendChild(type);
  box.appendChild(cat);
  box.appendChild(del);
  return box;
}

/** 造一个输入框，change 时回调 */
function input(cls, value, label, onCommit) {
  const el = document.createElement('input');
  el.className = 'nt-input ' + cls;
  el.value = value == null ? '' : String(value);
  el.setAttribute('aria-label', label);
  el.addEventListener('change', onCommit);
  return el;
}

/** 新增账户：名字 → 简码（可空）→ 类型 */
function addFlow(o) {
  NtModal.prompt('新增账户', '', (name) => {
    const n = String(name || '').trim();
    if (!n) return false;
    NtModal.prompt(`「${n}」的简码（2~5 位，可留空自动生成）`, '', (code) => {
      Promise.resolve(o.onAdd({ name: n, code: String(code || '').trim(), category: '未分类' }))
        .then(o.onRefresh);
      return true;
    }, { placeholder: '如 ZHC' });
    return true;   // 先关掉名字弹窗，再开简码弹窗
  }, { label: '账户名称', okLabel: '下一步' });
}
