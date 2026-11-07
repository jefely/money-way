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
  ['firstMonth', '日期', '首月'],
];

/**
 * '2611' / '2026-11' / '261103' / '20261103' … → 'YYYY-MM'；认不出返回空串。
 *
 * 6 位有两种可能，单文件版（personal/index.html）已经定过口径：
 *   · 前四位像公历年（1900–2099）且后两位是 1–12 → YYYYMM（202611 = 2026-11）
 *   · 否则 → YYMMDD（261103 = 2026-11-03，取月份 = 2026-11）
 * 之前这里一律按 YYYYMM 解，261103 就变成了「2611 年 3 月」——
 * 用户 2026-11 报的正是这个。
 */
export function parseMonthText(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return '';

  const ok = (y, m) => {
    const year = Number(y);
    const month = Number(m);
    if (!Number.isFinite(year) || year < 1900 || year > 2099) return '';
    if (!Number.isFinite(month) || month < 1 || month > 12) return '';
    return year + '-' + String(month).padStart(2, '0');
  };

  // ① 带分隔符：2026-11 / 2026-11-03 / 2026/11/3 / 2026.11 / 2026年11月3日 / 26-11-03
  // 匹配到但年份/月份不合法时**不立刻判死**：2611-03 会被上面的 4 位年份
  // 规则抓成「2611 年」，继续往下按 6 位 YYMMDD 解才是 2026-11-03。
  const m4 = s.match(/^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?$/);
  const v4 = m4 ? ok(m4[1], m4[2]) : '';
  if (v4) return v4;
  const m2 = s.match(/^(\d{2})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?$/);
  const v2 = m2 ? ok('20' + m2[1], m2[2]) : '';
  if (v2) return v2;

  // ② 纯数字（中英文标点已在上一步处理，这里只剩数字）
  const d = s.replace(/\D/g, '');
  if (!d) return '';

  if (d.length === 4) {
    // 26 11 → 2026-11；2026（后两位不是月份）→ 2026-01
    const a = Number(d.slice(0, 2));
    const b = Number(d.slice(2, 4));
    if (b >= 1 && b <= 12) return ok(2000 + a, b);
    const year = Number(d);
    if (year >= 1900 && year <= 2099) return ok(year, 1);
    return '';
  }

  if (d.length === 6) {
    const yy = Number(d.slice(0, 4));
    const mm = Number(d.slice(4, 6));
    if (yy >= 1900 && yy <= 2099 && mm >= 1 && mm <= 12) return ok(yy, mm);

    const y2 = Number(d.slice(0, 2));
    const m2d = Number(d.slice(2, 4));
    const dd = Number(d.slice(4, 6));
    if (m2d < 1 || m2d > 12) return '';
    if (dd < 1 || dd > 31) return '';
    return ok(2000 + y2, m2d);
  }

  if (d.length === 8) return ok(d.slice(0, 4), d.slice(4, 6));
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
    // 把新建的这条交给界面：它要滚到首月那一列，让用户立刻看见
    // 「这条分期铺到了哪几个月」，而不是对着一行空月份格发懵。
    if (onAdded) onAdded({ id: row.id, firstMonth: first });
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
      inp.setAttribute('aria-label', label);
      // 首月以前是 type=month：Chrome 会把空格子画成「----年--月」，
      // 那串字用的是**正文色**（深色主题下是白的），和旁边那些灰色提示词不是一个调子，
      // 而且改不了文案（原生控件的掩码不吃 placeholder）。
      // 用户 2026-11-07 要求提示词就写「日期」、颜色和其他框一致 → 改回 text，
      // 解析照样吃 2026-11 / 2611 / 261103（见上面的 parseMonthParts）。
      inp.placeholder = ph;
      // 节点名称这一格：**离开时把简码换成真实账户名**（2026-11 用户要的）。
      // 只换显示、不动解析逻辑 —— 提交时 parseAccountInput 两种写法都认。
      if (key === 'name') {
        inp.addEventListener('change', () => {
          const raw = String(inp.value || '').trim();
          if (!raw) return;
          const r = parseAccountInput(ctx.getIndex(), raw);
          if (r && r.acc && r.display) {
            inp.value = r.display;
            inp.dataset.accId = r.acc.id;
          }
        });
      }
      host.appendChild(inp);
    }
  }

  function submit() {
    if (barEl) add(barEl);
  }

  /**
   * 用给定的值直接建一条分期（用户 2026-11：分期表的空行要能「直接填」）。
   * 做法是先把值写进上方表单的对应字段，再走同一个 add() —— 创建逻辑只有一份。
   */
  function submitWith(vals) {
    const bar = document.getElementById('nt-inst-add');
    if (!bar) return;
    for (const [k, v] of Object.entries(vals || {})) {
      const el = bar.querySelector('[data-add="' + k + '"]');
      if (el) el.value = v;
    }
    add(bar);
  }

  return { render, submit, submitWith };
}
