// 界面：导入动作（表格 / 文本 / 加密备份）
// 从 import-hub 拆出，保持单文件有效代码在公约 300 行内。
export function importTable(ctx, r) {
  if (!r.items || !r.items.length) { ctx.setErr('这份内容里没有可导入的记录'); return; }
  r.fromDate = ctx.fromEl ? ctx.fromEl.value || '' : '';
  r.myAccountId = ctx.mySel ? ctx.mySel.value || '' : '';
  r.includeNeutral = true;
  r.aliases = ctx.aliases;
  ctx.close();
  if (typeof ctx.onImport === 'function') ctx.onImport(r);
}

export function importText(ctx, text) {
  if (typeof ctx.mergeText !== 'function') { ctx.setErr('当前不能合并文本'); return; }
  let n = 0;
  try { n = ctx.mergeText(text); } catch (e) {
    ctx.setErr('导入失败：' + ((e && e.message) || e));
    return;
  }
  ctx.close();
  if (typeof ctx.setFooter === 'function') {
    ctx.setFooter(n ? `已导入 ${n} 笔流水` : '这段文本里没有新记录（可能都已经有了）');
  }
}

export async function importBackup(ctx, b) {
  if (b.kind === 'backup') {
    const pw = ctx.pw;
    if (!pw) { ctx.setErr('需要账本密码'); return; }
    if (typeof ctx.restoreBackup !== 'function') { ctx.setErr('当前不能恢复加密备份'); return; }
    try {
      const state = await ctx.restoreBackup(b.text, pw);
      ctx.close();
      if (typeof ctx.onRestore === 'function') ctx.onRestore(state);
    } catch (e) {
      ctx.setErr('解不开：密码不对，或文件已损坏');
    }
    return;
  }
  if (ctx.cover !== '覆盖') {
    ctx.setErr('要替换当前账本，请先输入「覆盖」两个字');
    return;
  }
  ctx.close();
  if (typeof ctx.onImportTemplate === 'function') ctx.onImportTemplate(b.state, b.stats);
}
