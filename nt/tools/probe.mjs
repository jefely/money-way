/**
 * UI 探针 —— 必须的操作步骤
 *
 * 用法：
 *   node nt/tools/probe.mjs <url> "<js 表达式>"
 *   例：node nt/tools/probe.mjs http://127.0.0.1:8082/nt/index.html \
 *         "document.querySelector('.nt-add-ledger-name').getBoundingClientRect().left"
 *
 * 行为：起一个临时 headless Chrome（独立 profile，空账本），自动完成首次设密码，
 * 等应用可见后执行表达式，把结果 JSON 打到标准输出，然后退出。
 *
 * 存在的理由：改 CSS/布局时**不许靠猜**——先量出实际像素，再改，再量一次确认。
 * 之前多次「改了没效果」都是因为实际值与假设不同（checkbox 13px、空 actions 占位等）。
 */

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PORT = 9300 + Math.floor(Math.random() * 4000);
const PROFILE = join(tmpdir(), 'nt-probe-' + Date.now());
const PW = 'probe1234';

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' -> ' + res.status);
  return res.json();
}

async function waitFor(fn, ms = 10000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return true; } catch (e) { /* retry */ }
    await sleep(step);
  }
  return false;
}

function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    }
  };
  return {
    send(method, params = {}) {
      const mid = ++id;
      return new Promise((res, rej) => {
        pending.set(mid, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
  };
}

async function evalJs(cdp, expression) {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) {
    const ex = r.exceptionDetails.exception;
    throw new Error('JS 异常: ' + (ex ? ex.description : r.exceptionDetails.text));
  }
  return r.result.value;
}

async function main() {
  const url = process.argv[2];
  const expr = process.argv[3];
  if (!url || !expr) {
    console.error('用法: node nt/tools/probe.mjs <url> "<js 表达式>"');
    process.exit(2);
  }

  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitFor(async () => {
      const v = await getJson('http://127.0.0.1:' + PORT + '/json/version');
      return !!(v && v.webSocketDebuggerUrl);
    }, 12000);

    const list = await getJson('http://127.0.0.1:' + PORT + '/json/list');
    const page = list.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });

    const cdp = makeClient(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url });

    // 首次打开：gate 是设密码表单
    await waitFor(() => evalJs(cdp, "!!document.getElementById('nt-gate') && !document.getElementById('nt-gate').hidden"), 10000);
    await evalJs(cdp, "(async () => {" +
      "const pw = document.getElementById('nt-setup-pw');" +
      "if (!pw) return 'already-unlocked';" +
      "pw.value = '" + PW + "';" +
      "document.getElementById('nt-setup-pw2').value = '" + PW + "';" +
      "const ack = document.getElementById('nt-setup-ack');" +
      "ack.checked = true; ack.dispatchEvent(new Event('change', { bubbles: true }));" +
      "await new Promise((r) => setTimeout(r, 60));" +
      "document.getElementById('nt-setup-form').requestSubmit();" +
      "return 'setup-submitted';" +
      "})()");

    await waitFor(() => evalJs(cdp, "!document.getElementById('nt-app').hidden"), 15000);

    const value = await evalJs(cdp, expr);
    console.log(JSON.stringify(value, null, 2));

    ws.close();
  } finally {
    try { chrome.kill(); } catch (e) { /* ignore */ }
    await sleep(300);
    try { await rm(PROFILE, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
}

main().catch((e) => {
  console.error('探针失败:', e.message);
  process.exit(1);
});
