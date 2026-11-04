// 界面：分期表上方的「新增」表单
/**
 * 新增分期表单
 *
 * 用户 2026-11-01：分期表改成两行一条、期数由「填了几格」推出之后，
 * 表格里再放一行「新增行」就放不下那几个字段了（账户/金额/期数/首月/账单日/还款日/利息）,
 * 所以挪到表格上方，做成一条横排表单。
 *
 * 填完按「金额 ÷ 期数」均摊铺满月份格 —— 之后用户可以在表格里逐格改任意一个月。
 */

import { createScheduled, clampDay } from '../core/schema.js';
import { addMonths } from '../core/installment-engine.js';
import { parseAccountInput } from '../core/account-resolver.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** 这批输入框的字段名与长度（顺序就是横排顺序） */
const FIELDS = [
  ['name', '节点名称', '分期银行'],
  ['principal', '分期金额', '分期金额'],
  ['interest', '总利息', '总利息'],
  ['periods', '期数', '期数'],
  ['firstMonth', '首月', '首月'],
];

/** '2611' / '2026-11' / '2026/11' → '2026-11'；认不出返回空串 */
export function parseMonthText(raw) {
  const v = String(raw || '').replace(/[^0-9-]/g, '').replace(/\//g, '-');
  if (!v) return '';
  if (/^\d{4}-\d{1,2}$/.test(v)) {
    const [y, m] = v.split('-');
    return y + '-' + String(Number(m)).padStart(2, '0');
  }
  const d = v.replace(/-/g, '');
  if (d.length === 4) return '20' + d.slice(0, 2) + '-' + d.slice(2);
  if (d.length === 6) return d.slice(0, 4) + '-' + d.slice(4);
  return '';
}

/**
 * @param {{getState:Function, setState:Function, saveNow:Function, getIndex:Function, setFooter:Function}} ctx
 * @param {()=>void} onAdded 建好一条之后的回调（通常是重新渲染）
 * @returns {{render:(host:HTMLElement)=>void}}
 */
export function mountAddForm(ctx, onAdded) {
  function todayMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function add(bar) {
    const get = (k) => {
      const el = bar.querySelector('[data-add="' + k + '"]');
      return el ? String(el.value || '').trim() : '';
    };
    const num = (k) => Math.abs(Number(String(get(k)).replace(/[¥,\s]/g, '')) || 0);

    const name = get('name');
    if (!name) return ctx.setFooter('分期还没建成：先填分期银行');
    const r = parseAccountInput(ctx.getIndex(), name);
    if (!r || !r.acc) return ctx.setFooter(`分期还没建成：节点「${name}」不在账本里`);

    const principal = num('principal');
    const interest = num('interest');
    if (!principal && !interest) return ctx.setFooter('分期还没建成：分期金额要大于 0');

    const periods = Math.max(1, Math.floor(Number(get('periods')) || 0));
    const first = parseMonthText(get('firstMonth')) || todayMonth();

    // 均摊铺满：之后在表格里逐格改
    const cells = {};
    const pPer = round2(principal / periods);
    const iPer = round2(interest / periods);
    for (let k = 0; k < periods; k += 1) {
      const m = addMonths(first, k);
      if (m) cells[m] = { p: pPer, i: iPer };
    }

    const row = createScheduled({
      to_id: r.acc.id,
      from_id: null,
      day: clampDay(r.acc.repayDay || 5),
      billDay: r.acc.billDay,
      note: '分期',
      amount: round2(principal + interest),
      inst: { periods, firstMonth: first, principal, interest, cells },
    });

    const st = ctx.getState();
    ctx.setState({ ...st, scheduled: (st.scheduled || []).concat([row]) });
    ctx.saveNow();
    if (onAdded) onAdded();
    ctx.setFooter('已新增 1 条分期');
    return undefined;
  }

  let barEl = null;

  /** 只放输入框。添加按钮在「分期」切换旁边。 */
  function render(host) {
    if (!host) return;
    barEl = host;
    for (const [key, ph, label] of FIELDS) {
      const inp = document.createElement('input');
      inp.className = 'nt-input nt-input-sm';
      inp.type = 'text';
      inp.setAttribute('data-add', key);
      inp.placeholder = ph;
      inp.setAttribute('aria-label', label);
      host.appendChild(inp);
    }
  }

  function submit() {
    if (barEl) add(barEl);
  }

  return { render, submit };
}
