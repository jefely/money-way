// 界面：重置整本账（节点模板弹窗里的危险动作）
/**
 * 只换 state，不动密码/保险库。
 * 放在独立文件里，是因为 app.js 已经贴着 300 行有效代码的上限。
 */

import { resetAccountsKeepData, resetBookState } from '../core/reset-book.js';
import { applySettings } from './apply-settings.js';
import { loadMergedSettings } from './debug-themes.js';

/** @param {{setState:Function, saveNow:Function, getState:Function, render:Function, footer?:Function}} ctx */
export function makeResetAccounts(ctx) {
  return async () => {
    ctx.setState(resetAccountsKeepData(ctx.getState()));
    await ctx.saveNow();
    ctx.render();
    if (ctx.footer) ctx.footer('已重置账户。流水还在；对不上名字的请到校验页查看。');
  };
}

/** @param {{setState:Function, saveNow:Function, getState:Function, render:Function, footer?:Function}} ctx */
export function makeResetBook(ctx) {
  return async () => {
    ctx.setState(resetBookState());
    await ctx.saveNow();
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    applySettings(loadMergedSettings({ getState: ctx.getState }, theme), theme);
    ctx.render();
    if (ctx.footer) ctx.footer('已重置账本：流水、节点、期初、列宽都回到默认。');
  };
}
