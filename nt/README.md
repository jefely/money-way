# NT账本 · 多文件版（nt-v0.03）

> 与单文件版 `personal/index.html` **并列存在、互不干扰**。
> 新功能一律写在这里；旧版只修致命 bug（公约 1.4）。
> 建设规则见仓库根目录 [`CODE-RULES.md`](../CODE-RULES.md)。

- **当前版本**：`nt-v0.03`
- **数据版本**：`SCHEMA_VERSION = 2`
- **本版主题**：把 v13.66 的 **7 个 tab 落成单页壳**（一次解锁、切换不刷新），
  并把共享组件抽成一套（工具条 / 胶囊子 tab / 表格 / 弹窗），每个页面只填自己那一列。

---

## 一、这一版做了什么

| 能力 | 状态 |
|---|---|
| **单页 7-tab 壳**（流水 / 统计 / 查询 / 路径 / 固定 / 设置 / 校验） | ✅ 切换不刷新、一次解锁 |
| 流水：行内编辑 + 简码 + 防抖加密写盘 | ✅ |
| 统计：分类 / 汇总，区间 / 年份 / 月份 / 全部 | ✅ |
| 查询：三段独立查询表（模板克隆，结构同构） | ✅ |
| 固定：固定收支表 + 分期占位 | ✅ 表结构 · ☐ 分期矩阵 |
| 设置：账户列表（类型分组 + 期初合计）+ 配平 / 主题 / 重置 | ✅ 账户列表 · ☐ 密码 / 配置 / 布局 |
| 校验：账本说明 / 账本校验（V1–V7）/ 赞助感谢 | ✅ |
| 路径：环网图在独立页打开（引擎与渲染已完成） | ✅ 链接 · ☐ 收进壳 |
| 零知识加密（PBKDF2 150k → AES-GCM 256 + IndexedDB） | ✅ |
| 纯函数测试（Node） | ✅ 134 条 |
| 公约自动检查 | ✅ |

**下一版**：同步 / 导入导出弹窗、分期矩阵、查询「频率」列、账户就地编辑、路径图收进单页。

---

## 硬约定：UI 调整必须先用探针量

改任何 CSS / 布局之前，先量出**实际像素**，改完再量一次确认。

```powershell
node nt/tools/probe.mjs http://127.0.0.1:8082/nt/index.html "document.querySelector('.目标').getBoundingClientRect().left"
```

- 探针会起临时 headless Chrome（独立 profile、空账本、自动设密码），执行表达式后打印 JSON；
- **不许靠猜**，也不许改完让用户肉眼验证——先出数字，再改，再出数字；
- 理由：多次「改了没效果」都是实际值与假设不符（checkbox 实际 13px、空 actions 占 18px、分组 margin 10px 等）。

---

## 二、目录结构

```
nt/
├── index.html                    单页壳：header + 7-tab + 7 个 .nt-view + footer
├── text.html                     流水文本整页编辑器（从流水页「添加 / 导入」进入）
├── manifest.json · sw.js         PWA（CACHE_NAME 必须与 js/core/version.js 的 APP_VER 相等）
├── css/
│   ├── theme.css                 双主题变量
│   ├── base.css                  重置 + 排版
│   ├── layout.css                页头 / 主区 / 页脚
│   ├── flow.css                  表单 / 按钮 / 表格底座 / 校验
│   ├── modal.css · gate.css      统一弹窗 / 锁屏
│   ├── suggest.css · import.css  候选气泡 / 导入编辑器
│   ├── shell.css                 单页壳：7-tab / 胶囊 / 工具条 / 表格容器 / 列宽
│   ├── query.css                 查询三栏
│   ├── validate.css              校验卡片 + 文本块
│   ├── plan.css                  固定收支 + 分期矩阵
│   └── settings.css              账户列表
├── templates/templates.html      所有 <template>（流水行 / 统计行 / 查询面板 / 账户行 …）
├── js/
│   ├── app.js                    入口：门禁 → state → 索引 → 7 视图装配 → tab 路由
│   ├── views/                    ── 页面装配（只接线，不算钱）
│   │   ├── flow.js               流水
│   │   ├── stats.js              统计（分类 / 汇总）
│   │   ├── query.js              查询（A / B / C）
│   │   ├── plan.js               固定收支 + 分期
│   │   ├── settings.js           账户列表 + 六个功能
│   │   ├── validate.js           校验三卡
│   │   └── path.js               路径占位（下一版收进图表）
│   ├── core/                     ── 第一层：数据基座（纯数据，零依赖）
│   │   ├── schema.js             类型 / 简码 / 工厂 / 期初账户
│   │   ├── state-store.js        不可变更新 + 期初迁移
│   │   ├── balance-calculator.js 唯一 Σ流水 余额算法
│   │   ├── ledger-stats.js       统计：单账户 / 分类聚合 / 汇总排序
│   │   ├── query-engine.js       查询过滤
│   │   ├── validator.js          V1–V7
│   │   ├── installment-engine.js 分期推算
│   │   ├── scheduler-engine.js   计划流水生成
│   │   ├── crypto-engine.js      PBKDF2 / AES-GCM
│   │   ├── auth-manager.js       唯一持钥处
│   │   └── migrate · format · stats · validate · account-index · account-resolver …
│   ├── timeline/                  ── 第二层：时间轴（切 past / current / future）
│   ├── graph/                     ── 第三层：Money Way 数学引擎（纯几何）
│   ├── platform/                  ── 第四层：设备特征
│   ├── browser/                   db / idb（唯一允许碰存储的地方）
│   └── ui/                        ── 第五层：UI 渲染（只拼 DOM）
│       ├── tabs.js                7-tab 路由
│       ├── table.js               建表头 / 填行 / 空状态（所有表格共用）
│       ├── modal.js · gate.js     统一弹窗 / 锁屏
│       ├── row-editor.js · suggest-popover.js
│       ├── flow-model.js · render-transactions.js
│       └── theme-manager.js · account-actions.js · …
├── tools/check-rules.mjs          公约门禁
└── tests/                         134 条纯函数测试
```

**分层铁律**：`core/` `timeline/` `graph/` 不许碰浏览器 API（门禁强制）；
`views/` 只消费 `ctx`（state / index / save / footer），不直接碰存储；
`ui/` 只管 DOM，不算钱。

---

## 三、怎么跑

```powershell
# 打开界面（file:// 也能跑，但要 PWA 缓存体检就用本地服务）
python -m http.server 8080 --directory money-way

# 纯函数测试
node --test nt/tests/*.test.mjs

# 公约检查（提交前必跑）
node nt/tools/check-rules.mjs
```

> 本机 Node 24 对 `node --test nt/tests/` 的目录参数不识别，请用
> `node --test nt/tests/*.test.mjs`（PowerShell 下先 `Get-ChildItem` 展开）。

---

## 四、这一版守住了哪些条款

| 条款 | 怎么守住的 |
|---|---|
| 1.1 无内联事件 | 全部 `addEventListener`；表格操作用事件委托 |
| 1.2 无内联样式 | 动态显示一律走类名，没有一处 `style="` |
| 1.3 无深层 div | 最深 3 层；能不用 div 就用 `header/main/section/article/table` |
| 2.1 语义化 | `<header>` `<nav>` `<main>` `<section>` `<table>` `<dl>` `<form>` |
| 2.2 模板复用 | 流水行、统计行、查询面板、账户行全是 `<template>`，JS 只 `cloneNode` + 填 `textContent` |
| 2.3 模板不写业务 | 所有数字由 `core/` 算好，视图只填字符串 |
| 2.4 无障碍 | 每个输入都有 `<label for>` 或 `aria-label`；装饰空格用 `nt-visually-hidden` |
| 3.1 文件 ≤ 300 行 | 最大文件约 280 行，其余 40–250 行 |
| 3.2 单向流动 | `core/state-store.js` 全部返回新对象，测试里断言了「原状态不变」 |
| 3.3 依赖隔离 | `core/` 零 DOM/存储引用（门禁会扫） |
| 3.4 无魔法字符串 | 类名集中在 `CLASS` 常量；CSS 全部 `nt-` 前缀；无层级选择器 |
| 4.1 迁移幂等 | `migrate()` 有版本号、可重复执行，测试覆盖「跑两次结果一致」 |
| 4.4 缓存版本隔离 | `sw.js` 的 `CACHE_NAME = 'nt-v0.03'` |

---

## 五、改动前先看这三条

1. **加功能前先想「放哪层」**：能算的放 `core/`（纯函数 + 测试），能复用的结构放 `<template>`，
   DOM 操作放 `ui/` 或 `views/`，只有装配写 `app.js`。
2. **`core/` 里写 `document` 会直接被 `check-rules.mjs` 拦下**，不是约定，是门禁。
3. **`sw.js` 的 `CACHE_NAME` 必须跟版本号一起改**，否则用户会拿到新 HTML + 旧 JS。

---

## 六、文档索引

| 文件 | 管什么 |
|---|---|
| [GLOSSARY.md](GLOSSARY.md) | **术语**：账户类型 vs 统计分类（最容易混的一条） |
| [UI-SPEC.md](UI-SPEC.md) | **页面与组件拆分清单**：7 个 tab 的列标、冻结列、弹窗、交互 |
| [MONEYWAY-SPEC.md](MONEYWAY-SPEC.md) | **路径图设计**：线宽权重、颜色绑定、单位角公式、反序溯源 |
| [TESTING-NOTES.md](TESTING-NOTES.md) | **探针的坑**：transition / blob import / hidden 三处误判 |
| [REFACTOR-CHECKLIST.md](../REFACTOR-CHECKLIST.md) | 16 个模块的进度与验收标准 |
| [CODE-RULES.md](../CODE-RULES.md) | 建设公约（门禁强制） |

---

## 七、版本记录

| 版本 | 内容 |
|---|---|
| `nt-v0.01` | 骨架落地：流水录入 / 列表 / 删除 / 校验 / 迁移 / 测试 / 门禁 |
| `nt-v0.02` | 零知识加密（PBKDF2→AES-GCM + IndexedDB）、ID 存储框架（存 ID / 看名字 / 算类型）、简码体系（O(1) 索引 + 候选气泡 + V7）、计划引擎（固定 + 分期整合）、Money Way 数学引擎、双主题、NtModal |
| `nt-v0.03` | **单页 7-tab 壳**：流水 / 统计 / 查询 / 路径 / 固定 / 设置 / 校验，一次解锁、切换不刷新；新增 `views/` 装配层与 `ui/table.js` 表格助手；统计（分类/汇总，区间/年份/月份）、查询（三段同构表）、校验（V1–V7 三卡）、设置（类型分组账户表）、固定收支表落地；`state.scheduled` 正式进模型；SW 修复并注册 |
