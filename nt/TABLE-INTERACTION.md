# 表格交互规范：表头固定 · 冻结列 · 列宽拖动

> 本文记录 `nt/` 多文件版数据区的表格交互实现，以及单文件版（`personal/`）用过的做法。
> 目的是**下次做新表时直接照抄**，不用重新踩一遍坑。
> 相关：[`CODE-RULES.md`](../CODE-RULES.md) · [`ACCOUNTING-MODEL.md`](ACCOUNTING-MODEL.md) · [`GLOSSARY.md`](GLOSSARY.md)

---

## 零、一句话结论

```
列宽的唯一来源是 <col>
表头固定靠 sticky top:0，冻结列靠 sticky left:0
拖动前必须把所有列宽固化，否则拖一列动一排
th 上不许再写 width
```

---

## 一、表结构模板

任何数据区都按这个骨架写：

```html
<div class="nt-tablewrap">            <!-- 横向滚动容器 -->
  <table class="nt-table nt-table-xxx">
    <colgroup>
      <col class="nt-c-seq">          <!-- 每列一个 col，类名 = nt-c-<key> -->
      <col class="nt-c-date">
      <col class="nt-c-from">
    </colgroup>
    <thead>
      <tr>
        <th class="nt-th nt-c-seq" scope="col" data-col="seq">序</th>
        <th class="nt-th nt-c-date" scope="col" data-col="date">日期</th>
        <th class="nt-th" scope="col" data-col="from">转出账户</th>
      </tr>
    </thead>
    <tbody id="nt-xxx-body"></tbody>
  </table>
</div>
```

三条硬要求：

| 要求 | 原因 |
|---|---|
| 每个 `<th>` 必须带 **`data-col="<key>"`** | 拖动靠它认列，不靠索引猜 |
| `<colgroup>` 的 col 数量 **必须等于** 表头列数 | 数量不符会让多出来的列宽度归零（见 §5.4） |
| `<col>` 的类名用 **`nt-c-<key>`** | `applyWidth` 靠 `col.nt-c-<key>` 找到目标列 |

---

## 二、表头固定（吸顶）

```css
.nt-th {
  position: sticky;
  top: 0;
  z-index: 2;          /* 低于冻结列，高于普通单元格 */
}
```

**要点**

- `sticky` 要生效，**祖先元素不能有 `overflow: hidden`**；滚动容器是 `.nt-tablewrap`（`overflow-x: auto`）时，纵向滚动要在更外层。
- `z-index` 分三层：普通格 `0`、表头 `2`、冻结列 `3~4`。层次错了会出现「滚动时表头被内容盖住」。
- 表头背景必须不透明，否则透出下面的行。

---

## 三、冻结列（横向滚动时保持可见）

```css
/* 第 1 列 */
.nt-table-xxx .nt-th:nth-child(1),
.nt-table-xxx .nt-cell:nth-child(1) {
  position: sticky;
  left: 0;
  z-index: 3;
  background: var(--nt-row-bg, var(--nt-bg));   /* 必须不透明 */
}

/* 第 2 列冻结：left 要等于第 1 列的宽度 */
.nt-table-xxx .nt-th:nth-child(2),
.nt-table-xxx .nt-cell:nth-child(2) {
  position: sticky;
  left: var(--nt-col-seq, 44px);                /* 跟着第 1 列宽度走 */
  z-index: 3;
}
```

**右边界线**用内描边，不要用绝对定位伪元素：

```css
/* ✅ 正确：不占布局、不溢出 */
.nt-table-xxx .nt-th:nth-child(1) {
  box-shadow: inset -1px 0 0 0 var(--nt-bg-line);
}

/* ❌ 错误：right:-1px 会在 sticky 列外面多画一条，
   配合不透明背景就变成「冻结列右边很宽的黑带」 */
.nt-table-xxx .nt-th:nth-child(1)::after {
  content: '';
  position: absolute;
  right: -1px;
  width: 1px;
}
```

### 各表冻结列数（当前实现）

| 表 | 冻结列 | 数量 |
|---|---|---|
| 流水记录 | 序 | 1 |
| 分类统计 | 序 · 分类 | 2 |
| 汇总统计 | 序 · 账户名称 | 2 |
| 流水查询 | **不冻结** | 0 |
| 固定收支 | 序 | 1 |
| 分期记录 | 账户名称 | 1 |
| 账户设置 | 简码 | 1 |

---

## 三点五、冻结列的五条硬规则（来自单文件版的踩坑记录）

单文件版（`personal/index.html`）在这些地方反复迭代过，结论比推测可靠。

### ① 冻结列的 `left` 必须由 JS 累加算出

**不要**用 CSS 变量固定：

```css
/* ❌ 前面那列的宽度一变，这里的 44px 立刻错位 */
.nt-table-stats .nt-th:nth-child(2) { left: var(--nt-col-seq, 44px); }
```

```js
// ✅ 渲染后累加实际宽度
export function layoutFrozen(tableEl) {
  const n = FROZEN_COUNT[tableClass];        // 这张表冻结几列
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  let left = 0;
  for (let i = 0; i < n; i += 1) {
    const th = ths[i];
    th.style.left = left + 'px';
    for (const tr of tableEl.querySelectorAll('tbody tr')) {
      const td = tr.children[i];
      if (td) td.style.left = left + 'px';    // 数据行必须同步
    }
    left += Math.round(th.getBoundingClientRect().width);
  }
}
```

**调用时机**：每次渲染后 + 每次拖动中（`applyWidth` 里）。
**症状**：不这么做就是「拖动时乱跳」—— 前一刻的 `left` 还指着旧宽度。

单文件版原话（line 4314）：摘要表五列的 `left` 全部由累加算出。

### ② `sticky` 不能加在 `<th>` 上

> 不能把 sticky 加在 th 上 —— table-cell 的包含块是它自己那一行（tr），
> 高度与单元格相同就没有可移动空间，sticky 会失效。

表头吸顶要加在 `<thead>`：

```css
/* ✅ */
.nt-table thead { position: sticky; top: 0; z-index: 5; }
```

本项目的 `.nt-th` 上也有 `position: sticky`，因为表格用了 `border-collapse` 分离 + 显式 `height`，勉强能生效；**但这是走钢丝**，新表建议直接加在 `thead` 上。

### ③ `sticky` 只认「最近的滚动祖先」

横向滚动必须发生在 **`.nt-tablewrap`** 上：

```css
.nt-tablewrap { overflow-x: auto; }   /* ← 冻结列认的就是它 */
```

如果滚动跑到更外层（比如 `#main`），冻结列**跟不上**——一滚就被甩出去。

推论：**不要给 `.nt-tablewrap` 加 `overflow: hidden`**，那会新建一个裁剪上下文，把 sticky 的锚点搞乱。

### ④ 冻结列必须有不透明背景

```css
.nt-table-flow .nt-cell:nth-child(1) {
  background: var(--nt-row-bg, var(--nt-bg));   /* 跟随行底色，不是固定色 */
}
```

背景跟随行（斑马纹、悬停、分组行都要覆盖），否则滚动时下面的文字会透出来。

### ⑤ `z-index` 要分层，且右列盖左列

```
普通单元格     0
表头           2
冻结列        3 ~ 4
拖动中的手柄   5 以上
```

*右*的冻结列要高于*左*的冻结列，否则左边的列变宽时会盖住右边那个。

---

## 三点六、表宽必须显式设置（否则列宽全错）

`table-layout: fixed` 下，表格宽度**默认跟着容器**，列会按比例缩水：

```
col 写 44px  →  实际渲染 28px
```

于是：

- 冻结列的 `left` 和前一列的实际宽度对不上 → 边界错位
- 拖动时 `getBoundingClientRect().width` 拿到的也不是设定值 → 手感发飘

**必须**：

```js
// 表宽 = 各列之和
let total = 0;
for (const col of table.querySelectorAll('colgroup col')) {
  const w = parseFloat(col.style.width);
  if (Number.isFinite(w) && w > 0) total += w;
}
if (total > 0) table.style.width = total + 'px';
```

**时机**：每次渲染后（`syncTableWidth`）。不能只在解锁时跑一次 —— 那时统计页的表还没渲染（表头是 `buildHead` 动态建的）。

### 附带要求：每列都必须有明确宽度

`col` 没宽度 → 总宽算不出来 → 表格被压回容器宽 → 又回到缩水状态。

所以 `COL_KEYS` 必须覆盖所有用到的列 key。本项目原来只有 14 个，
缺 `name / balance / opening / histOut / histIn / periods / principal`，
导致 `--nt-col-name` 不存在、账户名称整列宽度为 0。

> 追加只能加在**末尾**：`COL_KEYS` 的顺序被存档的「默认列宽」逗号数组依赖。

---

## 四、列宽拖动

### 4.1 手柄尺寸

```css
.nt-col-handle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 7px;                    /* 手指按得住；4px 以下点不准 */
  cursor: col-resize;
  background: transparent;
  z-index: 5;
  touch-action: none;            /* 手机上不许触发页面滚动 */
}

/* 中线：常显，不是只在 hover 时出现 */
.nt-col-handle::after {
  content: '';
  position: absolute;
  top: 20%;
  bottom: 20%;
  left: 3px;
  width: 1px;
  border-radius: 1px;
  background: var(--nt-handle-color, rgba(140, 130, 190, 0.55));
}

/* hover 时拉满整列高度 */
.nt-th:hover > .nt-col-handle::after {
  top: 0;
  bottom: 0;
  background: var(--nt-primary);
}

/* 拖动中禁止选中文字 */
body.nt-col-resizing {
  user-select: none;
  cursor: col-resize;
}
```

### 4.2 判定：右边缘 7px

```js
const rect = th.getBoundingClientRect();
if (ev.clientX < rect.right - 7) return;   // 不在右边缘，是普通点选
```

**不要**用 `pointer-events: none` + 单独监听手柄——手机上 7px 太窄，容易点不中。

### 4.3 事件绑定：委托，只绑一次

```js
export function mountColResize(tableEl, opts) {
  if (!tableEl) return;

  paintHandles(tableEl);                       // ← 每次都补（表头会重建）
  if (tableEl.dataset.colResize === '1') return;
  tableEl.dataset.colResize = '1';

  tableEl.addEventListener('pointerdown', (ev) => {
    const th = ev.target.closest('.nt-th');
    if (!th || !th.dataset.col) return;
    // …拖动逻辑
  });
}
```

**为什么必须委托**：表头被 `thead.textContent = ''` 重建 N 次，绑在 `th` 上的监听全丢。
**为什么 dataset 只管事件**：手柄要跟着重建，所以 `paintHandles` 放在短路之前。

### 4.4 拖动时改什么

一次拖动要同时改三个地方，缺一个就出问题：

```js
export function applyWidth(tableEl, scope, col, width) {
  const px = width + 'px';

  // ① CSS 变量：给「布局」面板复用
  scope.style.setProperty('--nt-col-' + col, px);

  // ② <col>：table-layout:fixed 真正认的是它
  const colEl = tableEl.querySelector('col.nt-c-' + col);
  if (colEl) { colEl.style.width = px; colEl.setAttribute('width', String(width)); }

  // ③ 表格总宽 = 各列之和（否则 fixed 会把列按比例拉回去）
  let total = 0;
  let missing = false;
  for (const c of tableEl.querySelectorAll('colgroup col')) {
    const w = parseFloat(c.style.width);
    if (!Number.isFinite(w) || w <= 0) { missing = true; continue; }
    total += w;
  }
  if (!missing && total > 0) tableEl.style.width = total + 'px';
}
```

### 4.5 拖动前必须固化所有列宽

```js
export function freezeWidths(tableEl, skipCol) {
  const ths = [...tableEl.querySelectorAll('thead .nt-th')];
  const cols = [...tableEl.querySelectorAll('colgroup col')];
  if (!cols.length) return;

  ths.forEach((th, i) => {
    const col = cols[i];
    if (!col) return;
    if (skipCol && th.dataset.col === skipCol) return;   // 正在拖的那列交给拖动
    const w = Math.round(th.getBoundingClientRect().width);
    if (w > 0) { col.style.width = w + 'px'; col.setAttribute('width', String(w)); }
  });
}
```

**不做这一步的后果**：只有目标列有 `width`，其它列在总宽变化时被重新分配 —— 现象就是**「拖一列，另外几列跟着动」**。

### 4.6 阈值

```js
const MIN_W = 28;    // 再窄就点不到内容
const MAX_W = 600;   // 再宽屏幕放不下
```

---

## 五、五个必须记住的坑

### 5.1 `th` 上不许写 width

`table-layout: fixed` 下，**`th` 自己带的类也参与布局**。如果 CSS 里有：

```css
.nt-c-num { width: 100px; }     /* ❌ 会压过 <col> */
```

拖 `<col>` 就有几列不听话。**全部删掉**，宽度只留 `<col>` 一个来源。

本项修复删了 24 条这样的规则。

### 5.2 动态表头要重建手柄和 colgroup

统计页的表头由 `buildHead()` 每次渲染重建：

```js
export function buildHead(thead, columns) {
  // …建 th…
  thead.appendChild(tr);

  // 表头重建了，手柄和 colgroup 必须跟着重建
  const table = thead.closest('table');
  if (table) { ensureColgroup(table); paintHandles(table); }
}
```

否则手柄消失、`col` 数量对不上。

### 5.3 列数校验

```js
const existing = tableEl.querySelector('colgroup');
if (existing && existing.children.length === ths.length) return;   // 数量一致才复用
if (existing) existing.remove();
```

表从 9 列改成 12 列后，旧 `colgroup` 只有 9 个 `col` → 索引越界 → 后 3 列宽度变成 **0**（整列消失）。

### 5.4 求和不能用 `getComputedStyle`

`getComputedStyle(col).width` 在 fixed 布局下返回**当前分摊值**，用它求和会把临时宽度固化下来。只用 `col.style.width`。

### 5.5 一次性给所有表挂上

```js
// app.js 的 enterApp / renderActive 各调一次
bindAllColResize({ onResize: onColResize });
```

```js
export function bindAllColResize(opts) {
  for (const table of document.querySelectorAll('table.nt-table')) {
    ensureColgroup(table);
    freezeWidths(table);      // 每次渲染后固化一次
    mountColResize(table, opts);
  }
}
```

---

## 六、单元格文本

```css
.nt-table .nt-th,
.nt-table .nt-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```

**不要换行**：换行会让行高忽高忽低、列宽被撑开、表头和数据的行高对不齐。要看全文就拖宽那一列。

例外：说明页的段落块（`.nt-text-block`）不是数据区，正常换行。

---

## 七、配置键值对照表

`js/core/settings.js` 的 `SCHEMA` 是唯一登记处。改默认值只改这里。

### 7.1 标签栏

| 键 | CSS 变量 | 默认 | 作用 |
|---|---|---|---|
| 标签栏行高 | `--nt-tabs-h` | `40px` | 顶部 7 个标签的高度 |
| 标签栏字号 | `--nt-tab-font` | `13px` | 标签文字大小 |
| 标签栏文字颜色 | `--nt-tabs-color` | `#b9b2d0` | |
| 标签栏背景颜色 | `--nt-tabs-bg` | `#0e0b16` | |
| 标签栏行背景色 | `--nt-tab-bg` | `#0e0b16` | 单个标签的底 |
| 标签栏边框 | `--nt-tabs-border-style` | `solid` | 枚举：按钮框/竖线/直角框/无边框 |
| 标签栏边框颜色 | `--nt-tabs-border` | `#2a2438` | |

### 7.2 表格与边框

| 键 | CSS 变量 | 默认 | 作用 |
|---|---|---|---|
| 默认文字颜色 | `--nt-unit-text` | `#f2eeff` | 单元格文字 |
| 默认背景颜色 | `--nt-unit-bg` | `#000000` | 单元格底 |
| 整行背景色 | `--nt-unit-row-bg` | `#0e0b16` | 行底（与格底交替） |
| 横向边框 | `--nt-border-h-style` | `solid` | 枚举：无/虚线/实线 |
| 横向边框线粗 | `--nt-border-h-width` | `1px` | |
| 横向边框颜色 | `--nt-border-h-color` | `#2a2438` | |
| 纵向边框 | `--nt-border-v-style` | `none` | |
| 纵向边框线粗 | `--nt-border-v-width` | `1px` | |
| 纵向边框颜色 | `--nt-border-v-color` | `#2a2438` | |
| **手柄位置** | `--nt-handle-offset` | `-3px` | 手柄相对列右边缘的偏移 |
| **手柄颜色** | `--nt-handle-color` | `#5f5878` | 中线颜色 |

### 7.3 列标行（表头）

| 键 | CSS 变量 | 默认 | 作用 |
|---|---|---|---|
| 列标行行高 | `--nt-th-h` | `26px` | 表头高度 |
| 列标行字号 | `--nt-th-font` | `12px` | 表头字号 |
| 列标行对齐 | `--nt-th-align-<col>` | 见下 | 每列对齐：`左/中/右` |
| **手柄高度** | `--nt-handle-h` | `26px` | 手柄竖向范围 |

### 7.4 数据区

| 键 | CSS 变量 | 默认 | 作用 |
|---|---|---|---|
| 数据区行高 | `--nt-row-h` | `32px` | 每行高度 |
| 数据区字号 | `--nt-cell-font` | `14px` | 单元格文字 |
| 默认列宽 | `--nt-col-<key>` | 见下表 | 拖动后写回这里 |
| 对齐 | `--nt-align-<col>` | 见下 | 每列对齐 |

### 7.5 列宽变量全表

`COL_KEYS` 顺序：

```
seq, date, type, cat, code, num, amount, action, state, freq, day, from, to, note
```

| key | CSS 变量 | 默认宽 | 用在哪 |
|---|---|---|---|
| `seq` | `--nt-col-seq` | `44px` | 序 |
| `date` | `--nt-col-date` | `84px` | 日期 |
| `type` | `--nt-col-type` | `72px` | 类型 |
| `cat` | `--nt-col-cat` | `76px` | 分类 |
| `code` | `--nt-col-code` | `64px` | 简码 |
| `num` | `--nt-col-num` | `100px` | 数量类 |
| `amount` | `--nt-col-amount` | `96px` | 金额 |
| `action` | `--nt-col-action` | `40px` | 操作（删除） |
| `state` | `--nt-col-state` | `64px` | 状态 |
| `freq` | `--nt-col-freq` | `64px` | 频率 |
| `day` | `--nt-col-day` | `64px` | 账单日 / 还款日 |
| `from` | `--nt-col-from` | `88px` | 转出账户 |
| `to` | `--nt-col-to` | `88px` | 转入账户 |
| `note` | `--nt-col-note` | `90px` | 备注 |
| `name` | `--nt-col-name` | — | 账户名称 |
| `balance` | `--nt-col-balance` | — | 当前结余 |
| `opening` | `--nt-col-opening` | — | 期初 |
| `histOut` | `--nt-col-histOut` | — | 转出历史 |
| `histIn` | `--nt-col-histIn` | — | 转入历史 |

> 带 `—` 的没有固定默认值，由 `freezeWidths` 在首次渲染后按实际内容宽度固化。

### 7.6 默认对齐（`DEFAULT_COL_ALIGN`）

```
左,左,左,左,左,右,右,中,中,中,中
（对应 seq…day 的顺序）
```

数字列 `右`、操作列 `中`，其余 `左`。

---

## 七点五、参数作用域：为什么有些参数「怎么调都控制不到」

`applySettings` 写 CSS 变量时，**不是全写 `:root`**，而是看 `GROUP_SCOPE`：

```js
const scope = GROUP_SCOPE[item.group] || 'global';
const target = scope === 'global'
  ? document.documentElement
  : document.querySelector('[data-view="' + scope + '"]');
target.style.setProperty(item.cssVar, item.value);
```

| 作用域 | 变量写到哪 | 影响范围 |
|---|---|---|
| `global` | `:root` | 全部页面 |
| `flow` 等 | `[data-view="flow"]` 容器 | **只有那一页** |

### 踩过的坑

`按钮尺寸` / `列标行` / `数据区` 三个组原来标的是 `'flow'`。但本项目 **7 个页面都有表头和按钮区**，于是：

- 面板里改「列标行字号」→ **只有流水页变**，其它页不动
- 看着就是「这个参数控制不到」
- 而且用 `:root` 做的探针改不动它 —— 元素读的是更近的 `[data-view="flow"]` 上的值，**不是 `:root`**

修法：三个组全部改成 `'global'`。

### 判断规则

**只有确实只属于某一页的参数才用 `flow` 作用域。**
目前 `GROUP_SCOPE` 里全部是 `global` —— 因为表头、按钮区、数据区在每一页都有。

### 排查这类问题的方法

**① 先审计变量有没有被 CSS 用**

```python
# 从 settings.js 抽 cssVar，再到所有 css 里查 var(<name>
for it in items:
    used = re.search(r"var\(\s*" + re.escape(it["var"]) + r"\b", css) is not None
```

本项目第一次审计：32 项里 **6 项没被任何 CSS 消费**（改了必然没反应）。

**② 再查作用域**

变量被 CSS 用了还是不动？看它被写到哪个元素上：

```js
// 在浏览器里
getComputedStyle(document.documentElement).getPropertyValue('--nt-th-font')      // :root 上有没有
getComputedStyle(document.querySelector('[data-view="flow"]')).getPropertyValue('--nt-th-font')
```

**③ 最后用 CDP 看谁赢了**

```python
st = b.call("CSS.getMatchedStylesForNode", {"nodeId": node_id}, sid)
for m in st["matchedCSSRules"]:
    for p in m["rule"]["style"]["cssProperties"]:
        if p["name"] == "font-size":
            print(m["rule"]["selectorList"]["text"], p["value"])
```

脚本：`_tools/audit_css_vars.py`、`_tools/nt_css_matched.py`

---

## 八、各表结构速查

### 流水记录 · 7 列 · 冻结序

```
序 日期 转出账户 转入账户 金额 备注 操作
```

`colgroup` 顺序：`seq / date / from / to / amount / note / action`

> ⚠️ 这个 `colgroup` 曾经错抄成统计表的 `type/cat/code/num`，导致整排列宽错位、表头和数据行左右边框对不上。`<col>` 是按**位置**生效的，不看类名语义。

### 分类统计 · 7 列 · 冻结序+分类

```
序 分类 当前结余 转出 转入 转出历史 转入历史
```

### 汇总统计 · 12 列 · 冻结序+账户名称

```
序 账户名称 当前结余 转出 转入 转出历史 转入历史 期初 类型 分类 账单日 还款日
```

### 流水查询 · 7 列 · 不冻结 · 三栏横向滑动

```
序 频率 日期 转出账户 转入账户 金额 备注
```

```css
@media (max-width: 900px) {
  .nt-query-grid {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
  }
  .nt-query-panel {
    flex: 0 0 92%;                /* 露出 8% 下一栏，提示可滑 */
    scroll-snap-align: start;
  }
}
```

### 固定收支 · 7 列 · 冻结序

```
序 频率 日期 转出账户 转入账户 金额 备注（+ 操作）
```

### 分期记录 · 5 + N 列 · 冻结账户名称 · 双行

```
账户名称 分期金额 期数 账单日 还款日 还款月2026-10 还款月2026-11 …
```

- 每条分期占 **2 行**：上行本金、下行利息
- 月份列由 `paintHead()` 按 `calcInstallmentMatrix` 的跨度动态生成
- `colgroup` 与表头**同步生成**

### 账户设置 · 14 列 · 冻结简码

```
简码 序 账户名称 当前结余 转出 转入 转出历史 转入历史 期初 类型 分类 账单日 还款日 操作
```

---

## 九、新表接入清单

按顺序做完这 9 条，表格交互就齐了：

1. `index.html`（或模板）里写 `<div class="nt-tablewrap">` 包住 `<table class="nt-table nt-table-xxx">`
2. 写 `<colgroup>`，每列一个 `<col class="nt-c-<key>">`
3. 每个 `<th>` 加 `data-col="<key>"`
4. CSS 里给这张表指定 `table-layout: fixed; width: auto`
5. 冻结列用 `position: sticky; left: …` + 不透明背景 + `z-index`
6. 冻结列右边界用 `box-shadow: inset -1px 0 0 0`
7. 行模板的 `<td>` 用 `nt-cell` + 需要的修饰类
8. `renderActive` / 渲染函数末尾调 `bindAllColResize()`
9. 动态表头的话，在 `buildHead` 末尾调 `ensureColgroup` + `paintHandles`

---

## 十、验证做法

**不要靠读代码判断**，要在真实浏览器里量：

```js
// 拖动前后每列宽度
const ths = [...table.querySelectorAll('thead .nt-th')];
const before = ths.map(t => Math.round(t.getBoundingClientRect().width));
// …派发 pointerdown / pointermove / pointerup…
const after = ths.map(t => Math.round(t.getBoundingClientRect().width));

// 断言：只有目标列变了
const othersChanged = before
  .map((w, i) => ({ i, d: after[i] - w }))
  .filter(x => x.i !== targetIdx && Math.abs(x.d) > 1);
```

对齐用逐像素比较：

```js
const thBox = ths.map(x => { const r = x.getBoundingClientRect(); return [r.left, r.right]; });
const tdBox = tds.map(x => { const r = x.getBoundingClientRect(); return [r.left, r.right]; });
const aligned = thBox.length === tdBox.length
  && thBox.every((b, i) => Math.abs(b[0] - tdBox[i][0]) <= 1 && Math.abs(b[1] - tdBox[i][1]) <= 1);
```

本项目的验证脚本：`_tools/nt_col_isolate_e2e.py`、`_tools/nt_handles_e2e.py`、`_tools/nt_align_e2e.py`。
