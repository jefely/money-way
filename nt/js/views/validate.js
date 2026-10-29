// 界面：校验 tab
/**
 * 校验视图（账本说明 / 账本校验 / 赞助感谢）
 * 层：第五层 · UI
 *
 * 校验规则来自 core/validator.js（V1~V7），恒等式与余额来自 core 纯函数。
 * 本文件只把数字摆成卡片，不重新定义规则。
 */

import { balanceOf } from '../core/balance-calculator.js';
import { validate } from '../core/validator.js';
import { money } from '../core/format.js';
import { shareBlock } from '../ui/share-block.js';
import { mountThanksWall } from '../ui/thanks-wall.js';

const TYPES = ['资产类', '负债类', '收入类', '权益类', '费用类'];

export function mountValidate(section, ctx) {
  const caps = section.querySelector('#nt-validate-caps');
  const host = section.querySelector('#nt-validate-body');

  let cap = 'about';

  caps.addEventListener('click', (ev) => {
    const b = ev.target.closest('.nt-cap');
    if (!b) return;
    cap = b.getAttribute('data-cap');
    for (const x of caps.querySelectorAll('.nt-cap')) {
      x.setAttribute('aria-selected', x === b ? 'true' : 'false');
    }
    render();
  });

  function render() {
    host.textContent = '';
    if (cap === 'check') renderCheck();
    else if (cap === 'thanks') renderThanks();
    else renderAbout();

    const state = ctx.getState();
    ctx.setFooter(`${(state.transactions || []).length} 笔流水 · ${visibleCount(state)} 个账户 · 校验完成`);
  }

  function renderCheck() {
    const state = ctx.getState();
    const txs = state.transactions || [];

    /* ① 发生额平衡 */
    let total = 0;
    let single = 0;
    let zero = 0;
    for (const t of txs) {
      const amt = Number(t.amount) || 0;
      if (!amt) { zero += 1; continue; }
      if (!t.from_id || !t.to_id) single += 1;
      total += amt;
    }
    const balanced = single === 0 && zero === 0;
    host.appendChild(card('① 发生额平衡', '每笔流水（转出）与（转入）金额相等，两边合计必须一致。', balanced, [
      ['流水笔数', String(txs.length)],
      ['左方（转出）合计', money(total)],
      ['右方（转入）合计', money(total)],
      ['差额', money(0)],
    ]));

    /* ② 会计恒等式（必须含隐藏的期初权益账户） */
    const sum = {};
    const count = {};
    for (const acc of state.accounts || []) {
      if (!acc) continue;
      const v = balanceOf(acc, txs).balance;
      sum[acc.type] = (sum[acc.type] || 0) + v;
      count[acc.type] = (count[acc.type] || 0) + 1;
    }
    const asset = sum['资产类'] || 0;
    const liability = sum['负债类'] || 0;
    const equity = sum['权益类'] || 0;
    const income = sum['收入类'] || 0;
    const expense = sum['费用类'] || 0;
    const diff = Math.round((asset + expense - liability - equity - income) * 100) / 100;

    const identityRows = TYPES.map((t) => [`${t}（${count[t] || 0} 个）`, money(sum[t] || 0)]);
    identityRows.push([
      '资产 + 费用 − 负债 − 权益 − 收入',
      money(diff),
      Math.abs(diff) < 0.005 ? 'ok' : 'bad',
    ]);
    host.appendChild(card(
      '② 会计恒等式',
      '资产 + 费用 = 负债 + 权益 + 收入。期初余额成对录入时这里应为 0。',
      Math.abs(diff) < 0.005,
      identityRows,
    ));

    /* ③ 数据完整性 */
    const res = validate({ transactions: txs, accounts: state.accounts || [] });
    const byCode = {};
    for (const it of res.issues || []) byCode[it.code] = (byCode[it.code] || 0) + 1;
    const ok = (res.issues || []).length === 0;

    host.appendChild(card(
      '③ 数据完整性',
      ok ? '账户表里的名字和流水里的名字全部对得上。' : `发现 ${res.issues.length} 个问题，见下方计数。`,
      ok,
      [
        ['单边流水（V1）', String(byCode.V1 || 0)],
        ['金额非法（V2）', String(byCode.V2 || 0)],
        ['断链（V3）', String(byCode.V3 || 0)],
        ['自己转自己（V4）', String(byCode.V4 || 0)],
        ['日期非法（V5）', String(byCode.V5 || 0)],
        ['简码问题（V7）', String(byCode.V7 || 0)],
      ],
    ));
  }

  function renderAbout() {
    // ① 二维码分享（左边二维码、右边说明 + 版本行）
    host.appendChild(shareBlock());

    // ② 简介正文
    host.appendChild(textBlock('NT账本 · 简介', [
      ' 洞穿复式记账法诞生 500 多年以来最底层的数学本质：',
      ' A角色:「转入增加，转出减少」，',
      ' B角色:「转出增加，转入减少」。',
    ]));

    // 「紫老头专属账本」自成一段，单独一个框（标题同样是紫色）
    host.appendChild(textBlock('紫老头的专属账本', [
      ' 用「NT = 直觉 + 思考」的习惯记账。',
      ' 每一笔钱，都从一个账户转出、进入另一个账户。',
      ' 不用记「借 / 贷」，只回答「这笔钱从哪来，到哪去」。',
    ]));

    // ③ 简单开始
    host.appendChild(stepsBlock('简单开始', [
      '设置页查看账户与简码，简码可修改。',
      '简码填进「转出账户」和「转入账户」列。',
      '填入发生金额，一笔记录就完成了。',
      '当前日期自动生成，日期可修改。',
    ]));

    // ④ 两条校验
    host.appendChild(textBlock('两条校验都为 0 才健康', [
      ' 数据完整性：转出总额 − 转入总额 = 0，',
      ' 会计恒等式：总资产 − 总负债 − 总权益 = 0，',
      ' 总权益=本期收入 − 费用。',
    ]));

    // ⑤ 三个时间区域
    host.appendChild(textBlock('记账的目的是不用记账', [
      ' 流水记录分为 [过去] [现在] [未来] 三个区域，',
      ' 过去包含：期初余额，在账户设置页填写。',
      ' 现在包含：当前账本活跃流水记录，提供实时维护。',
      ' 未来包含：固定收支表预测写入记录，提供提前确认。',
      ' 分期记录：是固定收支的一部分，用于设置分期。',
    ]));
  }

  function renderThanks() {
    // 感谢墙整块在 ui/thanks-wall.js（名字方块 + PNG 图片 + 本地存储）
    host.appendChild(mountThanksWall({ notify: (text) => ctx.setFooter(text) }));
  }

  return { render };
}

/* ---------- 卡片与小工具 ---------- */

function card(title, desc, pass, rows) {
  const el = document.createElement('section');
  el.className = 'nt-card';

  const head = document.createElement('div');
  head.className = 'nt-card-head';
  const h = document.createElement('h2');
  h.className = 'nt-card-title';
  h.textContent = title;
  const badge = document.createElement('span');
  badge.className = 'nt-card-pass' + (pass ? '' : ' bad');
  badge.textContent = pass ? '通过' : '未通过';
  head.appendChild(h);
  head.appendChild(badge);

  const d = document.createElement('p');
  d.className = 'nt-card-desc';
  d.textContent = desc;

  const dl = document.createElement('dl');
  dl.className = 'nt-kv';
  for (const row of rows || []) {
    const dt = document.createElement('dt');
    dt.textContent = row[0];
    const dd = document.createElement('dd');
    dd.textContent = row[1];
    if (row[2]) dd.className = row[2];
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  el.appendChild(head);
  el.appendChild(d);
  el.appendChild(dl);
  return el;
}

function textBlock(title, lines) {
  const el = document.createElement('section');
  el.className = 'nt-text-block';
  el.appendChild(titleEl(title));

  // 空串 = 段落分隔：不画空行，而是给下一个元素更大的上间距
  let pendingGap = false;
  for (const line of lines) {
    if (!line) { pendingGap = true; continue; }

    const p = document.createElement('p');
    p.className = 'nt-block-line';
    p.textContent = line;
    if (pendingGap) p.classList.add('nt-block-gap');
    pendingGap = false;
    el.appendChild(p);
  }
  return el;
}

function stepsBlock(title, steps) {
  const el = document.createElement('section');
  el.className = 'nt-text-block';
  el.appendChild(titleEl(title));
  const ol = document.createElement('ol');
  ol.className = 'nt-block-steps';
  for (const s of steps) {
    const li = document.createElement('li');
    li.textContent = s;
    ol.appendChild(li);
  }
  el.appendChild(ol);
  return el;
}

function titleEl(title) {
  const h = document.createElement('h3');
  h.className = 'nt-block-title';
  h.textContent = title;
  return h;
}

function visibleCount(state) {
  return (state.accounts || []).filter((a) => a && !a.isHidden).length;
}


