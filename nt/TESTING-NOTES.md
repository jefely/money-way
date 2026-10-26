# nt/ 测试笔记（探针的坑）

> 无头 Chrome + CDP 验证 UI 时踩过的坑。**每条都导致过误判**，记下来免得重犯。

---

## ★ 头号坑：单线程 HTTP 服务器会伪装成「模块语法错误」

**症状**：页面白屏，控制台只有一句
`Failed to fetch dynamically imported module: .../xxx.js`，
但文件 HTTP 200、大小正确、`node --check` 通过、单独 import 也成功。

**真因**：测试脚本用了 `socketserver.TCPServer`（**单线程**）。
浏览器一次并发请求十几个 ES 模块，服务器串行处理，排到后面的请求超时 → 随机某个模块加载失败。
**换哪个模块失败是随机的**，所以看起来像"这个文件有语法问题"。

**修法**：

```python
httpd = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)  # 不是 TCPServer
```

**这个坑我踩了三次**（`migrate.js`、`theme-manager.js`、`path-app.js`），
前两次都误判成"Chrome 预解析拒绝某语法"并重写了代码。**代码本来就是对的。**

判据：如果同一份代码在 `_probe.html` 里逐个 `await import()` 全成功，
而在页面里用 `<script type="module" src>` 就失败 —— 先换服务器，别改代码。

---

## 三个会骗人的探针

### 1. `transition` 让你读到旧值

`theme.css` 给 body 加了 `transition: background-color .18s`。
`setAttribute('data-theme','dark')` 之后**同一帧**读 `getComputedStyle(body).backgroundColor`，
拿到的是**过渡起点**（白色），看起来像"主题没生效"。

**正确做法**：改完等 ≥ 250ms 再读，或者插一个没有 transition 的临时元素对比：

```js
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;left:-9999px;background:var(--nt-bg)';
document.body.appendChild(probe);
getComputedStyle(probe).backgroundColor;   // 立刻就是新值
```

### 2. `Runtime.evaluate` 里做相对路径 `import()` 会失败

```js
// 在 CDP 的 evaluate 里执行：
await import('./js/ui/theme-manager.js');
// → "Failed to fetch dynamically imported module"
```

这不是代码坏了，是 evaluate 的执行上下文没有正确的 base URL。
同样的文件用 **Blob** 导入就正常：

```js
const text = await (await fetch(path)).text();
await import(URL.createObjectURL(new Blob([text], {type:'text/javascript'})));
```

**判据**：如果 blob-import 成功而 URL-import 失败，问题在探针，不在代码。

### 3. 元素 `hidden` 时仍能 `click()`，但祖先隐藏会让判断混乱

`#nt-app` 有 `hidden` 时它的按钮仍存在于 DOM、仍能 `.click()`。
所以「点击没反应」既可能是**事件没绑**，也可能是**页面根本没进到那一步**。
必须先读一次状态（`appHidden` / gate 是否显示）再下结论。

---

## 一条可靠的模块自检

浏览器不给错误位置时，先在 **Node 里把每个模块都 import 一遍**：

```powershell
node --input-type=module -e "
for (const m of ['ui/modal','core/schema', ...]) {
  try { await import('./nt/js/' + m + '.js'); console.log('OK  ', m); }
  catch (e) { console.log('FAIL', m, '->', e.message.split('\n')[0]); }
}"
```

它能区分两类问题：

| 现象 | 含义 |
|---|---|
| Node import 失败 | 真的是语法/导出错 |
| Node import 成功但浏览器失败 | **先怀疑服务器与探针**（见头号坑） |

（早期记录的「Chrome 预解析拒绝 `?.` / 嵌套展开」并不成立——
那次 `migrate.js` 失败真实原因是单线程服务器，重写只是碰巧改变了请求时序。）

---

## 判断顺序（照这个来，别跳）

1. `node --check` / Node import → 排除语法
2. HTTP 取文件（状态码 + Content-Type + 字节数）→ 排除服务端缺文件
3. **服务器是不是单线程** → 排除并发拥塞
4. Blob import → 排除探针 base URL
5. 页面状态探针（gate / app hidden / 元素存在）→ 排除时序
6. **改完属性等 250ms 再读** → 排除 transition

跳步的代价：我在「模块加载失败」上耗了整整三轮，实际是第 3 步。

