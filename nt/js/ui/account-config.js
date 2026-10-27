// 界面：账户配置导入导出
/**
 * 账户配置（UI 层）
 *
 * 设置页「配置」打开：左边导出文本、右边粘贴导入。
 * 语义写在界面上：**不会删除账户**，只更新与新增。
 */

import * as NtModal from './modal.js';
import { accountsToText, applyAccountsText } from '../core/account-config.js';
import { downloadText, pickTextFile } from './file-io.js';

/**
 * @param {{getState:Function, setState:Function, saveNow:Function,
 *          setFooter?:Function}} ctx
 */
export function openAccountConfig(ctx) {
  const text = accountsToText(ctx.getState());

  NtModal.open({
    title: '账户配置',
    build: (body) => {
      const tip = document.createElement('p');
      tip.className = 'nt-sync-hint';
      tip.textContent = '这里只有账户（类型 / 分类 / 简码 / 名称 / 期初 / 账单日 / 还款日），不含流水。'
        + '导入按名称匹配：已有的更新，缺的新增，不会删除账户。';
      body.appendChild(tip);

      // —— 导出 ——
      const outLabel = document.createElement('div');
      outLabel.className = 'nt-sync-title';
      outLabel.textContent = '① 导出';
      body.appendChild(outLabel);

      const out = document.createElement('textarea');
      out.className = 'nt-sync-code';
      out.readOnly = true;
      out.value = text;
      body.appendChild(out);

      const outBar = document.createElement('div');
      outBar.className = 'nt-sync-bar';

      const copy = smallBtn('复制', async () => {
        const ok = await copyText(out.value);
        copy.textContent = ok ? '已复制' : '请手动复制';
        if (!ok) out.select();
      });
      const saveFile = smallBtn('存文件', () => {
        downloadText('NT账户配置.txt', out.value);
      });
      outBar.appendChild(copy);
      outBar.appendChild(saveFile);
      body.appendChild(outBar);

      // —— 导入 ——
      const inLabel = document.createElement('div');
      inLabel.className = 'nt-sync-title';
      inLabel.textContent = '② 导入';
      body.appendChild(inLabel);

      const ta = document.createElement('textarea');
      ta.className = 'nt-sync-code';
      ta.placeholder = '粘贴账户配置文本，或点下面的「读文件」';
      body.appendChild(ta);

      const err = document.createElement('p');
      err.className = 'nt-import-err';
      body.appendChild(err);

      const inBar = document.createElement('div');
      inBar.className = 'nt-sync-bar';

      const readFile = smallBtn('读文件', async () => {
        try {
          const f = await pickTextFile('.txt,text/plain,.csv');
          ta.value = f.text;
          err.textContent = '';
        } catch (e) {
          err.textContent = '读文件失败：' + e.message;
        }
      });

      const apply = smallBtn('套用', () => {
        const raw = ta.value.trim();
        if (!raw) { err.textContent = '先粘一段账户配置'; return; }

        const r = applyAccountsText(ctx.getState(), raw);
        if (!r.added && !r.updated && !r.openingSet) {
          err.textContent = r.errors.length
            ? '没认出任何账户，第 1 行问题：' + r.errors[0].message
            : '没有需要变更的账户';
          return;
        }

        ctx.setState(r.state);
        if (ctx.saveNow) ctx.saveNow();
        NtModal.closeAll();
        // setState 只换数据，不保证重画当前视图 —— 账户表得主动刷一次
        if (ctx.rerender) ctx.rerender();

        const parts = [];
        if (r.added) parts.push('新增 ' + r.added);
        if (r.updated) parts.push('更新 ' + r.updated);
        if (r.openingSet) parts.push('设期初 ' + r.openingSet);
        if (ctx.setFooter) ctx.setFooter('账户配置已套用：' + parts.join('，'));
      });

      inBar.appendChild(readFile);
      inBar.appendChild(apply);
      body.appendChild(inBar);
    },
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
  });
}

function smallBtn(text, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'nt-btn nt-btn-sm';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* 掉到下面 */ }
  return false;
}
