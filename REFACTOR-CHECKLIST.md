# NT账本 · 多文件版 · 重构检查清单

> **目标**：把单文件版（`personal/index.html`，19,595 行）里被压在同一个文件里的五件事——
> **算钱 / 切时间 / 算图 / 适配设备 / 画界面**——物理拆开，每一层只认识下一层的输出。
>
> **进度**：`nt-v0.01` 已完成骨架落地（所有文件已建、接口已定、门禁已通），
> 各模块内部实现标 ☐ 待填。**下方每条都带验收标准**，没通过验收不算完成。
>
> 配套：建设公约见 [`CODE-RULES.md`](CODE-RULES.md)，架构总览见 [`nt/README.md`](nt/README.md)。

---

## 分层依赖图（上层可以依赖下层，反向绝对禁止）

```
第五层  UI 渲染（View & Render）        只拼字符串 / 挂 DOM
   ↑ 不许算钱、不许算角度
第四层  平台适配（Platform Adapter）    只输出设备特征
   ↑
第三层  Money Way 数学引擎（Graph）     纯几何计算，输出坐标/角度/depth
   ↑
第二层  时间轴引擎（Time-Travel）       切 past / current / future
   ↑
第一层  数据基座（Data Core）           算钱、校验、迁移、分期
```

**门禁会强制**：`core/`、`timeline/`、`graph/` 里出现 `window` / `document` /
`localStorage` / `navigator.userAgent` → 直接退出码 1，不许合并。

---

## 📦 第一层：数据基座（Data Core）— 纯数据，零依赖

> 目标：落实 [`DATA-MODEL.md`](personal/DATA-MODEL.md)，**算出真实的钱**，不管界面怎么画。

### ☐ 1. 期初迁移器 `js/core/opening-migrator.js`

- **任务**：把旧 `acc.opening` 转为 `__OPENING__` 虚拟账户的流水。
- **输入**：`accounts`（带 `opening` 字段）
- **输出**：`{ accounts, transactions }` —— 账户的 `opening` 归零，新增对应的期初流水行
- **验收**：跑完后**所有账户余额不变**，且 `state.transactions` 新增对应期初行。
- **幂等**：已迁移过的账户再跑一次，不重复生成（靠 `__OPENING__` 行是否已存在判断）。

### ☐ 2. 余额计算器 `js/core/balance-calculator.js`

- **任务**：**唯一**的 `Σ流水` 算法，彻底抛弃 `+ opening` 逻辑。
- **输入**：`(account, allTransactions, range?)`
- **输出**：`{ balance, mOut, mIn, hOut, hIn }`
- **验收**：传入账户和全量流水，输出精确余额；**代码里不许再出现 `acc.opening`**。
- **约束**：资产/费用类 = 借增贷减；负债/权益/收入类相反。

### ☐ 3. 分期推算器 `js/core/installment-engine.js`

- **任务**：按日期推算 `paidPeriods`，**不存盘**。
- **输入**：`(installment, targetDate)`
- **输出**：`{ paidPeriods, remainingPeriods, perPeriod, paidAmount, remainingAmount, nextDueDate }`
- **验收**：输入日期，返回当前已还期数、剩余期数，不受 UI 干扰；同一个输入跑两次结果一致。

### ☐ 4. 校验规则池 `js/core/validator.js`

- **任务**：执行 **V1~V6** 规则。
- **输出的形状**：`{ ok: boolean, issues: [{ code, level, message, ref }] }`
- **验收**：输入脏数据（断链、错期数）能**准确报错并指出是哪一笔**。

| 规则 | 内容 |
|---|---|
| V1 | 单边流水（缺转出或转入） |
| V2 | 金额 ≤ 0 或非数字 |
| V3 | 账户名在账户表里找不到（断链） |
| V4 | 转出 = 转入（自己转自己） |
| V5 | 日期非法 / 缺失 |
| V6 | 会计恒等式：资产 + 费用 − 负债 − 权益 − 收入 = 0 |

---

## ⏳ 第二层：时间轴引擎（Time-Travel）— 解决"过去/现在/未来"

> 目标：过滤和重组数据，为 UI 和图表提供**多维度视角**。

### ☐ 5. 时间状态机 `js/timeline/time-state.js`

- **任务**：按 `targetDate` 将流水切分为 `past`、`current`、`future` 三个数组。
- **难点**：**未来分期的虚拟还款事件在此层推算生成**，但**不改真实流水库**。
- **输入**：`(transactions, accounts, installments, targetDate)`
- **输出**：`{ past, current, future, virtual }`（`virtual` 单独一股，带 `isVirtual: true`）
- **验收**：`state.transactions` 的长度在调用前后**不变**（纯函数）。

---

## 🌊 第三层：Money Way 数学引擎（Graph）— 核心壁垒

> 目标：把 `mwDrawSvg` 里那 ~700 行的**算法**全抽出来，**不碰任何字符串拼接**。
> 参考实现：[`personal/PATH-CHART.md`](personal/PATH-CHART.md)。

### ☐ 6. 图数据切片器 `js/graph/mw-data-fetcher.js`

- **任务**：接收区间和流水，过滤 `__OPENING__`、按配置过滤内部转账、处理 Top N 账户折叠。
- **输出**：干净的**单笔流水列表**（保留单边流水，标 `empty` 端），供后续计算。
- **验收**：折叠后总额守恒（`Σ 原边 = Σ 折叠后边`，误差 < 0.005）。

### ☐ 7. 槽位角度计算器 `js/graph/mw-slot-calculator.js` ★核心

- **任务**：算 `N_UNITS = 笔数 × 2`，按「**分类 → 账户 → 时间**」排序，
  算出每个槽位的 `a1 / a2 / mid`，并合并出弧块 `blocks`。
- **输出**：带角度的纯数据（弧度，`START_ANG = -π/2`，分类间隙 `0.8°`）。
- **验收**：传入流水列表，输出带角度的 JSON 数组；`Σ(单位角) + Σ(间隙角) = 2π`。

### ☐ 8. 和弦路径与层级计算器 `js/graph/mw-path-calculator.js` ★核心

- **任务**：
  1. 根据槽位角度，算三次贝塞尔控制点坐标（`k = 0.34` 向圆心收缩）；
  2. 用 **BFS** 从费用端出发算出层级 `depth`，映射线宽 `[6, 4.8, 3.6, 2.4, 1.2]`。
- **输出**：只含坐标点、`depth`、颜色等**纯数据 JSON**。
- **验收**：输出里没有任何字符串拼接（不许出现 `<path`）。

### ☐ 9. 路径追溯器 `js/graph/path-tracer.js`

- **任务**：实现 **DFS**，点费用时向上游追溯。
- **输入**：`(transactions, startIndex)`
- **输出**：高亮链路的**流水 id 集合**（`Set<number>`）
- **验收**：输入起点，输出集合；环状转账不会死循环（有 `seen` 保护）。

---

## 📱 第四层：平台适配层（Platform Adapter）— 解决 UA 补丁地狱

### ☐ 10. 设备特征库 `js/platform/device-profile.js`

- **任务**：输出 `{ isIOS, isAndroid, isStandalone, safeAreaTop, safeAreaBottom, dpr, viewport }`。
- **约束**：**严禁写业务逻辑**；只读环境、只输出配置。

---

## 🎨 第五层：UI 渲染层（View & Render）— 只负责画出来

> 目标：只负责拼字符串或挂 DOM，**不许算钱，不许算角度**。

### ☐ 11. 模板库 `templates/templates.html`

- **任务**：密码锁屏、记一笔表单、**只读的流水行**（干掉每行 6 个 `<input>`）。
- **验收**：所有结构都在这一个文件里；`index.html` 只剩容器。

### ☐ 12. 流水渲染器 `js/ui/render-transactions.js`

- **任务**：消费 `time-state.js` 的输出，套用模板生成 DOM。
- **验收**：代码里**没有** `+`、`-`、`*`、`/` 参与金额运算（金额只用 `format.money()`）。

### ☐ 13. Money Way 纯 SVG 渲染器 `js/ui/mw-svg-renderer.js`

- **任务**：消费第三层算好的 JSON，用字符串拼 `<path>`（画环、画线、写文字），并处理拖拽缩放。
- **验收（硬性）**：代码里**绝对找不到 `Math.sin`、`Math.cos` 或任何角度计算公式**，
  全是 `item.a1` / `item.mid` 直接读，或 `y += height` 这类累加。

---

## 进度看板

| 层 | 模块 | 文件 | 骨架 | 实现 | 验收 |
|---|---|---|---|---|---|
| 1 | 期初迁移器 | `core/opening-migrator.js` | ✅ | ☐ | ☐ |
| 1 | 余额计算器 | `core/balance-calculator.js` | ✅ | ☐ | ☐ |
| 1 | 分期推算器 | `core/installment-engine.js` | ✅ | ☐ | ☐ |
| 1 | 校验规则池 | `core/validator.js` | ✅ | ☐ | ☐ |
| 2 | 时间状态机 | `timeline/time-state.js` | ✅ | ☐ | ☐ |
| 3 | 图数据切片器 | `graph/mw-data-fetcher.js` | ✅ | ☐ | ☐ |
| 3 | 槽位角度计算器 | `graph/mw-slot-calculator.js` | ✅ | ☐ | ☐ |
| 3 | 路径与层级计算器 | `graph/mw-path-calculator.js` | ✅ | ☐ | ☐ |
| 3 | 路径追溯器 | `graph/path-tracer.js` | ✅ | ☐ | ☐ |
| 4 | 设备特征库 | `platform/device-profile.js` | ✅ | ☐ | ☐ |
| 5 | 模板库 | `templates/templates.html` | ✅ | ☐ | ☐ |
| 5 | 流水渲染器 | `ui/render-transactions.js` | ✅ | ☐ | ☐ |
| 5 | SVG 渲染器 | `ui/mw-svg-renderer.js` | ✅ | ☐ | ☐ |

**图例**：✅ 完成 · ☐ 未开始

---

## 已完成的既有模块（nt-v0.01）

| 文件 | 作用 | 状态 |
|---|---|---|
| `core/state.js` | 不可变状态更新 | ✅ 实现 + 测试 |
| `core/stats.js` | 六桶聚合（将被 `balance-calculator` 收敛） | ✅ 实现 + 测试 |
| `core/format.js` | 金额 / 日期格式化 | ✅ 实现 + 测试 |
| `core/migrate.js` | 版本迁移（幂等） | ✅ 实现 + 测试 |
| `browser/store.js` | localStorage 读写 | ✅ 实现 |
| `ui/flow-model.js` | state → 渲染行 | ✅ 实现 |
| `ui/flow-view.js` | 模板克隆渲染 | ✅ 实现 |
| `app.js` | 装配 | ✅ 实现 |

---

## 每完成一项的固定动作

```powershell
node nt/tools/check-rules.mjs        # 公约门禁，任何一条不过就不能合并
node --test nt/tests/                # 纯函数测试必须全绿
```

**外加**：新模块的 `验收标准` 必须变成一条**可执行的断言**写进测试，
不能只是"我看了一眼觉得对"。
