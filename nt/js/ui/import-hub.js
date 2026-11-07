// 界面：流水工具条「导入」→ 一个窗口、一个输入框
/**
 * 导入入口（UI 层）
 *
 * 用户 2026-11-08 定：不要再有「文件导入 / 文本导入」两个框。
 * 手机上不一定能存文件，把密文从剪贴板直接粘进来是正规路径：
 *
 *   [打开] [粘贴]                ← 同级操作，都在框上面
 *   [ 唯一的文本框 ]              ← 粘贴的内容；打开文件时这里显示「已读取：…」
 *   [ 识别结果 + 需要补的输入 ]    ← 账单：起始日期 + 我的账户
 *                                   密文：密码
 *                                   备份：输入「覆盖」两个字
 *   [ 导入 ]                     ← 最后一步；条件不满足会提示，不会静默失败
 *
 * 识别在 import-source（文件 / 文本 → bill / table / backup / text），
 * 这里只拼界面、分派动作。
 */

import * as NtModal from './modal.js';
import { sourceFromFile, sourceFromText } from './import-source.js';
import { planBillImport, collectNewAccounts } from '../core/bill-plan.js';
import { myAccountPick } from './import-bill.js';
import { money } from '../core/format.js';
import { backupSummary } from './import-backup.js';

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

const button = (text, cls) => {
  const b = el('button', cls || 'nt-btn nt-btn-sm', text);
  b.type = 'button';
  return b;
};

/** 字段行：标签 + 控件，右边可跟按钮 */
function field(label, control, buttons) {
  const row = el('div', 'nt-imp-field');
  const cell = el('label', 'nt-imp-cell');
  cell.appendChild(el('span', 'nt-imp-label', label));
  control.classList.add('nt-input', 'nt-input-sm');
  cell.appendChild(control);
  row.appendChild(cell);
  const list = Array.isArray(buttons) ? buttons : (buttons ? [buttons] : []);
  for (const b of list) row.appendChild(b);
  return row;
}

/**
 * @param {{
 *   getAccounts?:()=>Array, accounts?:Array,
 *   onImport?:(result:object)=>void,
 *   onImportTemplate?:(state:object, stats:object)=>void,
 *   restoreBackup?:(text:string, password:string)=>Promise<object>,
 *   onRestore?:(state:object)=>void,
 *   mergeText?:(text:string)=>number,
 *   setFooter?:(text:string)=>void,
 * }} opts
 */
export function openImportHub(opts) {
  const o = opts || {};
  const accounts = typeof o.getAccounts === 'function' ? o.getAccounts() : (o.accounts || []);
  const aliases = Array.isArray(o.aliases) ? o.aliases : [];

  let dlg = null;
  let ta = null;
  let statusEl = null;
  let need = null;
  let errEl = null;
  let fromEl = null;
  let mySel = null;
  let pwEl = null;
  let coverEl = null;
  let billRow = null;
  let myRow = null;
  let pwRow = null;
  let coverWrap = null;
  let source = null;

  const setErr = (msg) => { if (errEl) errEl.textContent = msg || ''; };

  /** 识别后要补的输入：'bill' = 起始日期 + 我的账户；'pw' = 密码；'cover' = 输入「覆盖」 */
  function setNeed(which) {
    if (billRow) billRow.hidden = which !== 'bill';
    if (myRow) myRow.hidden = which !== 'bill';
    if (pwRow) pwRow.hidden = which !== 'pw';
    if (coverWrap) coverWrap.hidden = which !== 'cover';
    if (need) need.hidden = !which;
  }

  function billStatus(r) {
    const from = fromEl ? fromEl.value || '' : '';
    const plan = planBillImport(r.items, {
      accounts,
      from,
      presetId: r.presetId,
      myAccountId: mySel ? mySel.value || '' : '',
      aliases,
    });
    const s = plan.stats;
    const lines = [r.note];
    lines.push(from ? `起始日之后 ${s.kept} 笔（早于它跳过 ${s.before} 笔）` : `可导入 ${s.kept} 笔`);
    lines.push(`消费 ${money(s.sumOut)} / 收入 ${money(s.sumIn)}`);
    if (s.transfer) lines.push(`资金流转 ${s.transfer} 笔（还款 / 提现 / 搬钱）照常记成账户间转账`);
    if (s.pending) lines.push(`资金流转 ${s.pending} 笔只认出一端：先写进流水，等你补另一端`);
    const wants = collectNewAccounts(plan).length;
    if (wants) lines.push(`新建 ${wants} 个节点：高频商户单独成节点，可在备注区改名合并`);
    return lines.join('\n');
  }

  function statusOf(s) {
    if (s.kind === 'bill') return billStatus(s.result);
    if (s.kind === 'table') return `${s.result.note}\n通用表格：直接点「导入」写入流水。`;
    if (s.kind === 'backup') return backupSummary(s.backup);
    return '这是一段账本流水文本：点「导入」合并进当前账本。';
  }

  /** 把一个源挂到界面上：状态文字 + 需要补的输入 */
  function applySource(s) {
    source = s;
    setErr('');
    if (!s) {
      if (statusEl) statusEl.textContent = '';
      setNeed('');
      return;
    }
    if (s.kind === 'bill' && mySel) {
      const pick = myAccountPick(accounts, s.result.presetId, s.result.hints && s.result.hints.cardTail);
      if (pick) mySel.value = pick.id;
    }
    if (s.kind === 'bill') setNeed('bill');
    else if (s.kind === 'backup') setNeed(s.backup.kind === 'backup' ? 'pw' : 'cover');
    else setNeed('');
    if (statusEl) statusEl.textContent = statusOf(s);
  }

  function refreshStatus() {
    if (source && statusEl) statusEl.textContent = statusOf(source);
  }

  function pickFile(accept, onPick) {
    const input = el('input');
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

  async function loadFile(file) {
    if (!file) return;
    const name = String(file.name || '');
    applySource(null);
    if (ta) {
      ta.value = '';
      ta.placeholder = `已读取：${name}\n这里也可以粘贴（账单内容 / 密文 / 流水文本）`;
    }
    if (statusEl) statusEl.textContent = `正在读取 ${name} …`;
    try {
      applySource(await sourceFromFile(file));
    } catch (e) {
      applySource(null);
      setErr('读取失败：' + ((e && e.message) || e));
    }
  }

  /** 粘贴：直接读剪贴板；读不到就让用户长按输入框自己粘（手机上的常规做法） */
  async function pasteText() {
    const clip = navigator.clipboard;
    if (!clip || typeof clip.readText !== 'function') {
      setErr('这个浏览器不能直接读剪贴板：长按上面的框，用系统的「粘贴」');
      if (ta) ta.focus();
      return;
    }
    let text = '';
    try {
      text = await clip.readText();
    } catch (e) {
      setErr('浏览器不让读剪贴板：长按上面的框，用系统的「粘贴」');
      if (ta) ta.focus();
      return;
    }
    if (!text || !text.trim()) { setErr('剪贴板里没有文字'); return; }
    if (ta) ta.value = text;
    applySource(sourceFromText(text));
  }

  function importTable(r) {
    if (!r.items || !r.items.length) { setErr('这份内容里没有可导入的记录'); return; }
    r.fromDate = fromEl ? fromEl.value || '' : '';
    r.myAccountId = mySel ? mySel.value || '' : '';
    // 资金流转（还款 / 提现 / 余额宝来回）按账户间转账导入，不再直接丢掉
    r.includeNeutral = true;
    // 别名表跟着这次导入走：命中过的说法直接归位（味丰源 → 早餐）
    r.aliases = aliases;
    if (dlg) dlg.close();
    if (typeof o.onImport === 'function') o.onImport(r);
  }

  function importText(text) {
    if (typeof o.mergeText !== 'function') { setErr('当前不能合并文本'); return; }
    let n = 0;
    try { n = o.mergeText(text); } catch (e) {
      setErr('导入失败：' + ((e && e.message) || e));
      return;
    }
    if (dlg) dlg.close();
    if (typeof o.setFooter === 'function') {
      o.setFooter(n ? `已导入 ${n} 笔流水` : '这段文本里没有新记录（可能都已经有了）');
    }
  }

  async function importBackup(b) {
    if (b.kind === 'backup') {
      const pw = (pwEl && pwEl.value || '').trim();
      if (!pw) { setErr('需要账本密码'); if (pwEl) pwEl.focus(); return; }
      if (typeof o.restoreBackup !== 'function') { setErr('当前不能恢复加密备份'); return; }
      try {
        const state = await o.restoreBackup(b.text, pw);
        if (dlg) dlg.close();
        if (typeof o.onRestore === 'function') o.onRestore(state);
      } catch (e) {
        setErr('解不开：密码不对，或文件已损坏');
      }
      return;
    }
    if (!coverEl || coverEl.value.trim() !== '覆盖') {
      setErr('要替换当前账本，请先输入「覆盖」两个字');
      if (coverEl) coverEl.focus();
      return;
    }
    if (dlg) dlg.close();
    if (typeof o.onImportTemplate === 'function') o.onImportTemplate(b.state, b.stats);
  }

  function doImport() {
    const s = source;
    if (!s) { setErr('先「打开」一个文件，或把内容粘贴到上面的框'); return; }
    if (s.kind === 'text') return importText(s.text);
    if (s.kind === 'backup') return importBackup(s.backup);
    return importTable(s.result);
  }

  dlg = NtModal.open({
    title: '导入',
    autoFocus: false,
    build: (body) => {
      const box = el('section', 'nt-imp-group');

      const bar = el('div', 'nt-imp-bar');
      const openBtn = button('打开', 'nt-btn nt-btn-sm nt-exp-main');
      openBtn.addEventListener('click', () => pickFile('.lz,.xlsx,.xls,.csv,.txt,.tsv,.json', loadFile));
      const pasteBtn = button('粘贴', 'nt-btn nt-btn-sm');
      pasteBtn.addEventListener('click', pasteText);
      bar.appendChild(openBtn);
      bar.appendChild(pasteBtn);
      box.appendChild(bar);

      ta = el('textarea', 'nt-imp-box');
      ta.spellcheck = false;
      ta.placeholder = PLACEHOLDER;
      ta.addEventListener('input', () => applySource(sourceFromText(ta.value)));
      box.appendChild(ta);

      statusEl = el('div', 'nt-imp-status');
      box.appendChild(statusEl);

      need = el('div', 'nt-imp-need');
      need.hidden = true;

      fromEl = el('input');
      fromEl.type = 'date';
      billRow = field('起始日期', fromEl);
      need.appendChild(billRow);

      mySel = el('select');
      for (const acc of accounts.filter((a) => a && !a.isHidden && a.id !== '__OPENING__')) {
        const opt = el('option', null, (acc.code ? acc.code + ' · ' : '') + (acc.name || ''));
        opt.value = acc.id;
        mySel.appendChild(opt);
      }
      myRow = field('我的账户', mySel);
      need.appendChild(myRow);

      pwEl = el('input');
      pwEl.type = 'password';
      pwEl.placeholder = '账本密码';
      pwRow = field('密码', pwEl);
      need.appendChild(pwRow);

      coverWrap = el('div', 'nt-imp-cover');
      coverWrap.appendChild(hint('要覆盖当前账本，请在下面输入「覆盖」两个字：', false));
      coverEl = el('input');
      coverEl.placeholder = '覆盖';
      coverWrap.appendChild(field('确认', coverEl));
      need.appendChild(coverWrap);

      box.appendChild(need);

      errEl = el('p', 'nt-sync-hint nt-imp-sub nt-import-map-err');
      box.appendChild(errEl);

      const foot = el('div', 'nt-imp-foot');
      const go = button('导入', 'nt-btn nt-btn-primary');
      go.addEventListener('click', doImport);
      foot.appendChild(go);
      box.appendChild(foot);

      body.appendChild(box);

      fromEl.addEventListener('change', refreshStatus);
      mySel.addEventListener('change', refreshStatus);
    },
  });

  return dlg;
}
