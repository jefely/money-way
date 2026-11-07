// 界面：流水工具条「导入」→ 一个窗口里同时做文件导入和文本导入
/**
 * 导入入口（UI 层）
 *
 * 用户 2026-11：不要再弹第二层「导入预览」，把预览并进这个窗口；
 * 布局照给定样式：
 *   文件导入（起始日期 / 我的账户 / 打开 / 导入 + 预览框）
 *   文本导入（打开 / 导入 + 文本框）
 *
 * 解析全在 core（xlsx-read / import-table / bill-plan），这里只管
 * 选择文件、拼预览文字、把结果交给 onImport。
 */

import * as NtModal from './modal.js';
import { readAnyTable } from './xlsx-read.js';
import { analyzeTable } from '../core/import-table.js';
import { planBillImport } from '../core/bill-plan.js';
import { money } from '../core/format.js';
import { pickTemplateSheets } from '../core/xlsx-template.js';
import { isBackupText } from '../core/backup-file.js';
import { askPassword, loadBackupFile } from './import-backup.js';
import { pickTextFile } from './file-io.js';

const PLACEHOLDER = [
  '账户：',
  '类型，分类，简码，名称，期初，账单日，还款日，',
  '',
  '流水：',
  '日期，转出，转入，金额，备注，',
  '260801，XJ，ZHC，3.5，午饭',
].join('\n');

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const hint = (text, strong) => el('p', strong ? 'nt-sync-hint nt-imp-h' : 'nt-sync-hint nt-imp-sub', text);

function labelOf(text, control) {
  const label = el('label', 'nt-imp-cell', text + ' ');
  control.classList.add('nt-input', 'nt-input-sm');
  label.appendChild(control);
  return label;
}

const button = (text, cls) => {
  const b = el('button', cls || 'nt-btn nt-btn-sm', text);
  b.type = 'button';
  return b;
};

/** 清单里只放真实账户：期初余额（isHidden）不是「我的账户」 */
function myAccountPick(accounts, presetId, cardTail) {
  const picks = (accounts || []).filter((a) => a && !a.isHidden && a.id !== '__OPENING__');
  const re = presetId === 'wechat' ? /微信|零钱/ : presetId === 'alipay' ? /支付宝|余额/ : null;
  let hit = re ? picks.find((a) => re.test(String(a.name || ''))) : null;
  if (!hit && cardTail) hit = picks.find((a) => String(a.name || '').includes(cardTail));
  if (!hit) hit = picks.find((a) => a.type === '资产类');
  return hit || null;
}

/** 一行账单/表格 → 预览里的一行文字 */
function previewLine(row) {
  const sign = row.dir === 'out' ? '-' : '+';
  const to = row.toName || (row.otherSuggest && row.otherSuggest.name) || '?';
  return `${row.date}  ${sign}${money(row.amount)}  ${row.fromName || '?'} → ${to}  ${row.note || ''}`.trim();
}

/**
 * @param {{
 *   getAccounts?:()=>Array, accounts?:Array,
 *   onImport?:(result:object)=>void,
 *   onImportTemplate?:(state:object, stats:object)=>void,
 *   onBackup?:(text:string)=>void,
 *   mergeText?:(text:string)=>number,
 *   setFooter?:(text:string)=>void,
 * }} opts
 */
export function openImportHub(opts) {
  const o = opts || {};
  const accounts = typeof o.getAccounts === 'function' ? o.getAccounts() : (o.accounts || []);

  let dlg = null;
  let result = null;
  let ta = null;
  let previewEl = null;
  let fromEl = null;
  let mySel = null;
  let myWrap = null;
  let backupErr = null;

  const refresh = () => {
    if (!previewEl) return;
    if (!result) {
      previewEl.value = '';
      return;
    }
    const from = fromEl ? fromEl.value || '' : '';
    const myId = mySel ? mySel.value || '' : '';

    if (result.kind === 'bill') {
      const plan = planBillImport(result.items, {
        accounts,
        from,
        presetId: result.presetId,
        myAccountId: myId,
      });
      const s = plan.stats;
      const lines = [result.note];
      lines.push(from ? `起始日之后 ${s.kept} 笔（早于它跳过 ${s.before} 笔）` : `可导入 ${s.kept} 笔`);
      lines.push(`支出 ${money(s.sumOut)} / 收入 ${money(s.sumIn)}`);
      if (s.neutral) lines.push(`中性交易 ${s.neutral} 笔跳过（不计收支 / 转账）`);
      if (s.willCreate) lines.push(`将按分类新建 ${s.willCreate} 个节点`);
      lines.push('');
      for (const row of plan.rows.slice(0, 10)) lines.push(previewLine(row));
      if (plan.rows.length > 10) lines.push(`…… 还有 ${plan.rows.length - 10} 笔`);
      previewEl.value = lines.join('\n');
      return;
    }

    if (result.kind === 'generic') {
      const lines = [result.note, ''];
      for (const it of result.items.slice(0, 10)) {
        lines.push(`${it.date}  ${money(it.amount)}  ${it.from || '?'} → ${it.to || '?'}  ${it.note || ''}`.trim());
      }
      if (result.items.length > 10) lines.push(`…… 还有 ${result.items.length - 10} 笔`);
      previewEl.value = lines.join('\n');
      return;
    }

    previewEl.value = `${result.note}\n\n`
      + '可以换一个文件；如果是任意表格，也可以把内容粘到下面的「文本导入」。';
  };

  /** 账单段：只收账单/表格。备份类文件提示用户去下面的「备份文件导入」 */
  async function loadBillFile(file) {
    if (!file) return;
    result = null;
    if (previewEl) previewEl.value = `正在读取 ${file.name} …`;

    if (/\.lz$/i.test(file.name)) {
      if (previewEl) previewEl.value = '这是 .lz 快照，请用下面的「备份文件导入」。';
      return;
    }

    if (!/\.xlsx?$/i.test(file.name)) {
      let text = '';
      try { text = await file.text(); } catch (e) { text = ''; }
      if (isBackupText(text)) {
        if (previewEl) previewEl.value = '这是加密备份，请用下面的「备份文件导入」。';
        return;
      }
    }

    try {
      const book = await readAnyTable(file);
      const picked = pickTemplateSheets(book.sheets);
      if (picked.isTemplate) {
        if (previewEl) previewEl.value = '这是整本 Excel 备份，请用下面的「备份文件导入」。';
        return;
      }
      const sheet = book.sheets[0];
      if (!sheet) throw new Error('这个文件里没有可读的表');
      const r = analyzeTable(sheet.rows);
      r.fileName = file.name;
      r.sheetName = sheet.name;
      result = r;
      if (mySel && r.kind === 'bill') {
        const pick = myAccountPick(accounts, r.presetId, r.hints && r.hints.cardTail);
        if (pick) mySel.value = pick.id;
      }
      refresh();
    } catch (e) {
      if (previewEl) previewEl.value = '读取失败：' + ((e && e.message) || e);
    }
  }

  function pickFile(accept, onPick) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      await onPick(file);
    });
    input.click();
  }

  const openBillFile = () => pickFile('.xlsx,.csv,.txt,.tsv,.json', loadBillFile);

  function openBackupFile() {
    pickFile('.lz,.txt,.json,.xlsx', async (file) => {
      if (backupErr) backupErr.textContent = '';
      await loadBackupFile(file, o, (msg) => { if (backupErr) backupErr.textContent = msg; });
    });
  }

  async function openTextFile() {
    try {
      const picked = await pickTextFile('.txt,.csv,.md,.tsv,text/plain');
      ta.value = picked.text;
      ta.focus();
    } catch (e) {
      /* 用户取消 */
    }
  }

  function doImport() {
    if (!result || !result.items || !result.items.length) {
      if (previewEl) previewEl.value = '还没有可导入的记录：先「打开」一个账单文件。';
      return;
    }
    result.fromDate = fromEl ? fromEl.value || '' : '';
    result.myAccountId = mySel ? mySel.value || '' : '';
    if (dlg) dlg.close();
    if (typeof o.onImport === 'function') o.onImport(result);
  }

  function doTextImport() {
    const text = String((ta && ta.value) || '').trim();
    if (!text) return;
    if (isBackupText(text)) {
      askPassword(text, o);
      return;
    }
    if (typeof o.mergeText !== 'function') return;
    let n = 0;
    try {
      n = o.mergeText(text);
    } catch (e) {
      if (typeof o.setFooter === 'function') o.setFooter('导入失败：' + ((e && e.message) || e));
      return;
    }
    if (dlg) dlg.close();
    if (typeof o.setFooter === 'function') {
      o.setFooter(n ? `已导入 ${n} 笔流水` : '这段文本里没有新记录（可能都已经有了）');
    }
  }

  dlg = NtModal.open({
    title: '导入',
    autoFocus: false,
    build: (body) => {
      body.appendChild(hint('账单导入', true));
      body.appendChild(hint('（支付宝 / 微信 / 招商银行导出的 Excel、CSV）'));

      const row = el('div', 'nt-imp-row');
      fromEl = el('input');
      fromEl.type = 'date';
      row.appendChild(labelOf('起始日期', fromEl));
      const openBtn = button('打开', 'nt-btn nt-btn-sm nt-exp-main');
      openBtn.addEventListener('click', openBillFile);
      row.appendChild(openBtn);

      mySel = el('select');
      myWrap = labelOf('我的账户', mySel);
      for (const acc of accounts.filter((a) => a && !a.isHidden && a.id !== '__OPENING__')) {
        const opt = el('option', null, (acc.code ? acc.code + ' · ' : '') + (acc.name || ''));
        opt.value = acc.id;
        mySel.appendChild(opt);
      }
      row.appendChild(myWrap);
      const goBtn = button('导入', 'nt-btn nt-btn-sm');
      goBtn.addEventListener('click', doImport);
      row.appendChild(goBtn);
      body.appendChild(row);

      body.appendChild(hint('导入预览：', true));
      previewEl = el('textarea', 'nt-imp-preview');
      previewEl.readOnly = true;
      previewEl.placeholder = '导入预览：';
      previewEl.spellcheck = false;
      body.appendChild(previewEl);

      body.appendChild(hint('备份文件导入', true));
      body.appendChild(hint('（.lz 快照 / 加密备份 / 整本 Excel 备份，会替换当前账本）'));
      const brow = el('div', 'nt-imp-row nt-imp-row-end');
      const bOpen = button('打开', 'nt-btn nt-btn-sm');
      bOpen.addEventListener('click', openBackupFile);
      brow.appendChild(bOpen);
      body.appendChild(brow);
      backupErr = el('p', 'nt-sync-hint nt-imp-sub nt-import-map-err');
      body.appendChild(backupErr);

      body.appendChild(hint('文本导入', true));
      body.appendChild(hint('（粘贴流水记录文本，合并进当前账本）'));

      const trow = el('div', 'nt-imp-row nt-imp-row-end');
      const tOpen = button('打开', 'nt-btn nt-btn-sm');
      tOpen.addEventListener('click', openTextFile);
      trow.appendChild(tOpen);
      const tGo = button('导入', 'nt-btn nt-btn-sm');
      tGo.addEventListener('click', doTextImport);
      trow.appendChild(tGo);
      body.appendChild(trow);

      ta = el('textarea', 'nt-exp-out');
      ta.spellcheck = false;
      ta.placeholder = PLACEHOLDER;
      body.appendChild(ta);

      fromEl.addEventListener('change', refresh);
      mySel.addEventListener('change', refresh);
    },
  });

  return dlg;
}
