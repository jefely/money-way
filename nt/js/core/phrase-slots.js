// 数据：一句话 → 六大元素（转出 / 转入 / 节点类型 / 节点分类 / 备注分类 / 备注关键字）
/**
 * phrase-slots —— 槽位提取层（纯函数）
 * 层：第一层 · 数据基座
 *
 * 借鉴成熟 NL 解析的四段式：
 *   ① 候选（调用方已用词典/账户/简码匹配出 hits）
 *   ② 方向打分：方向词 + 角色 + 位置
 *   ③ 消歧与补全：类型/分类、备注结构化
 *   ④ 置信度与证据：每个槽位单独给 high/partial/low，并说明依据
 *
 * 它**不**猜金额、不改备注原文、不建账户；只把「已经能对上的词」摆到六个槽里。
 * 对不上就留空，由调用方（phrase-entry）决定是追问还是留草稿。
 */

import { ACCOUNT_TYPE, isDebitType } from './schema.js';

/** 方向词：出现在节点**前面**时，表示它是转出/转入。 */
const FROM_WORDS = ['用', '从', '由', '刷', '拿', '走', '通过'];
const TO_WORDS = ['到', '给', '存', '记到', '买', '吃', '喝', '交', '还', '付', '花', '充', '转给', '转入'];

const TYPE_BY_ROLE = {
  payment: ACCOUNT_TYPE.ASSET,
  asset: ACCOUNT_TYPE.ASSET,
  liability: ACCOUNT_TYPE.LIABILITY,
  income: ACCOUNT_TYPE.INCOME,
  expense: ACCOUNT_TYPE.EXPENSE,
};

/** 类型 → 角色（与 phrase-parser 共用同一张表） */
export function roleOfType(type) {
  if (type === ACCOUNT_TYPE.INCOME) return 'income';
  if (type === ACCOUNT_TYPE.LIABILITY) return 'liability';
  if (type === ACCOUNT_TYPE.EXPENSE) return 'expense';
  if (type === ACCOUNT_TYPE.ASSET) return 'asset';
  if (type === ACCOUNT_TYPE.EQUITY) return 'equity';
  return 'account';
}

/** 类型 → A/B 极。A = 资金落地/消耗（资产/费用/成本），B = 来源（负债/权益/收入）。 */
export function polarityOfType(type) {
  const t = String(type == null ? '' : type).trim();
  // 空类型与 createAccount 的默认值保持一致：资产类 = A 极
  if (!t) return 'A';
  return isDebitType(t) ? 'A' : 'B';
}

/** 名称兜底：只在账户/词库都没给类型时用，且不算 high。 */
function inferType(name, role) {
  if (TYPE_BY_ROLE[role]) return TYPE_BY_ROLE[role];
  const n = String(name || '');
  if (/花呗|白条|信用卡|借呗|微粒贷|贷款/.test(n)) return ACCOUNT_TYPE.LIABILITY;
  if (/工资|薪|奖金|年终|收入|报销|退款/.test(n)) return ACCOUNT_TYPE.INCOME;
  if (/银行|储蓄|卡|现金|余额|零钱|微信|支付宝/.test(n)) return ACCOUNT_TYPE.ASSET;
  return '';
}

/** 分类兜底：词库/账户都没给时才用。 */
function inferCategory(name, type) {
  const n = String(name || '');
  if (/微信|支付宝|零钱/.test(n)) return '网络账户';
  if (/信用卡/.test(n)) return '信用卡';
  if (/花呗|白条/.test(n)) return '信用';
  if (/银行|储蓄|卡/.test(n)) return '储蓄';
  if (type === ACCOUNT_TYPE.EXPENSE) return '';
  return '';
}

function scoreOf(hit, text, index, total) {
  let from = 0;
  let to = 0;
  const why = [];
  const before = text.slice(Math.max(0, hit.start - 8), hit.start);
  for (const w of FROM_WORDS) {
    if (before.endsWith(w)) { from += 3; why.push(`前有「${w}」`); break; }
  }
  for (const w of TO_WORDS) {
    if (before.endsWith(w)) { to += 3; why.push(`前有「${w}」`); break; }
  }
  // 「信用卡还款」：方向词在节点后面
  if (/^(还款|还账|账单)/.test(text.slice(hit.end, hit.end + 3))) {
    to += 2;
    why.push('后接还款');
  }
  const role = hit.role || roleOfType(hit.type);
  // 角色是**强先验**（+2）：支付渠道/资产/负债 → 转出，费用 → 转入。
  // A/B 极只作**弱兜底**（+1）：角色为空或自定义时，B 倾向转出、A 倾向转入。
  // 方向词（+3）和语序（+1）仍压过两者 —— A→A / A→B / B→A / B→B 四种都合法，
  // 光看极性定不了方向，它只负责「没有别的线索时把默认值摆对」。
  const p = hit.polarity || polarityOfType(hit.type);
  if (role === 'income') from += 2;
  else if (role === 'expense' || role === 'cost') to += 2;
  else if (role === 'payment' || role === 'asset' || role === 'liability') from += 2;
  else if (p === 'B') from += 1;
  else if (p === 'A') to += 1;
  if (index === 0 && total > 1) from += 1;
  return { from, to, why, role, polarity: p };
}

function nodeOf(hit, type, category, confidence, evidence) {
  return {
    id: hit.id || null,
    name: hit.accountName || hit.keyword || hit.name || '',
    keyword: hit.keyword || '',
    type: type || '',
    category: category || '',
    role: hit.role || roleOfType(type),
    polarity: polarityOfType(type),
    confidence,
    evidence,
  };
}

/** 找备注词（lexicon 里 role/kind=note 的行），最长优先。 */
function noteWord(noteText, lexicon) {
  const rows = (lexicon || [])
    .filter((r) => r && (r.role === 'note' || r.kind === 'note') && r.keyword)
    .sort((a, b) => b.keyword.length - a.keyword.length);
  for (const r of rows) {
    if (noteText.includes(r.keyword)) return r;
  }
  return null;
}

/** 备注表命中：用户自己的 {type, keyword, text}，最长关键词优先。 */
function noteRow(noteText, notes) {
  const rows = (notes || [])
    .filter((n) => n && (n.keyword || n.text))
    .map((n) => ({ ...n, _key: String(n.keyword || n.text || '') }))
    .filter((n) => n._key)
    .sort((a, b) => b._key.length - a._key.length);
  for (const n of rows) {
    if (noteText.includes(n._key)) return n;
  }
  return null;
}

/**
 * @param {{
 *   text:string, hits:Array, note:string, amount:number|null,
 *   accounts?:Array, notes?:Array, lexicon?:Array
 * }} input
 * @returns {{from:object|null,to:object|null,note:object,nodeType:string,
 *            nodeCategory:string,confidence:string,evidence:Array}}
 */
export function extractSlots(input) {
  const text = String((input && input.text) || '');
  const hits = (input && input.hits) || [];
  const noteText = String((input && input.note) || '');
  const amount = input && input.amount;
  const lexicon = (input && input.lexicon) || [];
  const notes = (input && input.notes) || [];
  const evidence = [];
  const reverse = !!(input && input.reverse);

  const scored = hits.map((hit, i) => {
    const s = scoreOf(hit, text, i, hits.length);
    return { hit, ...s };
  });

  let from = null;
  let to = null;
  const income = scored.find((s) => s.role === 'income');
  const rest = scored.filter((s) => s !== income);

  if (income && rest.length) {
    from = income;
    to = rest[0];
    evidence.push({ slot: 'from', rule: 'income-source', keyword: income.hit.keyword });
  } else if (scored.length) {
    scored.sort((a, b) => Math.max(b.from, b.to) - Math.max(a.from, a.to) || b.from - a.from);
    const first = scored[0];
    const second = scored[1];
    if (first.to > first.from) {
      to = first;
      from = second && second.from > 0 ? second : null;
    } else {
      from = first;
      to = second && second.to > 0 ? second : null;
      // 两个同为资产/负债的节点（转账）：位置靠后的那个是转入方。
      // 单看方向分时它的 to 分是 0，但「A → B」的语义由语序给出。
      if (!to && second) to = second;
    }
  }

  // 退款：语义要求「费用/成本 → 资产/收入」。语序已经对了就不动；
  // 只有方向与退款矛盾时才反转（`退款 wx-yf` / 单端收款）。
  if (reverse) {
    const cost = (e) => !!e && (e.role === 'expense' || e.role === 'cost'
      || e.hit.type === ACCOUNT_TYPE.EXPENSE || e.hit.type === ACCOUNT_TYPE.COST);
    if (from && to) {
      if (!cost(from) && cost(to)) {
        const t = from;
        from = to;
        to = t;
      }
    } else if (from && !cost(from)) {
      to = from;
      from = null;
    } else if (to && cost(to)) {
      from = to;
      to = null;
    }
    evidence.push({ slot: 'flow', rule: 'refund', keyword: '退款' });
  }

  // 物品词（咖啡/瑞幸）：不成为节点，映射到它所属的费用分类节点。
  // 和旧逻辑一致：**没有金额时不补转入**，否则一句听不懂的话会被当成
  // 「有转入、缺金额」的草稿，而不是整句进备注。
  const word = noteWord(noteText, lexicon);
  if (!to && word && amount != null) {
    to = {
      hit: { keyword: word.keyword, accountName: word.nodeName || word.category, role: 'expense' },
      from: 0,
      to: 0,
      why: [],
      role: 'expense',
      fromWord: true,
    };
    evidence.push({ slot: 'to', rule: 'note-word', keyword: word.keyword });
  }

  const build = (entry, side) => {
    if (!entry) return null;
    const h = entry.hit;
    const declaredType = h.type || '';
    const declaredCategory = h.category || '';
    let type = declaredType;
    let category = declaredCategory;
    let conf = h.id ? 'high' : 'partial';
    const ev = entry.why.slice();

    if (!type) {
      type = inferType(h.accountName || h.keyword, entry.role);
      if (type) { ev.push('类型按名称推断'); conf = 'partial'; }
    }
    if (!category) {
      category = inferCategory(h.accountName || h.keyword, type);
      if (!category && side === 'to' && entry.fromWord && word) {
        category = word.category || '';
        if (category) ev.push('分类取自备注词');
      }
      if (category) conf = conf === 'high' && !h.id ? 'partial' : conf;
    }
    if (entry.why.length) evidence.push({ slot: side, rule: 'directions', keyword: h.keyword });
    return nodeOf(h, type, category, conf, ev);
  };

  // 备注结构化：用户备注表 > 词库物品词 > 原文
  const nr = noteRow(noteText, notes);
  let noteType = nr ? String(nr.type || '') : '';
  let noteCategory = nr ? String(nr.category || '') : '';
  let noteKeyword = nr ? String(nr.keyword || nr.text || '') : '';
  let noteConf = nr ? 'high' : 'low';
  if (nr) evidence.push({ slot: 'note', rule: 'note-table', keyword: noteKeyword });
  if (!nr && word) {
    noteKeyword = word.keyword;
    noteCategory = word.category || '';
    noteConf = 'partial';
    evidence.push({ slot: 'note', rule: 'lexicon-note', keyword: word.keyword });
  }

  const fromNode = build(from, 'from');
  const toNode = build(to, 'to');
  // 主节点：费用/成本侧优先 —— 退款时「衣服」比收款的「微信」更能代表这笔流水。
  const costLike = (n) => !!n && (n.type === ACCOUNT_TYPE.EXPENSE || n.type === ACCOUNT_TYPE.COST);
  const main = costLike(toNode) ? toNode : costLike(fromNode) ? fromNode : (toNode || fromNode);
  const endN = (fromNode ? 1 : 0) + (toNode ? 1 : 0);
  let confidence = 'low';
  if (amount != null && endN === 2) confidence = 'high';
  else if (amount != null || endN > 0) confidence = 'partial';

  return {
    from: fromNode,
    to: toNode,
    note: { text: noteText, type: noteType, category: noteCategory, keyword: noteKeyword, confidence: noteConf },
    nodeType: main ? main.type : '',
    nodeCategory: main ? main.category : '',
    confidence,
    evidence,
  };
}
