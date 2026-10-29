// 界面：设置 tab
/**
 * 设置视图（账户结构 + 六个功能）
 * 层：第五层 · UI
 *
 * 账户表本身在 ui/account-table.js（表格内直接编辑，不弹窗）；
 * 本文件只管上面的六个功能按钮，以及把账户汇总写到信息栏。
 *
 * 余额与期初全部来自 core 的纯函数，本文件不算钱。
 */

import { balanceOf } from '../core/balance-calculator.js';
import { money } from '../core/format.js';
import { mountAccountTable } from '../ui/account-table.js';
import * as NtModal from '../ui/modal.js';
import { applyTheme, saveTheme, currentTheme } from '../ui/theme-manager.js';
import { applySettings } from '../ui/apply-settings.js';
import { loadMergedSettings } from '../ui/debug-themes.js';
import { mountDebugPanel } from '../ui/debug-panel.js';
import { openAccountConfig } from '../ui/account-config.js';

const ACT_LABEL = { password: '修改密码', config: '配置', layout: '布局' };

/** 主题循环的顺序：与调试面板的 1/2/3/4 一致 */
const THEME_CYCLE = ['light', 'dark', 'alt1', 'alt2'];
const THEME_LABEL = { light: '浅色', dark: '深色', alt1: '备选1', alt2: '备选2' };

export function mountSettings(section, ctx) {
  const body = section.querySelector('#nt-accounts-body');

  const table = mountAccountTable(ctx, body, {
    onSummary: (text) => { ctx.setFooter(text); },
  });

  bindActions();

  function render() {
    table.render();
  }

  /* ---------- 六个功能 ---------- */

  function bindActions() {
    const bar = section.querySelector('.nt-vbar');
    if (!bar) return;
    for (const el of bar.querySelectorAll('[data-act]')) {
      el.addEventListener('click', () => onAction(el.getAttribute('data-act')));
    }
  }

  function onAction(act) {
    if (act === 'balance') { showBalance(); return; }
    if (act === 'theme') { cycleTheme(); return; }
    if (act === 'reset') { showReset(); return; }
    if (act === 'layout') { showLayout(); return; }
    if (act === 'config') { openAccountConfig(ctx); return; }
    NtModal.info(ACT_LABEL[act] || act, (b) => { b.textContent = '该功能在后续版本接入。'; });
  }

  /** 布局：调试面板直接调界面参数，并带文本导出/导入 */
  function showLayout() {
    // 已经有面板开着就不再叠一个
    if (document.querySelector('.nt-debug')) return;
    // setState 是必须的：saveThemeSettings 靠它把参数写回 state.settings[theme]，
    // 少传这一个回调，「保存」就会静默失败（面板上看不出任何错误）。
    mountDebugPanel({
      getState: ctx.getState,
      setState: ctx.setState,
      save: () => { if (ctx.saveNow) ctx.saveNow(); },
    });
  }

  function showBalance() {
    const state = ctx.getState();
    const sum = {};
    for (const acc of state.accounts || []) {
      if (!acc) continue;
      const v = balanceOf(acc, state.transactions).balance;
      sum[acc.type] = (sum[acc.type] || 0) + v;
    }
    const asset = sum['资产类'] || 0;
    const liability = sum['负债类'] || 0;
    const equity = sum['权益类'] || 0;
    const income = sum['收入类'] || 0;
    const expense = sum['费用类'] || 0;
    const diff = Math.round((asset + expense - liability - equity - income) * 100) / 100;

    NtModal.info('期初配平', (b) => {
      const kv = document.createElement('dl');
      kv.className = 'nt-kv';
      addKV(kv, '资产类', money(asset));
      addKV(kv, '负债类', money(liability));
      addKV(kv, '权益类', money(equity));
      addKV(kv, '收入类', money(income));
      addKV(kv, '费用类', money(expense));
      addKV(kv, '资产 + 费用 − 负债 − 权益 − 收入', money(diff),
        Math.abs(diff) < 0.005 ? 'ok' : 'bad');
      b.appendChild(kv);
    });
  }

  /**
   * 主题按钮：点一下换下一个，四个主题循环（用户 2026-10-29 指定）。
   * 顺序与调试面板的 1/2/3/4 一致：浅色 → 深色 → 备选1 → 备选2 → 浅色。
   */
  function cycleTheme() {
    const cur = currentTheme();
    const i = THEME_CYCLE.indexOf(cur);
    const next = THEME_CYCLE[(i + 1) % THEME_CYCLE.length];
    switchTheme(next);
    if (ctx.setFooter) ctx.setFooter('主题：' + THEME_LABEL[next]);
  }

  /**
   * 切主题 = 换一整套界面参数。
   *
   * 每个主题的 `--nt-*`（文字色、底色、边框、字体）是分开存的，
   * 只改 data-theme 不重算变量的话，表格会拿着上一个主题的颜色渲染 ——
   * 深色 → 浅色时最明显：单元格文字是白的，在白底上直接看不见。
   * 调试面板切换时就是这么做的（ui/debug-panel.js line 46），这里补齐。
   */
  function switchTheme(theme) {
    applyTheme(theme);
    saveTheme(theme);
    try {
      applySettings(loadMergedSettings(ctx, theme), theme);
    } catch (e) { /* 主题已经切过去，参数失败不应阻止切换 */ }
  }

  function showReset() {
    NtModal.open({
      title: '重置',
      body: '重置账本会清空全部数据（账户 + 流水），且不可恢复。',
      actions: [
        { label: '取消', kind: 'ghost', close: true },
        { label: '重置账本（清空）', kind: 'danger', close: false, onClick: () => { doReset(); } },
      ],
    });
  }

  async function doReset() {
    try {
      if (ctx.resetAll) await ctx.resetAll();
    } catch (e) {
      NtModal.info('重置失败', (b) => { b.textContent = e.message; });
    }
  }

  return { render };
}

function addKV(dl, k, v, cls) {
  const dt = document.createElement('dt');
  dt.textContent = k;
  const dd = document.createElement('dd');
  dd.textContent = v;
  if (cls) dd.className = cls;
  dl.appendChild(dt);
  dl.appendChild(dd);
}
