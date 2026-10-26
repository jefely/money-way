/**
 * 导入弹窗（UI 层）
 *
 * 只负责：放一个文本域、把解析结果**如实**显示（多少行能进、多少行有错、要新建哪些账户），
 * 然后把「解析结果」交给调用方去落库。本文件不写数据。
 */

import * as NtModal from './modal.js';
import { parseImportText } from '../core/import-parser.js';

export const PLACEHOLDER = [
  '日期\t转出\t转入\t金额\t备注',
  '260820\t招行储\t餐饮\t128.50\t午饭',
  '260821\t现金\t餐饮\t36.00\t早饭',
].join('\n');

/**
 * 打开导入弹窗。
 * @param {{knownAccounts:string[], onImport:(parsed:object)=>Promise<{ok:boolean,message?:string}>}} opts
 */
export function openImportDialog(opts) {
  const o = opts || {};
  const known = new Set((o.knownAccounts || []).map((n) => String(n).trim()));

  let textarea = null;
  let preview = null;
  let lastParsed = null;

  const dlg = NtModal.open({
    title: '导入流水',
    build: (body) => {
      const label = document.createElement('label');
      label.textContent = '粘贴表格数据（从 Excel 直接复制即可，Tab 分隔）';
      body.appendChild(label);

      textarea = document.createElement('textarea');
      textarea.className = 'nt-input nt-import-text';
      textarea.placeholder = PLACEHOLDER;
      textarea.spellcheck = false;
      body.appendChild(textarea);

      const bar = document.createElement('div');
      bar.className = 'nt-import-bar';

      const btnParse = document.createElement('button');
      btnParse.type = 'button';
      btnParse.className = 'nt-btn';
      btnParse.textContent = '解析预览';
      btnParse.addEventListener('click', () => {
        lastParsed = parseImportText(textarea.value);
        renderPreview(preview, lastParsed, known, textarea.value);
      });

      const btnSample = document.createElement('button');
      btnSample.type = 'button';
      btnSample.className = 'nt-btn nt-btn-ghost';
      btnSample.textContent = '填入示例';
      btnSample.addEventListener('click', () => {
        textarea.value = PLACEHOLDER;
        textarea.focus();
      });

      bar.appendChild(btnParse);
      bar.appendChild(btnSample);
      body.appendChild(bar);

      preview = document.createElement('div');
      preview.className = 'nt-import-preview';
      body.appendChild(preview);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '确认导入',
        kind: 'primary',
        close: false,
        onClick: async ({ close }) => {
          if (!lastParsed) lastParsed = parseImportText(textarea.value);
          if (!lastParsed.rows.length) {
            renderPreview(preview, lastParsed, known, textarea.value);
            return;
          }
          const res = await o.onImport(lastParsed);
          if (res && res.ok) {
            close();
            return;
          }
          if (preview) {
            const err = document.createElement('p');
            err.className = 'nt-import-err';
            err.textContent = (res && res.message) || '导入失败';
            preview.appendChild(err);
          }
        },
      },
    ],
  });

  return dlg;
}

/** 把解析结果如实渲染出来（含要新建的账户） */
function renderPreview(host, parsed, known, rawText) {
  if (!host) return;
  host.textContent = '';

  if (!rawText.trim()) {
    host.textContent = '先粘贴数据';
    return;
  }

  const newAccounts = parsed.accounts
    .filter((a) => !known.has(a.display))
    .map((a) => a.display);

  const line = (txt, cls) => {
    const p = document.createElement('p');
    p.className = 'nt-import-line' + (cls ? ' ' + cls : '');
    p.textContent = txt;
    host.appendChild(p);
  };

  line(`可导入 ${parsed.stats.ok} 笔`, parsed.stats.ok ? 'ok' : '');
  if (parsed.stats.bad) line(`有 ${parsed.stats.bad} 行有问题（下面列出，不会导入）`, 'bad');

  if (parsed.errors.length) {
    const ul = document.createElement('ul');
    ul.className = 'nt-import-errors';
    for (const e of parsed.errors.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = `第 ${e.line} 行：${e.message}`;
      ul.appendChild(li);
    }
    if (parsed.errors.length > 8) {
      const li = document.createElement('li');
      li.textContent = `…还有 ${parsed.errors.length - 8} 行`;
      ul.appendChild(li);
    }
    host.appendChild(ul);
  }

  if (newAccounts.length) {
    line(`将新建 ${newAccounts.length} 个账户：${newAccounts.slice(0, 8).join('、')}`
      + (newAccounts.length > 8 ? ' …' : ''), 'warn');
    line('新账户默认「资产类 / 未分类」，导入后可在账户里改', 'dim');
  } else if (parsed.stats.ok) {
    line('账户都在，直接建流水', 'dim');
  }

  if (parsed.rows.length) {
    const head = parsed.rows.slice(0, 3).map((r) => `  ${r.date} ${r.from || '—'} → ${r.to || '—'} ¥${r.amount}`);
    line('前几行：', 'dim');
    const pre = document.createElement('pre');
    pre.className = 'nt-import-sample';
    pre.textContent = head.join('\n');
    host.appendChild(pre);
  }
}
