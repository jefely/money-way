# 路径页 · 环状弦图（Money Way）

> ⚠️ **本文只记录单文件版（`personal/index.html`）的当前实现，不是设计规范。**
> 设计已升级，见 `nt/MONEYWAY-SPEC.md`。两处关键差异：
>
> | | 本文（旧实现） | 新规范（`nt/MONEYWAY-SPEC.md`） |
> |---|---|---|
> | 线宽 | 按 depth 取 `[6, 4.8, 3.6, 2.4, 1.2]` | **单位弧长 × 0.8 × 权重**（费用4 / 资产3 / 负债2 / 权益1） |
> | 颜色 | 由 `类型\|分类` 决定 | **只由统计分类决定**（颜色数 = 分类数） |
>
> 术语（账户类型 vs 统计分类）见 `nt/GLOSSARY.md`。

> 基于 v13.64。行号会漂，以函数名为准。

---

## 〇、它到底是什么

**一张单环和弦图（chord diagram），但不是按金额分段，而是按「流水笔数」分段。**

- 环上一共 `N = 笔数 × 2` 个细粒度单位（每笔流水在转出端、转入端各占一个）
- 每个统计分类之间空出 0.8° 的缝
- 同一账户的连续单位合并成一个**弧块**
- 每笔流水从「转出端单位的中点」拉一条三次贝塞尔到「转入端单位的中点」

所以：**环上的长短 = 该账户参与的笔数**，不是金额；线的多少与走向 = 账户之间的往来频率。

整张图是一坨 `<string>` 拼起来的 SVG，没有用任何图表库。

| 常量 | 值 | 含义 |
|---|---|---|
| `SIZE` | 1800 | SVG viewBox 边长（放大坐标，缩放后线更清晰） |
| `R_OUT` | 640 | 环外半径 |
| `THICK` | 44 | 环厚 |
| `R_IN` | 596 | 环内半径（= R_OUT − THICK） |
| `GAP_DEG` | 0.8 | 分类之间的固定缝隙（度） |
| `START_ANG` | `-π/2` | 起点 9 点钟 |
| `k` | 0.34 | 贝塞尔控制点向圆心收缩的比例 |
| `W_MID` | 2.4 | 默认线宽 |

---

## 一、入口：`renderMoneyWay(main, footer)` — index.html:9251

负责三件事，都不是画图本身：

1. **确定区间**：`mwRange` 为空时取「全部流水的最早 ~ 最晚日期」
   （早期用「本月」，导入去年的账就一片空白且无处可改，v13.x 修掉）
2. **过滤内部转账**：`mwShowInternal === false` 时剔掉「资产类 → 资产类」的边
3. **只留流量最大的 N 个账户**（`mwTopN = 12`），其余并成「其它」，并滤掉
   低于总额 **1.5%** 的弦 —— 否则账户一多，环上全是碎块、字糊成一团

```js
var draw = function () {
  var g = mwBuildGraph(mwRange.start, mwRange.end);
  if (!mwShowInternal) {
    edges = edges.filter(e => !(mwCatOf(e.from) === '资产类' && mwCatOf(e.to) === '资产类'));
  }
  // 只留 total 最大的 mwTopN 个，其余折进「其它」
  nodes.sort((a, b) => b.total - a.total);
  var top = Math.min(mwTopN, nodes.length);
  // …把落在 top 之外的端点替换成「其它」，两端都被折叠的自环直接丢弃…
  var minEdge = grandTotal * 0.015;          // 小于总额 1.5% 的弦不画
  newEdges = newEdges.filter(e => e.value >= minEdge);
  body.innerHTML = '';
  body.appendChild(mwDrawSvg(nodes, edges));
};
```

> 注意：`mwDrawSvg(nodes, edges)` 收到的 `nodes/edges` **其实没被用到**——它内部又按
> `mwRange` + `mwFilter` 重新取了一遍流水。这是历史遗留（早期是金额桑基图，后来
> 改成逐笔弦图），改的时候留意这个「参数是摆设」的事实。

---

## 二、核心：`mwDrawSvg(nodes, edges)` — index.html:9453

整个函数分六段。下面按顺序讲。

### ① 取数（保留单边流水）

```js
for (var ti = 0; ti < state.transactions.length; ti++) {
  var t = state.transactions[ti];
  var d = String(t.date || '');
  if (!d) continue;
  if (mwRange.start && d < mwRange.start) continue;
  if (mwRange.end && d > mwRange.end) continue;
  var amt = Number(t.amount) || 0;
  if (!amt) continue;
  var f = String(t.from || '').trim();
  var to = String(t.to || '').trim();
  if (!f && !to) continue;              // 两端都空才丢

  // 路径页自己的筛选（和查询页同一套：日期区间 / 转出 / 转入 / 金额 / 备注）
  if (mwFilter.date)   { /* qParseRange 区间比较 */ }
  if (mfFrom && f !== mfFrom) continue;
  if (mfTo   && to !== mfTo)  continue;
  // …

  txs.push({ i: ti, d: d, f: f, to: to, amt: amt, cf: cf, ct: ct, seq: t.seq || 0 });
}
```

**单边流水**（只填了转出或只填了转入）不丢弃：它仍占一个单位，只是那一端是「空接口」，
不画线。这让「环上单位数 = 笔数×2」这个等式不会因为脏数据而破。

### ② 单位系统（这是整张图的度量基础）

```js
var GAP_DEG = 0.8;                          // 每个分类之间固定 0.8°
var N_UNITS = txs.length * 2;               // 细粒度单位数：每笔占 2 个
var availDeg = 360 - groupList.length * GAP_DEG;
if (availDeg < 60) availDeg = 60;           // 分类特别多时兜底，避免单位角为负
var unitDeg = availDeg / Math.max(1, N_UNITS);
var unit   = unitDeg * Math.PI / 180;       // 单个单位的弧度
var gapRad = GAP_DEG * Math.PI / 180;
```

一句话：**先把「分类缝隙」扣掉，剩下的角度平均分成 2N 份。**

### ③ 排序与槽位分配

**分类顺序是硬编码的**，从 9 点钟顺时针：

```js
var CAT_ORDER = ['权益类', '负债类', '费用类', '资产类', '收入类', '其它'];
```

这样 9 点到 12 点之间是「收入类」，符合「上面收入、下面权益」的直觉。

每笔流水产出两个槽位，排序键 = `分类序号 → 账户名 → 流水索引`：

```js
var slots = [];
txs.forEach(function (x, i) {
  slots.push({ acc: x.f  || null, cat: x.cf, sub: x.f  ? subOf(x.f)  : '', txIdx: i, side: 'f', empty: !x.f  });
  slots.push({ acc: x.to || null, cat: x.ct, sub: x.to ? subOf(x.to) : '', txIdx: i, side: 't', empty: !x.to });
});

slots.sort(function (A, B) {
  var ka = A.empty ? 9999 : gRank[keyOf(A)];       // keyOf = 分类|子类
  var kb = B.empty ? 9999 : gRank[keyOf(B)];
  if (ka !== kb) return ka - kb;                    // 先按分类组
  if ((A.acc||'') !== (B.acc||'')) return (A.acc||'') < (B.acc||'') ? -1 : 1;   // 再按账户
  return A.txIdx - B.txIdx;                          // 同账户内按流水顺序
});
```

**空槽位排在最后**（`9999`），所以在环的末尾会有一小段「空接口」区域。

分配角度：每跨一个分类组就加一个 `gapRad`。

```js
var ang = START_ANG, prevKey = null;
slots.forEach(function (sl) {
  var k = keyOf(sl);
  if (prevKey !== null && k !== prevKey) ang += gapRad;
  sl.a1 = ang; sl.a2 = ang + unit; sl.mid = ang + unit / 2;
  ang += unit;
  prevKey = k;
});
```

### ④ 弧块（blocks）

把相邻且同账户的槽位合并：

```js
slots.forEach(function (sl) {
  if (!sl.acc) return;
  var last = blocks[blocks.length - 1];
  if (last && last.acc === sl.acc) { last.a2 = sl.a2; last.n++; }
  else blocks.push({ acc: sl.acc, cat: sl.cat, sub: sl.sub, a1: sl.a1, a2: sl.a2, n: 1 });
});
```

**注意「同账户可能不连续」**：如果同一账户既有转出又有转入，且中间夹了别的分类，
它会在环上出现两个块——这是按 `分类|子类` 排序的必然结果，不是 bug。

弧块的颜色 = 所属统计分类的颜色，用**黄金角**生成，保证相邻分类不同色：

```js
groupList.forEach(function (g, i) {
  groupColor[g.key] = 'hsl(' + ((i * 137.508) % 360).toFixed(0) + ', 60%, 56%)';
});
```

路径本身是标准的「环形扇区」：

```js
var dd = 'M x1 y1  A R_OUT R_OUT 0 large 1 x2 y2   L x3 y3   A R_IN R_IN 0 large 0 x4 y4  Z';
```

### ⑤ 连线（每笔一条）

从「转出端槽位中点」到「转入端槽位中点」，三次贝塞尔，控制点朝圆心收缩 `k = 0.34`：

```js
var p1 = pt(R_IN, sf.mid);
var p2 = pt(R_IN, st.mid);
var k = 0.34;
var c1 = [cx + (p1[0]-cx)*k, cy + (p1[1]-cy)*k];   // 控制点：沿半径缩到 34%
var c2 = [cx + (p2[0]-cx)*k, cy + (p2[1]-cy)*k];

parts.push('<path d="M p1 C c1, c2, p2" fill="none" stroke="' + colorOfAcc(x.to) + '" ... />');
```

- **颜色取「转入端」的分类色**（不是转出端）
- 单边流水（任一端 `empty`）**不画线**，但槽位已占

线宽分四档：

| 状态 | 线宽 | 不透明度 |
|---|---|---|
| 什么都没选 | 统一 `2.4` | `0.52` |
| 选中，且是「点中的那一条」 | `depth × 1.35` | `0.95` |
| 选中，且与选中项相关 | `depth × 0.8` | `0.55` |
| 选中，但无关 | `depth × 0.45` | `0.25` |

其中 `depth` 是**链路层级**（离费用端有多远），用 BFS 从费用类往外算：

```js
var DEPTH_W = [6, 4.8, 3.6, 2.4, 1.2];   // 0 级（费用类本身）~ 4 级及以上
```

费用类 = 0 级、直接给费用类打过钱的 = 1 级…… 越靠近支出线越粗。

### ⑥ 文字（外推 + 锥形引线）

字号受三重约束：

```js
var arcLen  = span * R_OUT;                        // 弧长
var byArc   = arcLen / Math.max(1, lb.length) * 1.05;   // 放得下这串字
var byThick = THICK * 0.58;                        // 不超过环厚
var baseFs  = Math.max(14, Math.min(26, byArc, byThick));
```

**放不下就走锥形引线**（`crowded = arcLen < textW * 1.5`）：

```
        文字
      ╱    ╲        ← 锥形引线（半宽 5px，长 50；连续两个极窄块时第二个加长到 120 错开）
    ╱        ╲
  [弧块]
```

文字沿半径旋转排布，上半圈 `start`、下半圈（`theta > 90 || theta < -90`）翻转成 `end` 并 `+180°`，保证不会倒着读。

### ⑦ 中心遮罩

```js
var R_MASK = Math.round(R_OUT * 2 / 3 / 2);   // 半径 = 环直径/3 的一半
parts.push('<circle ... r="R_MASK" fill="transparent" style="pointer-events:all;cursor:grab"/>');
```

盖住那些钻到圆心的线头，同时给「拖动平移」一个不会误触线与弧块的手柄。

---

## 三、交互

| 操作 | 效果 | 状态变量 |
|---|---|---|
| 点左栏一条流水 | 只看这一条 + 它的上游（`mwTraceUpstream`） | `mwChain`, `mwChainRoot` |
| 点弧块 | 点亮所有触及该账户的线 | `mwSelected` |
| 点「清空」 | 复位选中、筛选、缩放 | 全部归零 |
| 拖中心圆 | 平移 | `mwView.tx/ty` |
| 滚轮 / 捏合 | 缩放旋转 | `mwView.zoom/rot` |

**视图状态与选中状态是分开的**：点条目、点弧块都**不会**重置缩放与滚动，
只有「清空」按钮会。

---

## 四、改这张图时要知道的五个坑

1. **`nodes/edges` 参数是摆设**。`renderMoneyWay` 算完折叠逻辑传进去，`mwDrawSvg`
   却自己重新取数。想在图上加过滤，要改 `mwDrawSvg` 里那段，不是外面。

2. **单位数是「笔数×2」，不是账户数**。所以删掉一笔流水，整张环的角度分配都会变——
   这是设计使然（图表达的是往来频率），不是布局不稳。

3. **同一账户可能出现两个弧块**。因为排序键是 `分类|子类` 优先于账户名，
   一个账户如果跨了多个子类，会被切开。

4. **颜色只由「统计分类」决定**（`cat|sub`），不是账户。所以同子类的 10 个账户是同一个颜色，
   靠环上的位置和文字区分。

5. **`CAT_ORDER` 的顺序就是视觉顺序**。想调「哪类在上面」，改这个数组即可，
   但注意 `START_ANG` 是 9 点钟、顺时针走，改完要重新检查「上面收入、下面权益」这个直觉是否还成立。

---

## 五、函数索引

| 函数 | 行号 | 作用 |
|---|---|---|
| `renderMoneyWay` | 9251 | 页面入口：区间、折叠「其它」、左栏列表、列宽拖动 |
| `mwBuildGraph` | 9163 | 早期桑基图的取数（**当前未被 `mwDrawSvg` 使用**） |
| `mwDrawSvg` | 9453 | 画图主体（约 770 行，六段式） |
| `mwRingPath` | 9374 | 环形扇区路径生成（早期三层环用，现在弧块内联了同样逻辑） |
| `mwCatOf` | 9154 | 账户名 → 类型（资产类/负债类/…） |
| `mwTraceUpstream` | 10227 | 从一笔流水往上追上游 |
| `mwTraceChain` | 10255 | 链路追踪（点弧块用） |
| `mwChainOn` | 10286 | 判断某笔流水是否在链路内 |
| `mwEsc` | — | SVG/HTML 转义 |
