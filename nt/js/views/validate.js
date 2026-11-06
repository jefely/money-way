// 界面：校验 tab
/**
 * 校验视图（账本说明 / 账本校验 / 赞助感谢）
 * 层：第五层 · UI
 *
 * 校验规则来自 core/validator.js（V1~V7），恒等式与余额来自 core 纯函数。
 * 本文件只把数字摆成卡片，不重新定义规则。
 */

import { balanceOf } from '../core/balance-calculator.js';
import { isPosted } from '../core/schema.js';
import { validate, issuesOf, errorCount } from '../core/validator.js';
import { checkAccountingIdentity } from '../core/validate.js';
import { moneyAlways } from '../core/format.js';
import { shareBlock } from '../ui/share-block.js';
import { mountThanksWall } from '../ui/thanks-wall.js';

const TYPES = ['资产类', '成本类', '负债类', '收入类', '权益类', '费用类'];

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
    ctx.setFooter(`${(state.transactions || []).length} 笔流水 · ${visibleCount(state)} 个节点 · 校验完成`);
  }

  function renderCheck() {
    const state = ctx.getState();
    const txs = state.transactions || [];

    /* ① 发生额平衡 */
    let total = 0;
    let single = 0;
    let zero = 0;
    let drafts = 0;
    for (const t of txs) {
      if (!isPosted(t)) { drafts += 1; continue; }
      const amt = Number(t.amount) || 0;
      if (!amt) { zero += 1; continue; }
      if (!t.from_id || !t.to_id) single += 1;
      total += amt;
    }
    const balanced = single === 0 && zero === 0;
    host.appendChild(card('① 发生额平衡', '每笔流水（转出）与（转入）金额相等，两边合计必须一致。', balanced, [
      ['流水笔数', String(txs.length)],
      ['左方（转出）合计', moneyAlways(total)],
      ['右方（转入）合计', moneyAlways(total)],
      // 差额 0 = 两边平衡，用绿色标出来（用户 2026-11）
    ['差额', moneyAlways(0), 'ok'],
      ['草稿（未入账）', String(drafts)],
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
    // 恒等式只有一处定义（core/validate.js），这里只负责摆出来
    const idt = checkAccountingIdentity(TYPES.map((t) => ({ cat: t, balance: sum[t] || 0 })));
    const diff = idt.diff;

    const identityRows = TYPES.map((t) => [`${t}（${count[t] || 0} 个）`, moneyAlways(sum[t] || 0)]);
    identityRows.push([
      '资产 + 成本 + 费用 − 负债 − 权益 − 收入',
      moneyAlways(diff),
      Math.abs(diff) < 0.005 ? 'ok' : 'bad',
      // 这条标签比上面几行长一倍，14px 在窄弹窗里会折成两行 —— 单独缩一号
      'nt-kv-label-long',
    ]);
    host.appendChild(card(
      '② 会计恒等式',
      '资产 + 成本 + 费用 = 负债 + 权益 + 收入。\n期初余额成对录入时这里应为 0。',
      Math.abs(diff) < 0.005,
      identityRows,
    ));

    /* ③ 数据完整性 */
    const res = validate({ transactions: txs, accounts: state.accounts || [] });
    const byCode = {};
    for (const it of res.issues || []) byCode[it.code] = (byCode[it.code] || 0) + 1;
    // warn 不算失败：简码重复是允许的提示，不应把整张卡判成红。
    const errs = errorCount(res);
    const ok = errs === 0;

    const card3 = card(
      '③ 数据完整性',
      ok
        ? (res.issues || []).length ? '数据完整；简码重复已允许，见下方提示。' : '账户表里的名字和流水里的名字全部对得上。'
        : `发现 ${errs} 个错误，见下方计数。`,
      ok,
      [
        // 去掉「（V1）」这类规则编号（用户 2026-11：要简洁）。
        // 编号只在代码里用于定位问题，界面上中文标签已经说清楚了。
        ['单边流水', String(byCode.V1 || 0)],
        ['金额非法', String(byCode.V2 || 0)],
        ['断链', String(byCode.V3 || 0)],
        ['自己转自己', String(byCode.V4 || 0)],
        ['日期非法', String(byCode.V5 || 0)],
        ['简码提示', String(byCode.V7 || 0)],
      ],
    );

    // 简码问题只有计数等于「没找到问题」—— 把具体是哪个账户、为什么列出来
    // （重复简码只报后一个账户，前一行的简码同样会在设置页标红，两处一起看）。
    const v7 = issuesOf(res, 'V7');
    if (v7.length) {
      const ul = document.createElement('ul');
      ul.className = 'nt-issue-list';
      for (const it of v7.slice(0, 6)) {
        const li = document.createElement('li');
        li.textContent = it.message;
        ul.appendChild(li);
      }
      card3.appendChild(ul);
    }

    host.appendChild(card3);
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
      ' 每一笔钱都是：从一个节点转出，进入另一个节点。',
      ' 节点分成资产、负债、收入、费用、成本、权益6大类型。余额是这个节点上的净流量。',
      ' 不用记「借 / 贷」，只回答「这笔钱从哪来，到哪去」。',
    ]));

    // ③ 简单开始
    host.appendChild(stepsBlock('简单开始', [
      '在表头对话框中输入水3发送，买水花3元。',
      '设置页查看节点与简码，简码可修改。',
      '简码填进「转出节点」和「转入节点」列。',
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
      ' 过去包含：期初余额，在节点设置页填写。',
      ' 现在包含：当前账本活跃流水记录，提供实时维护。',
      ' 未来包含：固定收支表预测写入记录，提供提前确认。',
      ' 分期记录：是固定收支的一部分，用于设置分期。',
    ]));
  }

  function renderThanks() {
    // 感谢墙整块在 ui/thanks-wall.js（名字方块 + PNG 图片 + 本地存储）
    host.appendChild(mountThanksWall({ notify: (text) => ctx.setFooter(text) }));
  }

  return {
    render,
    /**
     * 把「账本校验」的内容渲染一份到给定容器 —— 节点设置页的「校验」按钮
     * 用它开弹窗（用户 2026-11：校验不再占一个 tab，改成按钮 + 弹窗）。
     *
     * 做法是「渲染到本页 → clone 一份 → 再恢复原视图」：
     * renderCheck 全程只往闭包里的 host 写，抽成参数要动一整个函数；
     * 校验内容是纯只读展示，clone 不会丢掉任何行为。
     */
    renderCheckInto(target) {
      if (!target) return;
      const keep = cap;
      cap = 'check';
      render();
      const copy = host.cloneNode(true);
      copy.removeAttribute('id');   // 别在页面里造出第二个同 id 的节点
      target.appendChild(copy);
      cap = keep;
      render();
    },
  };
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
    // row[3] 是 dt 的附加类名（目前只有「资产 + 成本 + …」那条长标签用它缩字号）
    if (row[3]) dt.className = row[3];
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


