// 界面：切页时的后台收尾
/**
 * 页面切换的生命周期
 * 层：第五层 · UI
 *
 * 用户 2026-11-09：重排/结算放在**切出去**时做，切回来只显示结果，不重建。
 *   · 流水 → 设置/别的 tab：beforeLeave（结算开放行 + 隐藏时重排）+ 设置页 render
 *   · 设置 → 流水：sortLater（账户表后台重排）+ 流水 render（version 检查）
 *   · 任何 tab 离开流水：leaveFlow 两个都做
 */

export function flowLeft(views) {
  if (views.flow && views.flow.beforeLeave) views.flow.beforeLeave();
  if (views.settings && views.settings.render) views.settings.render();
}

export function settingsLeft(views) {
  if (views.settings && views.settings.sortLater) views.settings.sortLater();
  if (views.flow && views.flow.render) views.flow.render();
}

export function leaveFlow(views, active) {
  if (active !== 'flow') return;
  if (views.flow && views.flow.beforeLeave) views.flow.beforeLeave();
  if (views.settings && views.settings.sortLater) views.settings.sortLater();
}
