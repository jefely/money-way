# 表格交互规范：表头固定 · 冻结列 · 列宽拖动

> 本文记录 `nt/` 多文件版数据区的表格交互实现，以及单文件版（`personal/`）用过的做法。
> 目的是**下次做新表时直接照抄**，不用重新踩一遍坑。
> 相关：[`CODE-RULES.md`](../CODE-RULES.md) · [`ACCOUNTING-MODEL.md`](ACCOUNTING-MODEL.md) · [`GLOSSARY.md`](GLOSSARY.md)

---

## 零之前、唯一执行者原则（2026-10 推倒重做）

### 当时乱成什么样

同一件事有**三处代码在做**，互相覆盖：

| 文件 | 干了什么 |
|---|---|
| `apply-settings.js` | 写 `--nt-col-*` 变量 **+ 直接设 `<col>` 宽度 + 设 `table.style.width`** |
| `ui/col-resize.js` | 拖动时又设一遍 `<col>` 宽度 + 又算一遍表宽 + 又算冻结 `left` |
| `shell.css` | 24 条 `.nt-c-{seq,type,cat,…} { width: … }` 也参与布局 |

三者结论不一致时，谁最后跑谁赢。症状：

- 拖一列，另外几列跟着变
- 拖动时列宽乱跳
- 冻结列边界错位
- 面板里改「列宽」不生效

### 现在的分工

```
applySettings  →  只写 --nt-* 变量（一行都不碰 <col> 和 table.style.width）
syncTable      →  按变量设 <col> 宽度 → 表宽 = 之和 → 冻结 left 按实际累加
shell.css      →  只声明「谁 sticky」和层级/背景，一个宽度都不写
```

**文件**：`js/ui/table-layout.js`（唯一执行者）

导出的东西：

| 函数 | 职责 |
|---|---|
| `ensureCols(table)` | colgroup 列数与表头一致 |
| `syncTable(table)` | 幂等同步：col 宽度 → 表宽 → 冻结 left |
| `syncAllTables()` | 页面上所有表同步一遍 |
| `syncFrozen(table)` | 冻结列的 left 按实际宽度累加 |
| `setColWidth(table, key, w)` | 拖动时用；顺带重算表宽和冻结 |
| `mountResize(table, opts)` | 绑手柄 + 拖动（事件委托，只绑一次） |
| `bindAllResize(opts)` | 所有表挂手柄 + 同步 |

挂载点只有两处：

```js
// enterApp：挂手柄
bindAllResize({ onResize: onColResize });

// renderActive：只同步，不重复绑
syncAllTables();
```

动态表头（`buildHead` 每次重建）通过事件通知：

```js
// table.js
table.dispatchEvent(new CustomEvent('nt-layout-refresh'));

// table-layout.js 里监听
document.addEventListener('nt-layout-refresh', (ev) => {
  const table = ev.target.closest('table');
  if (table) { paintHandles(table); syncTable(table); }
});
```

### 判断某个改动该放哪

> 它是在**产生一个值**，还是在**消费一个值**？
>
> 产生 → `applySettings`（写变量）
> 消费 → `syncTable`（读变量、落到 DOM）
>
> 两边都做 = 迟早打架。

### 宽度取值优先级（`syncTable` 内部）

```
① <col> 上已有的 style.width         （拖动过的、上次同步留下的）
② --nt-col-<key> 变量                 （面板「默认列宽」）
③ 表头当前实际渲染宽度                 （首次渲染）
④ DEFAULT_COL_W = 88px                （表还没布局，比如隐藏视图）
```

四层兜底保证**每列都有宽度** —— 少一列有宽，表宽就少算，整张表被压回容器宽，又回到「设定 44px、实际 28px」的缩水状态。

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

### 2.1 多行表头：吸顶加在 `<thead>`，不要给每个 `th` 写 top

分期表是**两行表头**（合计行 + 月份行）。2026-11 之前把 sticky 写在每一个
`th` 上，再给第二行一个 `top` 把它错开 —— 这条路有两个躲不掉的坑：

1. **`top` 是一个要「量第一行多高」的数**。第一行实际 26px，而变量
   `--nt-row-h` 是 32px，两行之间永远有一条 6px 缝，数据从缝里滚过去。
2. **任何一条 `position: relative` 都会让那一格悄悄退出 sticky**。
   `.nt-inst-month { position: relative }`（本意是给「删除」按钮做定位上下文）
   把月份表头的 position 改成 relative，sticky 直接失效；而继承下来的
   `top: 32px` 在 relative 下变成「相对下移 32px」——月份标签整行插进数据区，
   这就是用户截图里的「表头冻结不正常」。

正确做法和查询表的三行表头一样：**只让 `<thead>` 一个元素 sticky**。

```css
.nt-table-inst thead {
  position: -webkit-sticky;
  position: sticky;
  top: 0;
  z-index: 6;                                  /* 压过整个 tbody */
  background: var(--nt-bg);                    /* 必须是实底 */
}
.nt-table-inst thead .nt-th {
  position: relative;                          /* 只给手柄做定位上下文 */
  top: auto;
  z-index: auto;
}
.nt-table-inst thead .nt-th:nth-child(1) {
  position: sticky;
  left: 0;
  z-index: 10;       /* 必须高于列宽手柄 5，否则横滚后别的列的手柄会抢点击 */
}
.nt-table-inst .nt-cell:nth-child(1):not([colspan]) {
  position: sticky;
  left: 0;
  z-index: 3;                                  /* 低于 thead 的 6 */
}
```

**为什么这样就没有「第一行多高」这个问题**：两行是 thead 内部的普通行，
一起被 thead 带着吸顶，行与行之间不可能出现缝；也不需要第二行 top。

验证（390px 宽、纵向滚 600px 后量的实测值）：`thead.top` = 滚动容器 top；
第一行 `bottom` = 第二行 `top`；月份 `th` 的 `top` = 第二行 `top`；
首列 `th` / 数据格 `left` = 容器 `left`。

**不要**给 `th` 写 `position: relative` 去错开多行表头 —— 理由同上。
`th` 上需要绝对定位的装饰（`::before` 色膜）靠 sticky 自带的定位上下文就够了。

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
| 分类-资产/负债/权益 / 分类-费用/收入/成本 | **不冻结** | 0 |
| 汇总统计 | 节点名称 | 1 |
| 流水查询 | **不冻结** | 0 |
| 固定收支 | 序 | 1 |
| 分期记录 | 账户名称 | 1 |
| 账户设置 | 简码 | 1 |

> 分类视图 2026-11 改成三块独立的表（存量 / 流量 / 分类查询），
> 不再共用 `.nt-table-stats`，所以「分类统计冻结序+分类」这条已经不存在了。

### 只冻结首列时：left 由 CSS 写死（设置页账户表）

首列冻结的 `left` 恒为 0，没有「前一列变宽」的问题，不需要累加 ——
直接写在 CSS 里，JS 一个字都不用写：

```css
.nt-table-accounts .nt-th:nth-child(1) {
  position: sticky;
  left: 0;
  z-index: 6;
}

.nt-table-accounts .nt-cell:nth-child(1):not([colspan]) {
  position: sticky;
  left: 0;
  z-index: 4;
}
```

`ui/table-layout.js` 的 `CSS_FROZEN` 集合列出这类表；`syncFrozen` 对它们只清历史内联
`left`，不写值。判据见 §零：**CSS 产生值，JS 只消费**。

`:not([colspan])` 不能省：A/B 区域标题行与空状态行是 `colspan=10` 的整行格，
它们也是所在 `tr` 的第 1 个 child。给跨列格加 `sticky + left` 会让整行跟着横滚，
症状是「说不清的乱跳」—— 见本文 §5.7。

**首行**：表头冻结与冻结列是两件事。表头由 `.nt-th { position: sticky; top: 0 }`
负责（§二），和横向的 `left` 互不影响。设置页只冻结这两处：首列 + 首行。

**区域标题也拆进了首列（v1.73）**：A / B 两行的区号 `A` / `B` 放在
`td.nt-zone-tag`（首列，跟着 sticky 走），长标题和极性说明放在 `colspan=9`
的第二格。横滚时区号不滑走，长标题正常滑走。

给这个首格写背景有一个坑：冻结列的
`background: var(--nt-row-bg, var(--nt-bg))`（特异性 0,4,0）是**简写**，
会把区域规则的 `background-image` 一起重置成 `none`。所以区号格要用
「底色 + 色膜」的简写再写一遍，并把选择器抬到
`.nt-table-accounts tbody tr.nt-zone-a > td.nt-cell.nt-zone-tag`（0,4,3）才压得住；
而且它必须是**不透明**的，否则横滚时下一格的字会从区号下面透出来。

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

> **例外**：只冻结首列时 `left` 恒为 0，直接写死在 CSS 里，不需要累加 ——
> 见 §三 末「只冻结首列时：left 由 CSS 写死」。设置页账户表就是这一种。

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

## 三点六、表宽必须等于列宽之和（否则列宽全错）

`table-layout: fixed` 下，表格宽度**默认跟着容器**，列会按比例缩水：

```
col 写 44px  →  实际渲染 28px
```

于是：

- 冻结列的 `left` 和前一列的实际宽度对不上 → 边界错位
- 拖动时 `getBoundingClientRect().width` 拿到的也不是设定值 → 手感发飘

**现在的做法（nt-v1.72 起）：交给 CSS 的 `width: max-content`，JS 不写表宽。**

```css
.nt-table { width: max-content; }              /* = 各列 width 之和 */
.nt-table.cols-custom { width: max-content; }  /* 拖动后仍然成立 */
```

容器更宽 → 右侧留白；更窄 → `.nt-tablewrap` 横向滚动。拖动只改
`th.style.width`，表宽自动跟随 —— 没有「JS 求和写 `table.style.width`」这一步，
也就没有「算出来的和与浏览器实际布局不一致」的机会。

> **历史**：单文件版（`personal/index.html`）用的是 JS 读 `<col>` 求和再写
> `table.style.width`。那条路要求 col 数量与表头严格对齐，本项目改成一列一
> `--nt-col-*` 之后不再需要。这里保留结论（表宽 = 列宽之和），实现方式不同。

### 附带要求：每列都必须有明确宽度

`col` 没宽度 → 总宽算不出来 → 表格被压回容器宽 → 又回到缩水状态。

所以 `COL_KEYS` 必须覆盖所有用到的列 key。本项目原来只有 14 个，
缺 `name / balance / opening / histOut / histIn / periods / principal`，
导致 `--nt-col-name` 不存在、账户名称整列宽度为 0。

> 追加只能加在**末尾**：`COL_KEYS` 的顺序被存档的「默认列宽」逗号数组依赖。

---

## 四、列宽拖动

### 4.1 手柄尺寸与命中区

> **2026-11 复盘（这个坑反复出现，根因不是 CSS 写错，而是「两处默认值各说各话 + 透明层占位」）**
>
> 1. CSS 的 `--nt-handle-w` fallback 是 7px，但参数表 `settings.js` 里这项默认值是 14px；
>    面板一启动就把 `:root` 写成 14px，CSS fallback 永远不生效。窄列（序 34~44px、金额 34~41px）
>    右侧 14px 全落在透明命中区里，列标只能显示半个字。
>    透明层去掉后命中区不再占字，**最终仍回到 14px**：旧存档里是 7 的自动迁到 14，
>    自调的其它值保留。现在 14px 只是「th 右边缘的坐标判定」，列内没有任何遮挡。
> 2. 固定表还有 **8px 单元格左右内边距 + 4px 输入框左右内边距**；列宽 34px 时只剩 10px 给文字，
>    看起来就像「右边多出一块遮盖」。现在固定表收到 3px / 2px，优先把宽度还给文字。
> 3. 序冻结只写了 `position: sticky`，没写 `left: 0`；`syncFrozen` 又按「CSS 负责 left」的约定
>    清掉了内联 left —— 两头都没给值，sticky 就没有横向偏移，数据列横滚时整列滑走。
>    现在固定表表头/数据格都写 `left: 0`，数据格 z-index 4（普通表头 5 压得住它）。
> 4. 透明手柄层本身占列宽：7/14px 的命中块盖在列标右边缘，列越窄文字越没地方。
>    现在手柄只是 **1px 可视线 + `pointer-events: none`**，并且**从列右边缘左移 2px**；
>    命中判定由 JS 从这条线往左算，列内不再有任何透明占位，也不压在列线上。

```css
.nt-col-handle {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 1px;                       /* 只是可视线，不参与命中 */
  pointer-events: none;
  background: transparent;
  z-index: 5;
}

/* 中线：默认透明，悬停/拖动才亮；高度固定 70% */
.nt-col-handle::after {
  content: '';
  position: absolute;
  top: 15%;
  bottom: 15%;
  left: 0;
  width: 1px;
  border-radius: 1px;
  background: transparent;
  transition: background-color 0.12s ease;
}

.nt-th:hover > .nt-col-handle::after {
  background: var(--nt-handle-color, #8c82be);
}

/* 拖动中禁止选中文字 */
body.nt-col-resizing {
  user-select: none;
  cursor: col-resize;
}

/* 手机：表头横向手势交给 JS，纵向滚动保留 */
.nt-th { touch-action: pan-y; }
```

### 4.2 判定：列右边缘左移 2px，再往左 `--nt-handle-w`（默认 14px）

```js
const hit = ev.target.closest('.nt-th');
if (!hit) return;
const edge = Number(getComputedStyle(hit).getPropertyValue('--nt-handle-w')) || 14;
// 在整行表头里找：边界线 = 列右边缘 - 2，手指在线左侧 edge 内命中；
// 线右侧到列边界这 2px 只做误差容限，不能越过列边界
const lineX = cell.getBoundingClientRect().right - 2;
if (ev.clientX > cell.getBoundingClientRect().right) continue;
if (Math.max(0, lineX - ev.clientX) <= edge) { /* 命中这一列 */ }
```

手机还要在表头上写 `touch-action: pan-y`：保留纵向滚动，横向拖动交给 JS；
否则浏览器会把横向拖动当成表格横滚，pointer 事件被 cancel，表现就是「拖不稳」。

**不能压在列线上**（单文件版实测结论）：触摸压在线上时 `event.target` 可能落到右边那一列，
而且手指很难稳定停在 1px 的线上。现在可视线和命中区都**左移 2px**；
命中区只往左算，碰到左列、右列都按坐标选中同一条边界。

**不要**再放透明 span 做命中：透明块会盖住列标文字，窄列时「能显示的字」和「能拖的区域」互相抢宽度。

### 4.3 事件绑定：委托，只绑一次

```js
export function mountColResize(tableEl, opts) {
  if (!tableEl) return;

  paintHandles(tableEl);                       // ← 每次都补（表头会重建）
  if (tableEl.dataset.colResize === '1') return;
  tableEl.dataset.colResize = '1';

  tableEl.addEventListener('pointerdown', (ev) => {
    const th = ev.target.closest('.nt-th');
    if (!th) return;
    const rect = th.getBoundingClientRect();
    const edge = Number(getComputedStyle(th).getPropertyValue('--nt-handle-w')) || 7;
    if (ev.clientX < rect.right - edge) return;   // 不是右边缘，交给普通点选
    // …拖动逻辑
  });
}
```

**为什么必须委托**：表头被 `thead.textContent = ''` 重建 N 次，绑在 `th` 上的监听全丢。
**为什么 dataset 只管事件**：手柄线要跟着重建，所以 `paintHandles` 放在短路之前。
**为什么不在 handle 上判定**：1px 的线太窄，7/14px 的透明块又会盖字；在 th 上按坐标判定两头都不占。

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

### 4.7 两行表头：拖动要写**每一行**的同一个 th

`flush()` 只写被拖的那一个 `th` 时，另一行表头保持旧宽度；`table-layout: fixed`
下两行分叉，看起来就是「这一列怎么拖都不窄」（2026-11 分期表用户实测）。

```js
for (const tr of tableEl.querySelectorAll('thead tr')) {
  const cell = tr.children[idx];
  if (cell) cell.style.width = px;
}
```

另外：**冻结列表头的 z-index 必须高于列宽手柄（5）**。横滚后别的列的
handle 会滑到冻结列下面，层级低了就抢走点击 —— 点「分期银行」右边缘，
实际拖的是藏在下方的某一列。分期表冻结表头的层级因此是 10（见 §2.1）。

分期表的 3 个固定列没有登记进 `TABLE_COLS`（它是 3 固定 + N 动态月份），
宽度存 `localStorage.nt_inst_cw`，重画后由 `ui/inst-layout.js` 应用；
月份列宽存 `nt_inst_mw`，两套互不影响。

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

### 5.6 `max-width` 会钳住拖出来的宽度（最隐蔽的一个）

A 模式为了「冻结列宽度确定」，给首列写了：

```css
.nt-table-flow .nt-th:nth-child(1) {
  width: var(--nt-col-seq, 54px);
  min-width: 54px;
  max-width: 54px;      /* ← 这两个 */
}
```

**CSS 规则里 `max-width` 优先于 `width`。** 所以进 B 模式拖动后：

```
th.style.width = 104px        我们设的
th.getBoundingClientRect() = 58px    被 max-width 钳住
table.style.width = 664px     按 104+84+112… 求和
```

多出来的 46px 没有消失，而是被**平均分给其它列** → 整表都变宽 → 现象就是「拖一列，别的列跟着动」，而且**看不出哪里错了**（因为 DOM 上的 style 全是对的）。

诊断方式：**同时打印 `th.style.width` 和 `th.getBoundingClientRect().width`**，两者不等就是这个坑。

```
thStyle: ["104px", "84px", "112px", ...]   ← 设定值
thRect:  [58,      91,    121,      ...]   ← 实际值
                      ↑ 全被放大了
```

修法（两层都要）：

```css
/* ① CSS */
.nt-table.cols-custom .nt-th {
  min-width: 0 !important;
  max-width: none !important;
}
```

```js
// ② JS：进 B 模式时内联清一遍（CSS 里的没法删，A 模式还要用）
th.style.minWidth = '0';
th.style.maxWidth = 'none';
```

修好后两者严格相等：

```
thStyle: ["104px","84px","112px","112px","96px","116px","40px"]
thRect:  [104,    84,    112,    112,    96,    116,    40]
sumOfThStyle: 664 = tableRectW: 664
```

### 5.7 跨列单元格不能参与冻结

空表时「还没有流水，先在上面记一笔」是一个 `colspan=7` 的 `<td>`。
它同时命中了：

- `syncFrozen` 里 `tr.children[0]` → 写了 `style.left = '0px'`
- CSS 的 `.nt-cell:nth-child(1)` → `position: sticky`

跨列单元格加 `sticky + left` 后会被当成一个「冻结块」整行横向移动 —— 症状是**说不清道不明的乱跳**。

修法：

```js
if (td && td.colSpan === 1) td.style.left = left + 'px';   // 只给单列格写
```

```css
.nt-cell-span { position: static !important; left: auto !important; }
```

`renderEmpty` 给 `colspan > 1` 的格子自动加 `.nt-cell-span` 类。

### 5.8 横向滚动容器会抢走触摸手势

`.nt-tablewrap { overflow-x: auto }` 会让浏览器把水平触摸判成「滚动表格」。
拖手柄时**手柄在拖、内容也在滚**，两个动作叠加。

```css
.nt-tablewrap {
  overflow-x: auto;
  touch-action: pan-y;    /* 允许纵向滑，禁止横向手势被接管 */
}
```

再加一层运行时保险：

```js
// 拖动期间锁住容器的横向滚动
const wrap = tableEl.closest('.nt-tablewrap');
const prev = wrap.style.overflowX;
wrap.style.overflowX = 'hidden';
// 松手恢复
wrap.style.overflowX = prev;
```

### 5.9 拖动必须用 setPointerCapture（这是「时灵时不灵」和「其它也亮」的共同解）

单文件版的 `initColResize`（`personal/index.html` §18231）做法：

```js
grip.addEventListener('pointerdown', (e) => {
  grip.classList.add('dragging');
  try { grip.setPointerCapture(e.pointerId); } catch (err) {}   // ★

  grip.addEventListener('pointermove', onMove);      // ★ 绑在 grip 上
  grip.addEventListener('pointerup', onUp);
  grip.addEventListener('pointercancel', onUp);      // ★ 三个都要
});
```

**`setPointerCapture` 一次解决两个症状**：

| 症状 | 原因 | 捕获后 |
|---|---|---|
| 一下拖得动、一下拖不动 | 手指移出手柄后事件发给别的元素，拖动链断掉 | 事件全发给抓取者，手指移出也继续 |
| 按住一个手柄，其它也亮 | 手指扫过其它列，`:hover` 在每列上成立 | 其它元素收不到 `pointerover`，不 hover |

### 5.10 手柄线必须完全落在列内

```css
/* 错：跨到下一列 */
right: calc(-1 * var(--nt-handle-offset, 0px));   /* 默认 -3 → right: 3px */

/* 对：线在列内，命中区由 JS 在 th 右边缘判定 */
right: 0;
width: 1px;
pointer-events: none;
```

跨出去以后，按右键时 `event.target.closest('.nt-th')` 拿到的是**右边那一列**；
所以判定要按坐标扫描整行边界（§4.2）。但可视线和命中区**从右边缘左移 2px**，
且命中区只往左算 —— 不压在列线上，也不跨到右列。

**单文件版结论：手柄不能压在线上，左移 2px 最稳。**

### 5.11 拖动的宽度写入要用 rAF 合并

```js
let raf = 0;
const flush = () => { raf = 0; th.style.width = width + 'px'; applyCustomWidth(tableEl); syncFrozen(tableEl); };
const onMove = (e) => {
  width = ...;
  if (!raf) raf = requestAnimationFrame(flush);   // 每帧一次
};
```

每个 `pointermove` 都写样式 + 重算冻结 left，会让长表明显发滞（单文件版注释：1000 行的表会卡）。

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

## 六点五、输入框的提交时机（手机上最容易「改了又变回去」）

`change` 只在**失焦**时触发。隐藏一个正在编辑的 `<input>`（切 tab、切后台、
键盘收起）**不保证**触发它 —— 用户看到的新值会随下一次 render 被旧 state 顶掉。

设置页「简码」踩过（2026-11 用户报「修改不了」）：

- 输入停手 800ms 先静默落库一次（`updateAccount` + `saveNow`，**不重画**，
  焦点和光标都不动）；
- Enter（手机键盘「完成」）主动 `blur()`；
- 切 tab 前 `tabs.js` 把当前焦点 `blur()` 掉；页面 `visibility=hidden` 时也 blur；
- 重复 / 不合法的简码**不再静默 `render()` 还原**，页脚写明
  「已被『某节点』使用」或「要 1–5 位」；
- **重复简码从 v1.233 起允许**（用户 2026-11 决定）：照样保存，输入框标
  **暗红**（`--nt-code-dup`，与不合法的亮红 + 波浪线区分），页脚仍提示被谁占用；
  V7 的重复从 `error` 降为 `warn`，校验页只作提示、不再判失败；
- 末尾新增行只填了简码、没填名称：页脚提示先填名称，而不是让输入框
  看起来已经改了、切页后又消失。

> 这条同样适用于其它可编辑格：以后加输入框时，先问「手机键盘收起会不会失焦」。

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
| **手柄宽度** | `--nt-handle-w` | `14px` | 列宽手柄命中区宽度（透明层已移除，不占文字） |
| **手柄颜色** | `--nt-handle-color` | `#5f5878` | 中线颜色 |

### 7.3 列标行（表头）

| 键 | CSS 变量 | 默认 | 作用 |
|---|---|---|---|
| 列标行行高 | `--nt-th-h` | `26px` | 表头高度 |
| 列标行字号 | `--nt-th-font` | `12px` | 表头字号 |
| 列标行对齐 | `--nt-th-align-<col>` | 见下 | 每列对齐：`左/中/右` |

### 7.4 数据区

| 键 | CSS 变量 | 默认 | 作用 |
|---|---|---|---|
| 数据区行高 | `--nt-row-h` | `32px` | 每行高度 |
| 数据区字号 | `--nt-cell-font` | `14px` | 单元格文字 |
| 默认列宽 | `--nt-col-<key>` | 见下表 | 拖动后写回这里 |
| 对齐 | `--nt-align-<col>` | 见下 | 每列对齐 |

### 7.5 列宽变量全表

**每张表各有一套**，变量名 `--nt-col-<表>-<列>`（2026-10 起；此前是全局 `--nt-col-<key>`）：

| 表 | 参数键 | 变量前缀 | 默认 |
|---|---|---|---|
| 流水记录 | `流水记录/列宽` | `--nt-col-flow-*` | `44,84,112,112,96,160,40,40` |
| 6 大分类（6 张表） | `分类统计/列宽` | `--nt-col-stat-cat` | `72`（六张表共用；金额列由 CSS 均分，没有独立宽度） |
| 节点统计（6 张表） | `节点统计/列宽` | `--nt-col-node-cat` | `108`（节点名更长，默认比分类宽） |
| 分类查询 | `分类查询/列宽` | `--nt-col-catq-*` | 全 0 = 百分比铺满 |
| 流水查询 | `流水查询/列宽` | `--nt-col-query-*` | `44,0,0,0,0,0`（0 = 自适应） |
| 路径追踪 | `路径追踪/列宽` | `--nt-col-path-*` | `44,62,110,110,68,120`（不接受 0） |
| 固定开支 | `固定开支/列宽` | `--nt-col-plan-*` | `44,64,64,112,112,96,116,40` |
| 账户设置 | `账户设置/列宽` | `--nt-col-accounts-*` | `48,37,58,49,97,101,32,32`（2026-11-07 用户给定；期初列不吃这串值，它吃剩余） |

**0 的两种语义**（别混）：

- `query` / `catq` 的 0 = 真·自适应（`query` 写 `auto`，`catq` 写空值让 CSS 百分比兜底）；
- 存量 / 流量 2026-11 起**不再是 0**：默认就是上面那串 px，表格 `width:max-content`
  （列宽之和），拖过之后同样按 px 存。`toCssList` 对 `growByWidth` 表的 0 仍输出空值，
  给将来「默认铺满」的表留口子。

> 拖动时保存的是**整表**宽度（`ui/col-widths.js`）：进入自定义模式时所有列都已
> 固化成实际 px，只存被拖那一列会让其余列重开时回到默认，整表比例就变了。
>
> 列宽**没有** localStorage 镜像：镜像会在「参数已改、表头未重建」的窗口里压过参数，
> 面板点「恢复默认」后一重建表头旧宽度又回来。宽度只有一处真相 —— 参数。

### 7.6 默认对齐（`DEFAULT_COL_ALIGN`）

所有表头一律居中（用户 2026-10-29 指定），`--nt-th-align-<列>` 逐列覆盖。

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

### 分类-资产/负债/权益 · 5 列 · 不冻结

```
分类 期初 本期增加 本期减少 期末
```

### 分类-费用/收入/成本 · 4 列 · 不冻结

```
分类 本期支出/本期收入 本期退回 净额
```

### 分类查询 · 5 列 · 不冻结（中、右两栏各一份）

```
日期 转出 转入 金额 备注
```

> 6 张分组小表**各自一套列宽**（`--nt-col-fee-*` …），没有序号列（手机放不下）。
> 小表是每次重画新建的，建表时补拖动绑定（`ui/stats-group-tables.js`）。

### 汇总统计 · 10 列 · 冻结节点名称

```
节点名称 序号 类型 分类 转出金额 转入金额 当前余额 历史转出 历史转入 历史结余
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
- **删除按钮在第一格、第二行开头靠左**（`.nt-inst-del`，照单文件版）：
  绝对定位、不占列宽、不参与拖动；输入框左侧留 18px
- **对齐**（用户 2026-11 指定）：第一行节点名称左对齐；第二行「分期金额」右对齐；
  账单日 / 还款日居中；每月合计、本息总计与所有月份金额右对齐
  （表头上行的每月合计也右对齐）
- 前 3 列宽存 `localStorage.nt_inst_cw`，月份列宽存 `nt_inst_mw`；重画后分别由
  `ui/inst-layout.js` 与 CSS 变量 `--nt-inst-mw` 恢复
- 月份列由 `paintHead()` 按 `calcInstallmentMatrix` 的跨度动态生成
- `colgroup` 与表头**同步生成**
- **表头吸顶由整块 `<thead>` 负责**（两行是一个整体，见 §2.1），
  不给单个 `th` 写 `top`；首列横向冻结在 thead 内部用 `sticky left:0`，层级 2
- 月份列上限 `MAX_MONTHS = 120`（`core/installment-cells.js`）。超过上限时
  **保留最新的一头**：分期表最关心现在和以后要还多少，从最早月份开始截会把
  刚加的分期甩出窗口，整行月份变空（2026-11 用户实测「添加后没有具体分期」）
- 添加成功后 `inst-table.js` 会把新记录的首月列滚进视野 —— 否则新记录若从下个月
  开始，格子全在视口外，看起来仍然像「没有分期」

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

---

## 十一、流水表的单元格编辑（Excel 式，2026-11-09 重写）

> 背景：v1.493–v1.497 试过一版「选中层叠在输入框上」，v1.498 整体回退
> （提交原话：「Excel 单元格模式把流水表搞乱」）。v1.499 重写了选中/双击，
> v1.500 按用户要求补上**右下角调整大小手柄**和**长按五按钮菜单**，
> 并撤掉旧的四按钮框选条 —— 之前长按会同时弹两条。
> v1.501 把选中态输入框 `pointer-events:none`，长按不再弹系统菜单；
> v1.502 再进一步：**选中态由隐藏的 1px input 持焦点**，可见 input 从不 focus，
> 所以连「caret-color 不生效的浏览器会画光标」也一并解决；
> 只有双击进编辑才把焦点交给可见 input。

### 11.1 交互口径

| 动作 | 结果 |
|---|---|
| 单击格 | 选中：1px 主色内描边；**可见 input 不持焦点 → 不显示光标、不画文字选中框**；键盘由**屏幕外的 1px 隐藏 input** 持有（不复制旧值、不 `select()`）；右下角出现**调整大小手柄**（56×56 命中区、向格外伸 10px、10px 可见） |
| 直接打字 | **整格替换**（隐藏格是空的，第一次输入即新值）；退格 / 删除在隐藏格为空时直接清整格；回车填入；**不进入编辑态** |
| 再单击同一格 | 取消选中（340ms 后；双击窗口内算双击） |
| 双击 | 才进**编辑**：焦点交回可见 input，光标落在点下去的位置，可精确增删 |
| Enter / 键盘「下一个」 | 同一行往右（日期 → 转出 → 转入 → 金额 → 备注）；到备注后接**下一行的转出节点** |
| Tab / Shift+Tab | DOM 顺序的右 / 左一格，跳过只读行 |
| 点另一格 / 取消选中 | 先收尾上一格：简码解析成节点名、金额格式化；空行内容进开放录入区草稿 |
| 方向键 | 选中态移动格子；编辑态交给浏览器 |
| Esc | 编辑态 → 还原并退回选中态；再 Esc → 取消选中 |
| **拖右下角手柄** | 把选区扩成矩形（手机 / 鼠标都行）；手柄跟着新右下角走，横滚纵滚不离格；**松手若已是多格，自动弹菜单** |
| **点行号（序）** | 选中该行「日期..备注」并直接弹菜单；整行一个样式（日期不再单独描边），四边是选区最外圈的 **1px** 描边（和单格一样粗）、内部格线透明；框随格子滚动，不盖序冻结列、不留在别的页面；点其它格子取消行选、变成单格 |
| **开放录入区（空行）** | 内容按「第几个空行」存 `state.openRows`；**不建流水、不移动**；**金额一有值就补今天日期 + 预分配序号**（显示在序号列），但仍留在原位；失焦时金额再格式化成金额；重新进入仍在原位 |
| **切回流水记录表** | 只有**带金额**的开放行结算成正式流水（沿用预分配编号、落尾行）；没金额的继续留在原位 |
| **长按 480ms** | 单个格子：在该格上方弹唯一一条菜单：`剪切 / 复制 / 粘贴 / 清除 / 编辑`（多格已自动弹，不用再长按） |
| 菜单外任意处 | 收起菜单；点在表格外同时取消选区 |

### 11.2 实现约束（每条都对应一次实测故障）

**① 选中态必须由一个隐藏 input 持焦点（v1.502 的核心）。**
只要可见 input 持焦点，浏览器就一定会画光标；`caret-color: transparent`
在部分安卓 WebView 里不生效，用户看到的就是「单击进了编辑、光标在字前面闪」。
现在选中态焦点放在 `cell-proxy.js` 创建的 1px 隐藏 input 上：
可见 input 从不 focus → 光标、系统「粘贴/全选/翻译」菜单都无从出现；
键盘输入通过隐藏格的 `input` 事件镜像回可见格。双击才把焦点交回可见 input。
**v1.506**：隐藏格不复制旧值、不 `select()`，并放到屏幕外（`-200px`）——
安卓会把全选高亮 / 焦点框单独画在左上角，`opacity:0` 也挡不住。
整格替换改由「隐藏格是空的」自然实现；隐藏格为空时按退格/删除直接清整格。

**② 选中态的可见 input 仍然 `pointer-events: none`。**
双保险：手指长按命中 td 而不是 input，系统选字菜单不会弹；
双击进编辑（`.nt-cell-editing`）再恢复 `pointer-events: auto`。

**③ 键盘导航全部在 cell-edit，row-editor 不再管 Enter。**
隐藏格的 Enter / Tab / 方向键由 `cell-edit` 的 keydown 处理；
编辑态的 Enter / Tab / Esc 也在 `cell-edit`。移动前调 `leaveCell()`：
- 编辑态：真 `blur()`，row-editor 的 focusout 做账户解析 / 金额格式化；
- 选中态：派发**合成 focusout**（打 `__ntSynthetic` 标记）走同一套收尾。
`cell-edit` 自己的 focusout 看到 `__ntSynthetic` 或焦点在隐藏格上就直接忽略，
否则合成事件会把刚选中的下一格清掉。

**③补 换格（点另一格 / 取消选中 / 回车 / Tab）前必须 `leaveCell()`。**
选中态的可见 input 从不失焦，row-editor 的 focusout 收尾（简码 → 节点名、
金额格式化）不会自己发生。所以 `cell-edit` 在换格前合成一次
`focusout`（编辑态则直接 `blur()`）。不补这一步，用户输入简码后点另一格，
格子里会一直留着简码。

**③补二 开放录入区不再是「立即建单的草稿」（v1.506 / v1.507）。**
用户 2026-11-09：空行是计划性编排区，写了一半的内容要**留在原位、不编号、不移动**。
空行的五个字段按位置存进 `state.openRows`（`open-drafts.js` 安静保存，不进撤销栈）；
`row-editor` 的 focusout 只解析账户并补发一次 `input` 让草稿刷新，不再建单。
**v1.507 / v1.509**：金额**一有值**（input 阶段，不等失焦）就补今天日期 + 预分配序号
（`nextSeq` 与已有开放行序号取大 +1），写进草稿和序号格，但**仍然不移动**；
失焦时再把金额格式化成金额。把金额清空时序号跟着撤掉。
只有**带金额**的行在 `activate()`（切回流水记录表 / 从后台回来）时由
`open-rows.js` 结算成 transaction：**沿用预分配序号**、落到尾行；没金额的继续留在原位。
补发草稿刷新用的 `input` 事件打 `__ntDraftSync` 标记，`row-editor` 的输入处理器
看到就 return —— 否则点下一格收尾时会把上一格的候选气泡又弹出来（v1.506 的故障）。
`render-transactions` 的 `seedDrafts()` / `applyDraft()` 负责启动时把
`state.openRows`（含序号）灌回空行。

**④ 编辑态下的长按不弹我们的菜单。**
用户正在改文字，长按要留给系统选字；`cell-select` 的 pointerdown 里
`editor.isEditing()` 直接 return。

**⑤ 长按松手必须拦掉 touchend 的默认行为。**
不拦的话，松手那一刻浏览器会 focus 输入框 + 派 click：键盘弹出来盖住菜单，
click 还会把菜单/选区收掉。touchend 的 `{ passive: false }` + `preventDefault()`
实测能同时挡掉 focus 和 click；再在表格上用捕获阶段吞一次 click 兜底。

**⑥ 菜单 / 手柄之后选区还在、但键盘已收起：再点它应当是「继续输入」。**
`down.wasFocused` 快照决定「再点一次」是取消选中还是恢复输入；
只看 `wasSelected` 会把「菜单→点回同一格」误判成取消选中。

**⑦ 手柄要算内容坐标，不能算视口坐标。**
`.nt-tablewrap` 加 `position: relative`，手柄 `position: absolute`；
`left/top = 格子 rect - wrap rect + scrollLeft/scrollTop`。
这样横滚 / 纵滚 / 列宽变化后手柄仍贴着格子角。拖手柄时用
`elementsFromPoint` 逐层找 td（手柄自己也命中的话 `elementFromPoint` 拿不到格子），
并吃 `touchmove` 的默认行为，否则手指一动表格先滚了。

**⑦补 多格/整行选区只画最外圈 1px，不用浮层（v1.508）。**
四条边用 CSS 变量叠在 `.nt-range-sel` 的 `box-shadow` 上，角上的格子能同时拿到
横边 + 竖边；流水表内部格线透明、不画每格内圈，整块连续。
不再用 body 级的 fixed 描边（v1.506–v1.507 那版会跑到序冻结列上面、
切到负一屏节点设置页还留着、左右滚动时晃）。框随格子一起走。

**⑨ 切回流水记录表不重建整表（v1.508）。**
单元格编辑用 `patchRow` 就地改，顺手更新序号颜色、`renderedVer = getVersion()`；
切回时版本一致 → `render` 直接 early-return（只滚到尾部），不再为 250 行白重建。
开放区草稿的保存用 `setState(..., { quiet: true })`，只换 state、不抬 `dataVersion`。
开放区带金额的结算放到 `setTimeout(0)`：切页先画出来，下一帧再落尾行 + 重建。

**⑧ 禁用的菜单按钮必须 `pointer-events: none`。**
实测：点在置灰的「粘贴」上，事件穿透到菜单外 → 菜单的「点外面收起」和
cell-select 的「点外面清选区」一起触发，菜单和选区一起消失。

**⑨ 双击光标用 `document.caretPositionFromPoint`。**
Chrome / Edge 对 `<input>` 直接返回字符下标（实测 `offsetNode === input`）。
Safari / 老浏览器降级为 canvas 逐字量宽。
浏览器原生的双击会选词（`selectionStart` = 词首），不能拿它当光标位置。
行 hover 只给真鼠标：`@media (hover: hover) and (pointer: fine)`。

### 11.3 涉及文件

```
js/ui/cell-edit.js     选中 / 编辑 / 键盘（Enter/Tab/方向键/Esc）/ 隐藏格镜像 / 行号选行
js/ui/cell-proxy.js    屏幕外的 1px 隐藏键盘输入框（选中态持焦点）
js/ui/cell-nav.js      方向导航 / 下一行同列 / Tab 相邻格 / ensureVisible
js/ui/cell-geom.js     选区坐标 / 边界 / 可编辑格计数（cell-select 的纯几何）
js/ui/cell-caret.js    点击坐标 → input 字符下标（caretPositionFromPoint + 降级）
js/ui/cell-select.js   选区矩形 / 右下角手柄 / 长按菜单 / 剪切复制粘贴清除
js/ui/cell-menu.js     五按钮菜单的摆放与点外面收起
js/ui/cell-clip.js     格子 ↔ 矩阵（复制 / 清除 / 粘贴），流水/固定/分期共用
js/ui/cell-range.js    其它表（固定 / 分期 / 统计）的长按框选与四按钮条
js/ui/range-bar.js     四按钮条（只给非流水表）
js/ui/row-editor.js    输入解析 / 提交（Enter 导航与空行建单已移走）
js/ui/open-drafts.js   开放录入区草稿：按位置存 state.openRows、金额识别后补日期/序号
js/ui/open-rows.js     开放录入区结算：带金额的行在切回流水时沿用预分配序号转正
js/ui/suggest-popover.js  候选气泡按 visualViewport 避键盘
css/flow.css           行 hover 只给真鼠标；选中/锚点/pointer-events/隐藏格
css/range.css          手柄、五按钮菜单、整体描边、框选高亮
```

### 11.4 已知边界

- **开放录入区**（表格下方空行）的内容按「第几个空行」存进 `state.openRows`，
  不建流水、不移动；点另一格 / 回车 / Tab / 粘贴后仍在原位，重新进入也在。
  录入金额后立刻格式化成金额、补今天日期、预分配序号（序号列可见），但**仍然不移动**；
  切回流水记录表（或从后台回来）时，带金额的行才结算成正式流水，
  **沿用预分配序号**、落到尾行；没金额的行继续留在原位。
- 开放行不计入「共 N 笔 / 合计」，只计入「草稿 N 笔未入账」；带金额结算后
  按正常入账规则判断（两端齐全 + 金额 > 0 + 账户有类型才转正，否则仍是草稿）。
- 开放行的草稿保存是**安静**的（`setState(..., { silent: true })`）：不进撤销栈；
  结算本身是一条正常撤销记录，撤销后开放行会回到原位（`open-drafts.sync()` 重灌）。
- 剪切 / 清除已有行的 from/to 时，靠合成一次 `focusout` 让 row-editor
  解析空账户、把 `from_id/to_id` 清掉。
- 流水表不再有「框选批量删除行」：五按钮里没有删除行（用户只要这五个），
  单行删除仍走行尾 `×`。
- 双击进编辑依赖系统双击间隔（`click.detail`）；极慢的双击会退化成「选中 → 取消选中」。
- **编辑态**下长按仍会出现系统选字菜单（用户正在改文字，这是正常的）；
  选中态不会出现。
- 选中态的键盘靠隐藏格 `focus()` 打开；若有手机浏览器拒绝给 1px/透明 input
  键盘焦点，需要改成在 `pointerup`/`touchend` 里 focus（已实测 headless 焦点正确）。


## 十二、三表统一格子层（2026-11-09，v1.510）

- `excel-grid.js` 把 cell-edit + cell-select 合成一套，流水 / 简码设置 / 固定收支 / 分期共用。
- 设置页、固定页、分期页用 `nativeCommit: true`（离开时派发 change 由各页监听落库）、
  `enterTab: true`（回车当 Tab）、`pasteSingle: true`（这两页的结构性字段仍会重绘，批量粘只做一格）。
- 账户页：简码/名称/分类就地 patch，不再整表重绘；类型/序/期初仍重绘（会换分区/排序/期初流水）。
- 固定页：日/转出/转入/金额/备注就地 patch + 只更新合计；频率仍重绘；
  新行离开整行时由 `onLeaveRow` 调 `tr.__tryCreate()` 建规则。
- 分期页：名称/本金/利息/期数/首月/日/月份格用同一套；每次改会重算月份矩阵，仍重绘，
  但 Tab 后按「行 id + 字段」或「行 id + 月份 + part」找回下一格。
- 原生格：类型选择器（`data-grid="off"`）、新行的序、固定页的频率下拉保持原生。
- **批量粘贴**：`cell-select` 的 cut/clear/paste 外面 `beginBatch()`/`endBatch()`，
  各页 `render()` 开头 `deferRender(render)` 排队，粘完统一重绘一次。
  实测设置页复制「费用行 简码..分类」粘到「资产行」，会重绘的类型格和后面的分类格都生效。
- 分期表没有「行号」列（一条分期两行、按月铺开），行选/五按钮菜单用选区手柄；
  其余格子行为与另两表一致。
- 原生类型格点下去前先 `release()` 掉上一个选中格，不会留着旧内框。


### 12.1 行选 / 粘贴 / 重排时序（v1.512）

- 整行选中的底色用主题的 `--nt-cell-active`，四个主题各自不同（不再固定紫色）。
- 整行复制时**序号列留洞**：不复制序号，粘贴时跳过序号格（序号是自动归类生成的）。
- 节点设置页的序号格（含 U 区新行）点一下就是整行选中 + 五按钮菜单，不再依赖长按。
- 账户页类型/序/期初也不再立刻重排：粘贴/改完就地生效；切出设置页时在后台统一重排，
  下次切入直接显示（`settings.render` 的 version 检查，切回不重建）。
- 流水开放录入区：带金额的行在**切出流水页时**后台结算 + 隐藏重排；
  切回来只做 version 检查 + 滚动，不重建。
