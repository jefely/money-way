# 表格引擎重构计划

> 状态：**未开工**。当前线上是 v13.64，表格部分回退自 v13.41（可用的老版本）。
> 这份文件记录「为什么要重写」「重写成什么样」「怎么验证」，避免下次又从对话里重新推一遍。
> 2026-10 用户已确认：**只重写表格引擎，账务/加密/导入导出/弹窗/锁屏一律不动**。

---

## 一、为什么

表格的「列宽 / 冻结列 / 折叠」三件事，散在 6 个函数里，每个都直接写同一个 `colWidths`，
彼此覆盖。2026-10 的五轮补丁（v13.52 → v13.54 → v13.56 → v13.57 → v13.58）就是它在咬人：

| 轮次 | 改了什么 | 结果 |
|---|---|---|
| v13.52 | 给统计表加 `nowrap` + 固定行高 + `width:auto; min-width:100%` | 行高稳了，但 `min-width` 把表格宽锁死 → 拖动失效 |
| v13.54 | 撤回 `width:auto`；`th` 放开 `overflow` | 拖动恢复，但折叠按钮曾被他自己的 `overflow:hidden` 裁掉 |
| v13.56 | `ensureColgroup` 跳过 `.folded` 的 th | 修了 col/th 数量错配 |
| v13.57 | 表格宽改成「实际写入的列宽之和」 | 修了「拖一条每列都动」 |
| v13.58 | 折叠列改 `display:none` + 列宽按列名双向合并 | 又引入新的宽度错乱 |

用户原话：「两边都乱了，乱到我无法描述了」。

### 具体的坏味道（都在 `personal/index.html`）

1. **同一份状态 6 个写者**
   `initColResize`（拖拽）/ `applyWidths`（写 colgroup）/ `ensureColgroup`（建 col）/
   `applySummarySticky`（冻结 left）/ `syncStatsFreezeLeft`（统计表冻结 left）/ `applySummaryFold`（折叠）——
   全都直接改 `colWidths` 或 `colgroup`。

2. **列宽存了两套且会互相覆盖**
   `colWidths[key]` 是**按索引的数组**，`colWByClass[key]` 是**按列名**。
   列数一变（折叠/展开），索引数组就对不上 → 回落默认值 → 用户调好的宽度丢失。
   `summary` 还额外有 `summaryBaseWidths()` 一趟「折叠只改视图」的特殊逻辑，与上面两套三方打架。

3. **表格总宽 ≠ 列宽之和**
   `applyWidths` 曾用「传入数组的总和」写 `table.style.width`，但实际写进 `<colgroup>` 的可能更少
   （折叠列的 `<col>` 数量对不上）。差额被 `table-layout: fixed` 按比例摊给所有列 ——
   表现为「拖一列，每列都动」。

4. **折叠用两种手段混搭**
   设置页用「宽度写 0」（列还在，占最小宽度），统计表用 `display:none`（列没了，`<col>` 数量要跟着变）。
   两种都得单独处理，`ensureColgroup` / `applyWidths` 到处是分支。

5. **`td` 忘了 `position: sticky`**
   `applySummarySticky` 一直给 `tbody td` 写 `left`，但 `td` 默认 `position: static`，`left` 无效 ——
   只有表头（`th` 天生 sticky）看起来是冻住的，数据行照样滑走。
   （v13.64 才补上，属于这个设计的第 6 个坑）

6. **拖拽时每帧重算冻结偏移**
   `pointermove` 的 rAF 里调 `applySummarySticky()` —— 设置页 80 行 × 15 列 ≈ 1200 次 DOM 写入/帧，
   主线程直接卡死，手感是「拖不动」。v13.60 的补丁里已删掉这行，重写时必须设计进去。

---

## 二、重写成什么样

一个 `TableLayout` 控制器，一张表一个实例。**唯一事实来源是按列名存的宽度**。

```js
TableLayout.init(table, opts)
// opts: { key, foldCols: ['col-cat','col-sub'], freezeCols: ['col-seq','col-code'] }

TableLayout.fold(on)        // 折叠：把 foldCols 设 display:none，重建 colgroup
TableLayout.freeze()        // 冻结：按可见列表头实测宽度累加，写 left
TableLayout.apply(px)       // 写 colgroup + 表格宽 = 可见列宽之和
TableLayout.snapshot()      // 把当前可见列宽按列名记下来（唯一持久化入口）
```

对外只暴露这些。**`colWidths`（按索引数组）彻底废弃**，持久化只保留一份：

```js
localStorage['flow_colw_byclass_v2'] = {
  summary:  { 'col-seq': 52, 'col-code': 73, 'col-name': 127, ... },
  statsSum: { 'col-seq': 52, 'col-name': 150, ... },
  flow:     { 'col-seq': 50, ... },
}
```

按列名存**天然不受列数变化影响**，折叠/展开/增删列都不需要「另一套 key」，
也就不需要 `summaryFold` / `statsSumFold` / `summaryBaseWidths` 这些东西。

---

## 三、三条不变量（写完直接量，不靠肉眼）

| # | 不变量 | 怎么验 |
|---|---|---|
| 1 | **表格宽 = 可见列宽之和** | `table.getBoundingClientRect().width === sum(col.style.width)` |
| 2 | **拖一列只有那一列变** | 拖前列宽数组，拖后数组，只允许一个下标变化 |
| 3 | **折叠/展开前后，每列宽度按列名不变** | 折叠前后各读一次 `{class: width}`，比对 |

外加两条已有的回归：

| # | 不变量 | 怎么验 |
|---|---|---|
| 4 | 冻结列横滑时偏移恒定 | `scrollLeft` 从 0 改到 200，冻结列 `rect.left` 不变 |
| 5 | 数据行也真的冻住 | `tbody td` 的 `getComputedStyle().position === 'sticky'` |

验证脚本已经有一半：`_tools/mw_table_width.py`（不变量 1）、
`_tools/mw_summary_two_cols.py`（不变量 4/5）、`_tools/mw_stats_drag.py`（不变量 2 的雏形）。

---

## 四、分步计划（每步可回滚、可验证）

1. **抽 `TableLayout` 骨架**：接管 `ensureColgroup` + `applyWidths`，
   对外行为与现状一致（先不动折叠/冻结）。跑不变量 1。
2. **宽度持久化切到按列名**（`flow_colw_byclass_v2`）。跑不变量 3。
   老存档读一次迁移过来，迁移后删掉旧 key。
3. **折叠交给 `TableLayout.fold()`**，统一用 `display:none`。
   删掉 `summaryFold` / `statsSumFold` / `summaryBaseWidths` / `applySummaryFold`。
4. **冻结交给 `TableLayout.freeze()`**：只量可见列的 `th`，累加写 `left`，
   并把 `position: sticky` 一起加上（表头和数据行都要）。**拖拽期间不调用**，只在 `onUp` 调一次。
5. **删掉所有历史覆盖**：`width:0` 折叠、按索引的 `colWidths`、
   `html body table.grid { width: !important }` 之类与列宽相关的 `!important`。

每步一个提交，**每步都要在 390×844 手机视口 + 桌面视口各验一遍**。

---

## 五、禁区（重写时别再做这些）

- ❌ 用 `width: 0` 折叠列 —— `table-layout: fixed` 下浏览器仍给最小宽度，剩余空间会被重分配
- ❌ 用按索引的数组存列宽 —— 列数一变全错位
- ❌ `table.style.width` 用「传入数组之和」而不是「实际写进 `<col>` 的和」
- ❌ 给同一个元素同时留两套宽度来源（`colWidths` + `colWByClass` + `summaryBaseWidths`）
- ❌ 在 `pointermove` 的 rAF 里遍历全表重算 `left`
- ❌ 靠 `!important` 叠规则解决层叠冲突 —— 这个文件里已经有 5 处历史覆盖在互相打架：
  `208`（`input { border:none !important }`）、`7828`（`backdrop-filter: none !important`）、
  `7547`（`table.grid { width }`）、`5330`（两套 z-index）、`4525/4784`（两版弹窗头）

---

## 六、和「只回退不重写」的关系

2026-10 的处置：**先回退到 v13.41 的表格代码**（`v13.61`），再把 v13.42–60 里
与表格无关的 UI 修复逐项找回来（`v13.62`），之后只做小修（`v13.63` 冻结最左两列、
`v13.64` 补 `td` 的 `position: sticky`）。

也就是说：**现在线上跑的是旧表格引擎，能用但有已知缺陷**（列宽记忆跨折叠会丢、
统计表没有冻结、拖拽时略滞）。重写什么时候做，等能连续验证的时候再开工。
