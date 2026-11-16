// 界面：导入里的 TxtVein 文本 / 双文件密文部分
//
// 从 import-hub 拆出来的原因：公约限制单文件 300 行有效代码。
// 所有 DOM 引用都通过 ctx 传入，不直接持有模块级状态。
import { sourceFromText } from './import-source.js';
import { fromTxtVein, packBundle } from '../core/txtvein-bridge.js';

export async function pasteTo(ctx, target, mode) {
  const clip = navigator.clipboard;
  if (!clip || typeof clip.readText !== 'function') {
    ctx.setErr('这个浏览器不能直接读剪贴板：长按框，用系统的「粘贴」');
    if (target) target.focus();
    return;
  }
  let text = '';
  try {
    text = await clip.readText();
  } catch (e) {
    ctx.setErr('浏览器不让读剪贴板：长按框，用系统的「粘贴」');
    if (target) target.focus();
    return;
  }
  if (!text || !text.trim()) { ctx.setErr('剪贴板里没有文字'); return; }
  if (!target) return;
  target.value = text;
  if (mode === 'single') {
    if (ctx.cDict) ctx.cDict.value = '';
    ctx.setFileGo(true);
    ctx.applySource(sourceFromText(text), false);
    refreshCipher(ctx);
  } else if (mode === 'ledger') {
    ctx.setFileGo(true);
    ctx.applySource(null, false);
    refreshCipher(ctx);
  } else {
    refreshCipher(ctx);
  }
}

export function refreshCipher(ctx) {
  const st = ctx.cipherStatus;
  if (!st) return;
  const l = ctx.ta && ctx.ta.value.trim();
  const d = ctx.cDict && ctx.cDict.value.trim();
  if (!l && !d) {
    ctx.setCipherStatus('密文是两份：上面流水、下面字典。单文本只填上面。', false);
    return;
  }
  if (l && d) {
    ctx.setCipherStatus('流水、字典两份都齐了；输入密码后导入。', false);
    ctx.setNeed('pw');
    return;
  }
  ctx.setCipherStatus(l ? '还缺字典密文。' : '还缺流水密文。', true);
}

export async function loadCipherFiles(ctx, files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  let led = '';
  let dic = '';
  for (const f of list) {
    const text = await f.text();
    const isDict = /dict|vault|字典/i.test(f.name) || /KIND:\s*dict/i.test(text);
    if (isDict) dic = text;
    else led = text;
  }
  if (!led || !dic) {
    ctx.setErr('双文件密文需要同时选择流水和字典两个文件');
    return;
  }
  ctx.fileCipher = { ledger: led, dict: dic };
  ctx.source = null;
  ctx.applySource(null, true);
  ctx.setStatus('已读取：流水密文 + 字典密文。输入密码后点「导入」。');
  ctx.setNeed('pw');
  ctx.setFileGo(false);
  if (ctx.ta) ctx.ta.value = '';
  if (ctx.cDict) ctx.cDict.value = '';
  refreshCipher(ctx);
}

function importTxtVein(ctx, text) {
  if (ctx.cover !== '覆盖') {
    ctx.setErr('要替换当前账本，请先输入「覆盖」两个字');
    return;
  }
  const r = fromTxtVein(text);
  if (!r.ok) {
    ctx.setErr('TxtVein 明文解析失败：' + ((r.errors && r.errors[0] && r.errors[0].message) || '格式不对'));
    return;
  }
  ctx.close();
  if (typeof ctx.onImportTemplate === 'function') ctx.onImportTemplate(r.state, r.stats);
}

async function importTxtVeinCipher(ctx, text) {
  if (!ctx.pw) { ctx.setErr('需要账本密码'); return; }
  if (typeof ctx.restoreTxtveinCipher !== 'function') { ctx.setErr('当前不能恢复 TxtVein 密文'); return; }
  try {
    const state = await ctx.restoreTxtveinCipher(text, ctx.pw);
    ctx.close();
    if (typeof ctx.onRestore === 'function') ctx.onRestore(state);
  } catch (e) {
    ctx.setErr('解不开：密码不对，或 bundle 已损坏');
  }
}

export async function importCipherPair(ctx, lText, dText) {
  const l = String(lText || '').trim();
  const d = String(dText || '').trim();
  if (!l || !d) { ctx.setErr('密文是两份：流水和字典都要有'); return; }
  if (/##\s*字典/.test(l)) { ctx.setErr('上面是单文本，不能和字典密文配对；请放流水密文'); return; }
  if (!ctx.pw) { ctx.setErr('需要账本密码'); return; }
  if (typeof ctx.restoreTxtveinCipher !== 'function') { ctx.setErr('当前不能恢复 TxtVein 密文'); return; }
  try {
    const bundle = packBundle([
      { name: 'ledger.enc', text: l },
      { name: 'dict.enc', text: d },
    ], 'deep');
    const state = await ctx.restoreTxtveinCipher(bundle, ctx.pw);
    ctx.close();
    if (typeof ctx.onRestore === 'function') ctx.onRestore(state);
  } catch (e) {
    ctx.setErr('解不开：密码不对，或两份密文不匹配');
  }
}

export function doFileImport(ctx) {
  if (ctx.fileCipher) return importCipherPair(ctx, ctx.fileCipher.ledger, ctx.fileCipher.dict);
  const s = ctx.source;
  if (!s) { ctx.setErr('先点「打开」选择文件'); return; }
  if (s.kind === 'text') return ctx.importText(s.text);
  if (s.kind === 'txtvein') return importTxtVein(ctx, s.text);
  if (s.kind === 'txtvein-cipher') return importTxtVeinCipher(ctx, s.text);
  if (s.kind === 'backup') return ctx.importBackup(s.backup);
  return ctx.importTable(s.result);
}

export function doPasteImport(ctx) {
  const l = ctx.ta ? ctx.ta.value.trim() : '';
  const d = ctx.cDict ? ctx.cDict.value.trim() : '';
  if (!l && !d) { ctx.setErr('先粘贴单文本，或粘贴两份密文'); return; }
  if (!l) { ctx.setErr('还缺流水密文'); return; }
  if (d) return importCipherPair(ctx, l, d);
  if (/\[SECURE_START/.test(l) || /\[TXTVEIN_BUNDLE:/.test(l)) {
    ctx.setErr('双文件密文要两个框都有内容：上面流水、下面字典');
    return;
  }
  const s = sourceFromText(l);
  if (!s) { ctx.setErr('这段文本认不出'); return; }
  if (s.kind === 'txtvein') return importTxtVein(ctx, s.text);
  if (s.kind === 'text') return ctx.importText(s.text);
  ctx.setErr('这段内容不是单文本；密文请放两个框');
}
