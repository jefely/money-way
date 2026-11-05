// 界面：设置页 —— 新增账户行 / 期初
/**
 * 设置页里「不在表格主体」的两块逻辑
 * 层：第五层 · UI
 *
 * 从 account-table.js 拆出来：那个文件已经贴着公约 300 行有效代码的红线，
 * 而「末尾空行什么时候变成一条账户」和「期初怎么落成一条流水」都不是画表逻辑。
 */

import { addAccount, addTransaction, accountTypesOf } from '../core/state-store.js';
import { accountsOfZone, nextSeqFor, zoneKeyOf } from '../core/account-order.js';
import { normalizeCode, isValidCode } from '../core/schema.js';
import { openingEnds } from '../core/opening-tx.js';
import { toAmount } from '../core/stats.js';
import { syncOpeningDates } from '../core/ledger-stats.js';
import { bindTypePicker, promptType } from './type-picker.js';

/** 新增行里参与「填了就建」的格子（顺序不影响逻辑） */
const NEW_FIELDS = ['type', 'category', 'code', 'name', 'opening', 'seq'];

/** 期初：改那条 opening 流水（没有就建一条） */
export function setOpening(ctx, id, amount) {
  const st = ctx.getState();
  const acc = (st.accounts || []).find((a) => a && a.id === id);
  if (!acc) return;
  const txs = (st.transactions || []).filter((t) => !(t.opening && (t.to_id === id || t.from_id === id)));
  let s = { ...st, transactions: txs };

  if (amount > 0) {
    const ends = openingEnds(acc);
    s = addTransaction(s, {
      date: '2000-01-01',
      from_id: ends.from_id,
      to_id: ends.to_id,
      amount,
      note: '期初',
      opening: true,
      seq: 0,
    });
  }
  // 期初日期统一对齐到「最早流水前一天 23:59:59」（用户 2026-10-30）
  ctx.setState(syncOpeningDates(s));
}

/**
 * 绑定末尾的新增行。
 *
 * @param {object} ctx 与 account-table 同一套：getState / setState / saveNow / setFooter
 * @param {HTMLElement} tr 模板克隆出来的空行
 * @param {{key:string}} zone 所属分区
 * @param {() => void} onCreated 建好之后重画表格（account-table.render）
 */
export function bindNewRow(ctx, tr, zone, onCreated) {
  let created = false;

  const tryCreate = () => {
    if (created || !tr.isConnected) return;

    const get = (f) => {
      const el = tr.querySelector('[data-field="' + f + '"]');
      return el ? String(el.value || '').trim() : '';
    };

    const name = get('name');
    if (!name) {
      // 新行只填了简码：名字才是「建账户」的那一格；说清楚，别让输入框
      // 看着像已经改了、切页后又消失（2026-11 用户报「简码修改不了」）。
      if (get('code')) ctx.setFooter('新增节点：先填名称，简码才会一起保存');
      return;
    }

    const st = ctx.getState();
    if ((st.accounts || []).some((a) => a.name === name)) {
      // 重名不允许：账本里账户靠名字互相对上
      return;
    }

    // 类型：空则按资产类；新类型会进类型库
    const type = get('type') || '资产类';
    const code = normalizeCode(get('code'));
    if (code && !isValidCode(code)) return;
    // 简码重复允许（2026-11 用户决定）：新账户也照建，表格里标暗红。

    // 序号可以跳着填（如 63 → 100）；不填就「本区最大序号 + 1」。
    // zone 为空 = 表格最下面那批公共空行：按类型决定归哪个区。
    const zoneKey = (zone && zone.key) || zoneKeyOf({ type });
    const zoneAccounts = accountsOfZone(st.accounts, zoneKey);
    const typed = parseInt(get('seq'), 10);
    const seq = Number.isFinite(typed) && typed > 0 ? typed : nextSeqFor(zoneAccounts);

    created = true;
    let s = addAccount(st, {
      name,
      type,
      category: get('category') || '未分类',
      code: code || undefined,
      seq,
    });
    ctx.setState(s);

    const opening = toAmount(get('opening'));
    if (opening > 0) {
      const added = s.accounts[s.accounts.length - 1];
      const ends = openingEnds(added);
      s = addTransaction(s, {
        date: '2000-01-01',
        from_id: ends.from_id,
        to_id: ends.to_id,
        amount: opening,
        note: '期初',
        opening: true,
        seq: 0,
      });
      ctx.setState(s);
    }

    ctx.saveNow();
    onCreated();
    ctx.setFooter('已新增节点');
  };

  for (const f of NEW_FIELDS) {
    const inp = tr.querySelector('[data-field="' + f + '"]');
    if (!inp) continue;
    // 延迟到本轮结束：一行里连填几格时，后面的不能落在已脱离 DOM 的旧行上
    inp.addEventListener('change', () => { setTimeout(tryCreate, 0); });
  }

  const typeInput = tr.querySelector('[data-field="type"]');
  if (typeInput) {
    bindTypePicker(typeInput, () => accountTypesOf(ctx.getState()), (v) => {
      if (v === '__custom__') {
        promptType((t) => { typeInput.value = t; setTimeout(tryCreate, 0); });
        return;
      }
      typeInput.value = v;
      setTimeout(tryCreate, 0);
    });
  }
}
