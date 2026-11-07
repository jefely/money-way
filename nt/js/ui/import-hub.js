// 界面：流水工具条「导入」→ 先弹入口（选文件 / 粘贴文本）
/**
 * 导入入口（UI 层）
 *
 * 用户 2026-11-01：导入要和导出一样，先有一个对话框，
 * 里面既能选文件，也能把账本文本直接粘进去导入。
 *
 * 这里只负责「从哪来」；文件解析与预览在 import-dialog.js，
 * 文本合并走调用方给的 mergeText（core/sync-merge）。
 */

import * as NtModal from './modal.js';
import { openImportDialog } from './import-dialog.js';
import { isBackupText } from '../core/backup-file.js';

const PLACEHOLDER = [
  '账户：',
  '类型，分类，简码，名称，期初，账单日，还款日，',
  '',
  '流水：',
  '日期，转出，转入，金额，备注，',
  '260801，XJ，ZHC，3.5，午饭',
].join('\n');

/**
 * @param {{
 *   mergeText?:(text:string)=>number,
 *   setFooter?:(text:string)=>void,
 *   onImport?:(result:object)=>void,
 *   onImportTemplate?:(state:object, stats:object)=>void,
 * }} opts
 */
export function openImportHub(opts) {
  const o = opts || {};
  let dlg = null;
  let ta = null;

  dlg = NtModal.open({
    title: '导入',
    // 不抢焦点：下面那个大文本框一聚焦，手机就弹键盘把上面的按钮顶掉
    autoFocus: false,
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '选一个文件（Excel / CSV / 账单 / .lz 快照 / 加密备份），'
        + '或者把账本文本直接粘到下面，按「导入文本内容」合并进当前账本。';
      body.appendChild(tip);

      const bar = document.createElement('div');
      bar.className = 'nt-exp-bar';
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'nt-btn nt-btn-sm nt-exp-main';
      pick.textContent = '选择文件';
      pick.addEventListener('click', () => {
        if (dlg) dlg.close();
        // 选文件走原来那条路：读表 → 认表头 → 预览
        openImportDialog({
          onImport: o.onImport,
          onImportTemplate: o.onImportTemplate,
          onBackup: (text) => askPassword(text, o),
          // 账单自动建节点时要用账户表（判断「零钱」「招行储」是否已存在）
          accounts: typeof o.getAccounts === 'function' ? o.getAccounts() : o.accounts,
        });
      });
      bar.appendChild(pick);

      // 从剪贴板读一段文本直接填进框里（手机上没有 Ctrl+V 的场合用这个）
      const paste = document.createElement('button');
      paste.type = 'button';
      paste.className = 'nt-btn nt-btn-sm';
      paste.textContent = '粘贴';
      paste.addEventListener('click', async () => {
        try {
          ta.value = await navigator.clipboard.readText();
          ta.focus();
        } catch (e) {
          ta.focus();
        }
      });
      bar.appendChild(paste);
      body.appendChild(bar);

      ta = document.createElement('textarea');
      ta.className = 'nt-exp-out';
      ta.spellcheck = false;
      ta.placeholder = PLACEHOLDER;
      body.appendChild(ta);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '导入文本内容',
        kind: 'primary',
        close: false,
        onClick: ({ close }) => {
          const text = String(ta && ta.value || '').trim();
          if (!text) return;
          if (isBackupText(text)) {
            if (typeof o.restoreBackup !== 'function') {
              if (typeof o.setFooter === 'function') o.setFooter('这是加密备份，当前不能恢复');
              return;
            }
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
          close();
          if (typeof o.setFooter === 'function') {
            o.setFooter(n ? `已导入 ${n} 笔流水` : '这段文本里没有新记录（可能都已经有了）');
          }
        },
      },
    ],
  });

  return dlg;
}

function askPassword(text, o) {
  if (typeof o.restoreBackup !== 'function') {
    if (typeof o.setFooter === 'function') o.setFooter('这是加密备份，当前不能恢复');
    return;
  }
  let pw = null;
  let err = null;
  NtModal.open({
    title: '恢复加密备份',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '用导出时的账本密码解开。解开后会替换当前这笔账。';
      body.appendChild(tip);
      pw = document.createElement('input');
      pw.type = 'password';
      pw.className = 'nt-input';
      pw.setAttribute('aria-label', '账本密码');
      body.appendChild(pw);
      err = document.createElement('p');
      err.className = 'nt-sync-hint';
      body.appendChild(err);
    },
    actions: [
      { label: '取消', kind: 'ghost', close: true },
      {
        label: '恢复',
        kind: 'primary',
        close: false,
        onClick: async ({ close }) => {
          try {
            const state = await o.restoreBackup(text, pw ? pw.value : '');
            close();
            if (typeof o.onRestore === 'function') o.onRestore(state);
          } catch (e) {
            if (err) err.textContent = '解不开：密码不对，或文件已损坏';
          }
        },
      },
    ],
  });
}
