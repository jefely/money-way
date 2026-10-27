// 界面：流水工具条「同步」→ 同步账本弹窗
/**
 * 同步弹窗（同步码 = 账本文本）
 * 层：第五层 · UI
 *
 * 生成：把当前账本导出成文本同步码，复制到另一台设备；
 * 合并：粘贴同步码后追加到当前账本（账户按名称判重、流水自动补账户）。
 */

import * as NtModal from './modal.js';
import { ledgerToText, appendLedgerFromText } from '../core/flow-text.js';

/**
 * @param {{getState:Function, setState:Function, save?:Function, setFooter?:Function}} ctx
 */
export function openSyncDialog(ctx) {
  const code = ledgerToText(ctx.getState());

  NtModal.open({
    title: '同步账本',
    build: (body) => {
      const hint = document.createElement('p');
      hint.className = 'nt-sync-hint';
      hint.textContent = '把下面这段同步码复制到另一台设备，粘贴后点「合并」，两边的账户和流水会合并到一起。';
      body.appendChild(hint);

      const out = document.createElement('textarea');
      out.className = 'nt-sync-code';
      out.readOnly = true;
      out.value = code;
      body.appendChild(out);

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'nt-btn nt-btn-sm';
      copy.textContent = '复制同步码';
      copy.addEventListener('click', () => {
        const done = () => { copy.textContent = '已复制'; };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(out.value).then(done, () => {
            out.select();
            document.execCommand('copy');
            done();
          });
        } else {
          out.select();
          document.execCommand('copy');
          done();
        }
      });
      body.appendChild(copy);

      const inTa = document.createElement('textarea');
      inTa.className = 'nt-sync-code';
      inTa.placeholder = '粘贴另一台设备的同步码…';
      body.appendChild(inTa);

      const merge = document.createElement('button');
      merge.type = 'button';
      merge.className = 'nt-btn nt-btn-sm';
      merge.textContent = '合并';
      merge.addEventListener('click', () => {
        const text = inTa.value.trim();
        if (!text) return;
        const r = appendLedgerFromText(ctx.getState(), text);
        ctx.setState(r.state);
        if (ctx.save) ctx.save();
        NtModal.closeAll();
        if (ctx.setFooter) {
          const extra = r.created.length ? `，新建 ${r.created.length} 个账户` : '';
          ctx.setFooter(`已合并 ${r.txAdded} 笔${extra}`);
        }
      });
      body.appendChild(merge);
    },
    actions: [{ label: '关闭', kind: 'ghost', close: true }],
  });
}
