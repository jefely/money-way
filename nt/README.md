# NT账本 · 多文件版（nt-v0.01）

> 与单文件版 `personal/index.html` **并列存在、互不干扰**。
> 新功能一律写在这里；旧版只修致命 bug（公约 1.4）。
> 建设规则见仓库根目录 [`CODE-RULES.md`](../CODE-RULES.md)。

- **当前版本**：`nt-v0.01`
- **数据版本**：`STATE_VERSION = 1`
- **改动范围**：只做「流水页」的最小可运行骨架，用来验证架构，不追求功能齐全

---

## 一、这一版做了什么

| 能力 | 状态 |
|---|---|
| 记一笔（日期 / 转出 / 转入 / 金额 / 备注） | ✅ |
| 流水列表（模板克隆渲染） | ✅ |
| 删除一笔 | ✅ |
| 本地持久化（localStorage） | ✅ |
| 两条校验（完整性 / 会计恒等式） | ✅ |
| 数据迁移（带版本、幂等） | ✅ |
| 纯函数测试（Node） | ✅ 15 条 |
| 公约自动检查 | ✅ |

**没做**（下一版）：加密、同步、导入导出、统计页、分期、路径图、设置页。

---

## 二、目录结构（五层）

> 完整检查清单与逐项验收标准见仓库根目录 [`REFACTOR-CHECKLIST.md`](../REFACTOR-CHECKLIST.md)。
> 标 ☐ 的是已建骨架、待填实现。

```
nt/
├── index.html                    语义化容器（不含模板、不含内联事件/样式）
├── manifest.json
├── sw.js                         CACHE_NAME = nt-v0.01
├── css/
│   ├── base.css                  变量 + 重置 + 排版
│   ├── layout.css                页头 / 主区 / 面板 / 页脚
│   └── flow.css                  表单 / 表格 / 校验
├── templates/
│   └── templates.html            ☐11 模板库（流水行 / 空状态 / 记一笔 / 锁屏）
├── js/
│   ├── app.js                    入口：装配 state → view → events
│   │
│   ├── core/                     ── 第一层：数据基座（纯数据，零依赖）
│   │   ├── opening-migrator.js   ☐1 期初迁移器
│   │   ├── balance-calculator.js ☐2 余额计算器（唯一 Σ流水）
│   │   ├── installment-engine.js ☐3 分期推算器（不存盘）
│   │   ├── validator.js          ☐4 校验规则池（V1~V6）
│   │   ├── state.js              ✅ 不可变更新
│   │   ├── stats.js              ✅ 六桶聚合
│   │   ├── validate.js           ✅ 两条校验
│   │   ├── migrate.js            ✅ 版本迁移（幂等）
│   │   └── format.js             ✅ 金额 / 日期格式化
│   │
│   ├── timeline/                 ── 第二层：时间轴引擎
│   │   └── time-state.js         ☐5 past / current / future 切分
│   │
│   ├── graph/                    ── 第三层：Money Way 数学引擎（纯几何）
│   │   ├── mw-data-fetcher.js    ☐6 图数据切片（区间 / 折叠 TopN / 1.5% 阈值）
│   │   ├── mw-slot-calculator.js ☐7 槽位角度 ★核心
│   │   ├── mw-path-calculator.js ☐8 贝塞尔 + BFS 层级 ★核心
│   │   └── path-tracer.js        ☐9 DFS 路径追溯
│   │
│   ├── platform/                 ── 第四层：平台适配
│   │   └── device-profile.js     ☐10 设备特征（只读环境）
│   │
│   ├── browser/
│   │   └── store.js              ✅ localStorage 读写（唯一允许碰存储的地方）
│   │
│   └── ui/                       ── 第五层：UI 渲染（只拼字符串 / 挂 DOM）
│       ├── render-transactions.js ☐12 流水渲染器 + 模板注入
│       ├── mw-svg-renderer.js     ☐13 纯 SVG 渲染（禁止 Math.sin / Math.cos）
│       ├── flow-model.js          ✅ state → 渲染行
│       └── (flow-view.js 已并入 render-transactions.js)
│
├── tools/
│   └── check-rules.mjs           公约门禁（不过 → 退出码 1）
└── tests/
    └── core.test.mjs             纯函数测试
```

**分层铁律**：`core/` `timeline/` `graph/` 不许 import `browser/` 或 `ui/`；
`ui/` 不许 import `browser/`；只有 `app.js` 同时认识三层。
门禁会扫「纯计算层出现 `window`/`document`/`localStorage`」并直接判失败。

---

## 三、怎么跑

```powershell
# 打开界面（file:// 也能跑，但要 PWA 缓存体检就用本地服务）
python -m http.server 8080 --directory money-way

# 纯函数测试
node --test nt/tests/

# 公约检查（提交前必跑）
node nt/tools/check-rules.mjs
```

---

## 四、这一版守住了哪些条款

| 条款 | 怎么守住的 |
|---|---|
| 1.1 无内联事件 | 全部 `addEventListener`；列表删除用事件委托 |
| 1.2 无内联样式 | 动态显示一律走类名，没有一处 `style="` |
| 1.3 无深层 div | 最深 3 层；能不用 div 就用 `header/main/section/dl/table` |
| 2.1 语义化 | `<header>` `<main>` `<section>` `<table>` `<dl>` `<form>` `<label>` |
| 2.2 模板复用 | 流水行 + 空状态都是 `<template>`，JS 只 `cloneNode` + 填 `textContent` |
| 2.3 模板不写业务 | 所有数字由 `core/` 算好，视图只填字符串 |
| 2.4 无障碍 | 每个输入都有 `<label for>`；删除按钮有 `aria-label`；装饰空格用 `nt-visually-hidden` |
| 3.1 文件 ≤ 300 行 | 最大的 `app.js` 约 150 行，其余 40–130 行 |
| 3.2 单向流动 | `core/state.js` 全部返回新对象，测试里断言了「原状态不变」 |
| 3.3 依赖隔离 | `core/` 五个文件零 DOM/存储引用（`check-rules.mjs` 会扫） |
| 3.4 无魔法字符串 | 类名集中在 `flow-view.js` 的 `CLASS`；CSS 全部 `nt-` 前缀；无层级选择器 |
| 4.1 迁移幂等 | `migrate()` 有版本号、可重复执行，测试覆盖「跑两次结果一致」 |
| 4.4 缓存版本隔离 | `sw.js` 的 `CACHE_NAME = 'nt-v0.01'` |

---

## 五、改动前先看这三条

1. **加功能前先想「放哪层」**：能算的放 `core/`（纯函数 + 测试），能复用的结构放 `<template>`，
   DOM 操作放 `ui/`，只有装配写 `app.js`。
2. **`core/` 里写 `document` 会直接被 `check-rules.mjs` 拦下**，不是约定，是门禁。
3. **`sw.js` 的 `CACHE_NAME` 必须跟版本号一起改**，否则用户会拿到新 HTML + 旧 JS。

---

## 六、版本记录

| 版本 | 内容 |
|---|---|
| `nt-v0.01` | 骨架落地：流水录入 / 列表 / 删除 / 校验 / 迁移 / 测试 / 门禁 |
