/**
 * 添加账本 / 流水 弹窗（SPA 内，不跳转、不重输密码）
 * 层：第五层 · UI
 *
 * 复用一个文本框：粘贴或载入 .txt，实时解析预览，确认后追加到当前账本。
 */

import * as NtModal from './modal.js';
import { parseLedgerText } from '../core/import-parser.js';
import { appendLedgerFromText } from '../core/flow-text.js';

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
    ctx.setState(r.state);
    if (ctx.save) ctx.save();
    NtModal.closeAll();
    if (ctx.setFooter) {
      const extra = r.created.length ? `，新建 ${r.created.length} 个账户` : '';
      ctx.setFooter(`已添加 ${r.txAdded} 笔${extra}`);
    }
  }

  return NtModal.open({
    title: '添加账本 · 流水记录',
    build: (body) => {
      ta = document.createElement('textarea');
      ta.className = 'nt-add-text';
      ta.placeholder = PLACEHOLDER;

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

      info = document.createElement('div');
      info.className = 'nt-add-info';
      info.textContent = '识别到：账户 0 个，流水 0 笔';

      ta.addEventListener('input', () => {
        text = ta.value;
        updateInfo();
      });

      body.appendChild(ta);
      body.appendChild(bar);
      body.appendChild(info);
    },
    actions: [
      { label: '确认添加', kind: 'primary', onClick: applyAdd },
    ],
  });
}
