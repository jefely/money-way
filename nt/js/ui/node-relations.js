// 界面：节点关系（上下级配置表）
/**
 * 节点关系配置
 * 层：第五层 · UI
 *
 * 用户 2026-11-08：上下级关系**由用户在节点配置表里确立**，没确立时保持开放，
 * 不替用户猜「餐饮属于生活」。这里只做一件事：让每个节点能选一个上级。
 *
 * 防环：挂上去之前先过 wouldCycle，否则树变成环，统计会无限递归。
 */

import * as NtModal from './modal.js';
import { updateAccount } from '../core/state-store.js';
import { childrenOf, wouldCycle } from '../core/node-relations.js';

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

/**
 * @param {{getState:Function, setState:Function, saveNow:Function, setFooter?:Function}} ctx
 * @param {Function} rerender 重绘账户表
 */
export function openNodeRelations(ctx, rerender) {
  NtModal.open({
    title: '节点关系',
    body: '',
    build: (body) => {
      body.textContent = '';
      body.appendChild(el('p', 'nt-sync-hint nt-imp-sub',
        '给节点选一个上级。不选就是根节点 —— 没确立关系时它保持开放，不替你做主。'));

      const list = el('div', 'nt-rel-list');
      const accounts = (ctx.getState().accounts || []).filter((a) => a && !a.isHidden);
      const sorted = [...accounts].sort((a, b) => {
        const ta = String(a.type || ''); const tb = String(b.type || '');
        if (ta !== tb) return ta < tb ? -1 : 1;
        const na = String(a.name || ''); const nb = String(b.name || '');
        return na < nb ? -1 : na > nb ? 1 : 0;
      });

      for (const acc of sorted) {
        const row = el('div', 'nt-rel-row');
        row.appendChild(el('span', 'nt-rel-name', acc.name || '（未命名）'));

        const kids = childrenOf(accounts, acc.id).length;
        row.appendChild(el('span', 'nt-rel-kids', kids ? `${kids} 个下级` : ''));

        const sel = el('select', 'nt-input nt-input-sm nt-rel-sel');
        const none = el('option', null, '（无上级）');
        none.value = '';
        sel.appendChild(none);
        for (const p of sorted) {
          if (p.id === acc.id) continue;
          const o = el('option', null, p.name || '（未命名）');
          o.value = p.id;
          if (String(acc.parentId || '') === p.id) o.selected = true;
          sel.appendChild(o);
        }
        sel.addEventListener('change', () => {
          const pid = sel.value || '';
          if (pid && wouldCycle(ctx.getState().accounts || [], acc.id, pid)) {
            if (ctx.setFooter) ctx.setFooter('这样会绕成一个环，没有保存');
            sel.value = String(acc.parentId || '');
            return;
          }
          ctx.setState(updateAccount(ctx.getState(), acc.id, { parentId: pid }));
          ctx.saveNow();
          rerender();
          if (ctx.setFooter) ctx.setFooter(pid ? `「${acc.name}」挂到上级了` : `「${acc.name}」成了根节点`);
        });
        row.appendChild(sel);
        list.appendChild(row);
      }
      body.appendChild(list);
    },
    actions: [{ label: '完成', kind: 'primary', close: true }],
  });
}
