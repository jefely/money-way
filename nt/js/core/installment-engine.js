// 界面：（无界面）分期引擎
/**
 * 分期引擎（纯计算，不存盘）
 * 层：第一层 · 数据基座
 *
 * 「已还几期」永远算出来，不写进数据 —— 改日期、改期数都不会污染历史。
 * 分期 = 计划流水的一个变种，所以结构上只认 inst 字段。
 */

/** 月份加减：'2026-08' + 3 → '2026-11' */
export function addMonths(month, n) {
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const total = y * 12 + (mo - 1) + Number(n || 0);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** 两个月份相差几个月（b - a） */
export function monthsBetween(a, b) {
  const ma = String(a || '').match(/^(\d{4})-(\d{2})$/);
  const mb = String(b || '').match(/^(\d{4})-(\d{2})$/);
  if (!ma || !mb) return NaN;
  return (Number(mb[1]) * 12 + Number(mb[2])) - (Number(ma[1]) * 12 + Number(ma[2]));
}

/** 某月有几天 */
export function daysInMonth(month) {
  const m = String(month || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return 30;
  return new Date(Number(m[1]), Number(m[2]), 0).getDate();
}

/** 把「几号」钳到该月实际天数（31 号在 2 月就是 28/29） */
export function dayInMonth(month, day) {
  const max = daysInMonth(month);
  const d = Math.max(1, Math.floor(Number(day) || 1));
  return Math.min(d, max);
}

/**
 * 单条分期的宏观状态。
 *
 * 两种数据形状都认：
 *   · inst.cells = { '2026-08': { p, i } } —— 每期手填（单文件版的形状）
 *   · inst = { periods, firstMonth, principal, interest } —— 引擎按均摊推算
 * 有 cells 就以 cells 为准（期数 = 填了几格、首月 = 最早那格），否则走均摊。
 *
 * @param {{inst:object}} scheduled
 * @param {string} targetMonth 'YYYY-MM'（给了就带出当月那期的 perPeriod）
 */
export function computeInstallment(scheduled, targetMonth) {
  const inst = (scheduled && scheduled.inst) || {};
  const cells = inst.cells && typeof inst.cells === 'object' ? inst.cells : null;
  const months = cells ? Object.keys(cells).sort() : [];

  if (months.length) {
    let sumP = 0;
    let sumI = 0;
    for (const m of months) {
      sumP += Number(cells[m].p) || 0;
      sumI += Number(cells[m].i) || 0;
    }
    const c = targetMonth ? cells[targetMonth] : null;
    const paid = targetMonth ? months.filter((m) => m < targetMonth).length : 0;

    return {
      periods: months.length,
      firstMonth: months[0],
      lastMonth: months[months.length - 1],
      principal: round2(sumP),
      interest: round2(sumI),
      total: round2(sumP + sumI),
      perPeriod: c ? round2((Number(c.p) || 0) + (Number(c.i) || 0)) : 0,
      principalPer: c ? round2(Number(c.p) || 0) : 0,
      interestPer: c ? round2(Number(c.i) || 0) : 0,
      paidPeriods: paid,
      remainingPeriods: months.length - paid,
      remainingPrincipal: 0,
      remainingInterest: 0,
      finished: paid >= months.length,
      hasCells: true,
    };
  }

  const periods = Math.max(0, Math.floor(Number(inst.periods) || 0));
  const firstMonth = String(inst.firstMonth || '');
  const principal = Number(inst.principal) || 0;
  const interest = Number(inst.interest) || 0;
  const total = principal + interest;

  const perPeriod = periods > 0 ? total / periods : 0;
  const principalPer = periods > 0 ? principal / periods : 0;
  const interestPer = periods > 0 ? interest / periods : 0;

  const elapsed = monthsBetween(firstMonth, targetMonth);
  const paid = Number.isFinite(elapsed) ? Math.min(periods, Math.max(0, elapsed)) : 0;

  return {
    periods,
    firstMonth,
    lastMonth: periods > 0 ? addMonths(firstMonth, periods - 1) : '',
    principal,
    interest,
    total,
    perPeriod: round2(perPeriod),
    principalPer: round2(principalPer),
    interestPer: round2(interestPer),
    paidPeriods: paid,
    remainingPeriods: Math.max(0, periods - paid),
    remainingPrincipal: round2(principalPer * Math.max(0, periods - paid)),
    remainingInterest: round2(interestPer * Math.max(0, periods - paid)),
    finished: periods > 0 && paid >= periods,
    hasCells: false,
  };
}

/**
 * 是否在 targetMonth 还款。
 * 有 cells 时只看那一格填没填 —— 手填矩阵里空着的月份就是没有这笔。
 * @returns {boolean}
 */
export function isDueInMonth(scheduled, targetMonth) {
  const inst = (scheduled && scheduled.inst) || {};
  if (inst.cells && typeof inst.cells === 'object' && Object.keys(inst.cells).length) {
    return !!inst.cells[targetMonth];
  }
  const st = computeInstallment(scheduled, targetMonth);
  if (!scheduled || !scheduled.inst || st.periods <= 0) return false;
  const elapsed = monthsBetween(st.firstMonth, targetMonth);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < st.periods;
}

/**
 * 分期矩阵：给「子视图 B」的月份列表用。
 *
 * @param {Array} list 计划流水（只挑带 inst 的）
 * @param {string} fromMonth
 * @param {string} toMonth
 * @returns {{months:string[], rows:Array, totalPrincipal:number, totalInterest:number}}
 */
export function calcInstallmentMatrix(list, fromMonth, toMonth) {
  const instList = (list || []).filter((s) => s && s.inst);
  const span = monthsBetween(fromMonth, toMonth);

  const months = [];
  if (Number.isFinite(span) && span >= 0) {
    for (let i = 0; i <= span; i++) months.push(addMonths(fromMonth, i));
  }

  const rows = instList.map((s) => {
    const cells = months.map((m) => {
      if (!isDueInMonth(s, m)) return null;
      const st = computeInstallment(s, m);
      return {
        month: m,
        amount: st.perPeriod,
        principal: st.principalPer,
        interest: st.interestPer,
      };
    });
    const st = computeInstallment(s, toMonth);
    return {
      id: s.id,
      from_id: s.from_id,
      to_id: s.to_id,
      note: s.note,
      periods: st.periods,
      firstMonth: st.firstMonth,
      lastMonth: st.lastMonth,
      perPeriod: st.perPeriod,
      cells,
    };
  });

  let totalPrincipal = 0;
  let totalInterest = 0;
  for (const s of instList) {
    const st = computeInstallment(s, toMonth);
    totalPrincipal += st.remainingPrincipal;
    totalInterest += st.remainingInterest;
  }

  return {
    months,
    rows,
    totalPrincipal: round2(totalPrincipal),
    totalInterest: round2(totalInterest),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
