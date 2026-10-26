/**
 * 添加账本 / 流水 弹窗（SPA 内，不跳转、不重输密码）
 * 层：第五层 · UI
 *
 * 布局按单文件版：两个分组框 —— 「添加账本」「添加流水」。
 */

import * as NtModal from './modal.js';
import { parseLedgerText } from '../core/import-parser.js';
import { appendLedgerFromText } from '../core/flow-text.js';
import { listLedgers, createLedger, switchLedger, renameLedger, removeLedger } from '../core/ledgers.js';

const PLACEHOLDER = [
  '账户：',
  '类型，分类，简码，名称，期初，账单日，还款日，',
  '资产类，现金，XJ，现金，200，',
  '',
  '流水：',
  '日期，转出，转入，金额，备注，',
  '260801，XJ，S，3.5，',
].join('\n');

/**
 * @param {{getState:Function, setState:Function, save?:Function, setFooter?:Function}} ctx
 */
export function openAddDialog(ctx) {
  let text = '';
  let ta = null;
  let info = null;

  function applyState(next) {
    ctx.setState(next);
    if (ctx.save) ctx.save();
  }

  function reopen() {
    NtModal.closeAll();
    openAddDialog(ctx);
  }

  function updateInfo() {
    if (!info) return;
    const parsed = parseLedgerText(text);
    const parts = ['账户 ' + parsed.accounts.length + ' 个', '流水 ' + parsed.transactions.length + ' 笔'];
    if (parsed.errors.length) parts.push('错误 ' + parsed.errors.length + ' 行');
    info.textContent = '识别到：' + parts.join('，');
  }

  function applyAdd() {
    const t = String(text || '').trim();
    if (!t) return;
    const r = appendLedgerFromText(ctx.getState(), t);
    applyState(r.state);
    NtModal.closeAll();
    if (ctx.setFooter) {
      const extra = r.created.length ? `，新建 ${r.created.length} 个账户` : '';
      ctx.setFooter(`已添加 ${r.txAdded} 笔${extra}`);
    }
  }

  function buildLedgers() {
    const box = document.createElement('div');
    box.className = 'nt-add-group';

    const head = document.createElement('div');
    head.className = 'nt-add-group-title';
    head.textContent = '添加账本';
    box.appendChild(head);

    const st = ctx.getState();
    for (const l of listLedgers(st)) {
      const row = document.createElement('div');
      row.className = 'nt-add-ledger';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'nt-add-ledger-check';
      cb.checked = l.active;
      cb.addEventListener('change', () => {
        if (l.active) { cb.checked = true; return; }
        applyState(switchLedger(ctx.getState(), l.id));
        reopen();
      });

      const name = document.createElement('input');
      name.className = 'nt-add-ledger-name';
      name.value = l.name;
      name.readOnly = true;

      const rn = document.createElement('button');
      rn.type = 'button';
      rn.className = 'nt-btn nt-btn-sm';
      rn.textContent = '改名';
      rn.addEventListener('click', () => {
        const v = window.prompt('账本名称', l.name);
        if (!v || !v.trim()) return;
        applyState(renameLedger(ctx.getState(), l.id, v));
        reopen();
      });

      row.appendChild(cb);
      row.appendChild(name);
      row.appendChild(rn);

      if (!l.active) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'nt-btn nt-btn-sm';
        del.textContent = '×';
        del.title = '删除账本';
        del.addEventListener('click', () => {
          applyState(removeLedger(ctx.getState(), l.id));
          reopen();
        });
        row.appendChild(del);
      }

      box.appendChild(row);
    }

    const nrow = document.createElement('div');
    nrow.className = 'nt-add-ledger-new';

    const nin = document.createElement('input');
    nin.className = 'nt-add-ledger-input';
    nin.placeholder = '输入新账本名称…';

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'nt-btn nt-btn-sm';
    clear.textContent = '×';
    clear.title = '清空';
    clear.addEventListener('click', () => { nin.value = ''; });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'nt-btn nt-btn-sm';
    add.textContent = '添加';
    add.addEventListener('click', () => {
      const n = nin.value.trim();
      if (!n) return;
      applyState(createLedger(ctx.getState(), n));
      reopen();
    });

    nrow.appendChild(nin);
    nrow.appendChild(clear);
    nrow.appendChild(add);
    box.appendChild(nrow);

    return box;
  }

  function buildFlow() {
    const box = document.createElement('div');
    box.className = 'nt-add-group';

    const head = document.createElement('div');
    head.className = 'nt-add-group-title';
    head.textContent = '添加流水';
    box.appendChild(head);

    const bar = document.createElement('div');
    bar.className = 'nt-add-bar';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'nt-btn nt-btn-sm';
    loadBtn.textContent = '载入 .txt';

    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.txt,text/plain';
    file.hidden = true;
    loadBtn.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      text = await f.text();
      ta.value = text;
      updateInfo();
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'nt-btn nt-btn-sm';
    saveBtn.textContent = '另存 .txt';
    saveBtn.addEventListener('click', () => {
      const blob = new Blob([ta.value], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'nt-流水.txt';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    bar.appendChild(loadBtn);
    bar.appendChild(saveBtn);
    bar.appendChild(file);
    box.appendChild(bar);

    ta = document.createElement('textarea');
    ta.className = 'nt-add-text';
    ta.placeholder = PLACEHOLDER;
    ta.addEventListener('input', () => {
      text = ta.value;
      updateInfo();
    });
    box.appendChild(ta);

    info = document.createElement('div');
    info.className = 'nt-add-info';
    info.textContent = '识别到：账户 0 个，流水 0 笔';
    box.appendChild(info);

    return box;
  }

  return NtModal.open({
    title: '添加账本 · 流水记录',
    build: (body) => {
      body.appendChild(buildLedgers());
      body.appendChild(buildFlow());
    },
    actions: [
      { label: '确认添加', kind: 'primary', onClick: applyAdd },
    ],
  });
}
