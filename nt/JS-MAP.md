# NT账本 · JS → 界面位置 映射

> 本表由 `nt/tools/js-map.mjs` 从每个文件头第一行的 `// 界面：…` **生成**，不要手改。
> 改界面位置就改文件头，然后 `node nt/tools/js-map.mjs --write`。
> `（无界面）` 表示纯逻辑，被其他模块调用，不直接对应某个 DOM 区域。

| JS 文件 | 对应界面位置 |
|---|---|
| `app.js` | 单页壳入口：门禁 → state → 7 视图装配 → tab 路由 |
| `browser/alias-store.js` | （无界面）软件级别名表的落盘 |
| `browser/db.js` | （无界面）IndexedDB 数据库封装 |
| `browser/idb.js` | （无界面）IndexedDB 打开 |
| `browser/thanks-sign.js` | 感谢墙签名（Ed25519，Web Crypto） |
| `core/account-config.js` | （未标注界面）账户配置（纯函数） |
| `core/account-index.js` | （无界面）账户索引 |
| `core/account-match.js` | （无界面）新账户名 → 类型 / 分类 |
| `core/account-merge.js` | 节点合并（把待归类关键字并进真实节点） |
| `core/account-order.js` | （未标注界面）数据基座：账户的分区、序号与排序（纯函数，无浏览器 API） |
| `core/account-resolver.js` | （无界面）账户名/简码解析 |
| `core/alias-table.js` | 别名表（说法 → 规范节点名） |
| `core/auth-manager.js` | （无界面）主密码校验/修改 |
| `core/backup-file.js` | （无界面）加密备份文件格式 |
| `core/backup-reminder.js` | （无界面）备份提醒判定 |
| `core/balance-calculator.js` | （无界面）余额计算 |
| `core/bill-apply.js` | （无界面）账单导入落库：补账户 → 写流水 → 判重 |
| `core/bill-match.js` | （无界面）账单账户匹配：支付方式 → 我的账户，商户/分类 → 对方账户 |
| `core/bill-parse.js` | 三家账单（支付宝 / 微信支付 / 招商银行）的识别与解析 |
| `core/bill-plan.js` | （无界面）账单 → 导入计划：方向、账户、日期过滤、备注线索 |
| `core/calc-engine.js` | （无界面）计算引擎：余额 / 双式恒等 / 实物成本台账 |
| `core/category-query.js` | 分类查询（纯函数） |
| `core/color.js` | （无界面）颜色转换 |
| `core/crypto-engine.js` | （无界面）PBKDF2 + AES-GCM |
| `core/csv.js` | CSV 解析（纯函数，Node 可跑） |
| `core/date-query.js` | 日期筛选框的解析（纯函数，Node 可跑） |
| `core/draft-book.js` | （无界面）草稿入账与短语映射 |
| `core/event-engine.js` | （无界面）事件引擎：节点 / 事件 / 双极性连线（事实层） |
| `core/export-text.js` | 导出为纯文本（.txt 模板 / .csv） |
| `core/flow-text.js` | （无界面）账本文本 ↔ state |
| `core/format.js` | （无界面）金额/日期格式化 |
| `core/import-apply.js` | （无界面）导入落库 |
| `core/import-dedupe.js` | （无界面）账单导入判重 |
| `core/import-parser.js` | （无界面）账本文本解析 |
| `core/import-table.js` | 导入 Excel / CSV / 账单（纯逻辑，Node 可跑） |
| `core/installment-cells.js` | 分期的「每期手填」矩阵（纯函数，Node 可跑） |
| `core/installment-engine.js` | （无界面）分期引擎 |
| `core/keyword-dict.js` | 关键字词表（**有序 + 分区**：越靠前越能精确具象对象） |
| `core/keyword-engine.js` | 关键字引擎（把一条流水压成手机上看得下的短串） |
| `core/ledger-adapter.js` | （无界面）旧账本 → 事件模型的单向投影（只读） |
| `core/ledger-file.js` | （未标注界面）账本文件（纯函数） |
| `core/ledger-stats.js` | （无界面）账本统计 |
| `core/ledgers.js` | （无界面）多账本 create/switch/rename/remove |
| `core/lexicon.js` | （无界面）渐进式记账词库 |
| `core/lifevein-model.js` | LifeVein 页（时间流里的泡） |
| `core/lz-file.js` | .lz 快照文件（跨设备同步码）的解析与还原（纯函数，Node 可跑） |
| `core/meta.js` | （未标注界面）项目地址（常量） |
| `core/migrate.js` | （无界面）旧数据迁移 |
| `core/mw-settings.js` | （无界面）环图参数 SCHEMA + 默认值 |
| `core/node-relations.js` | 节点上下级（一棵由用户自己确立的树） |
| `core/note-stats.js` | 备注统计（关键字 → 金额，再按备注类型分组合计） |
| `core/opening-migrator.js` | （无界面）期初迁移 |
| `core/opening-tx.js` | 期初流水的方向 |
| `core/phrase-entry.js` | （无界面）一句话入账 |
| `core/phrase-parser.js` | （无界面）一句话解析 |
| `core/phrase-slots.js` | 一句话 → 六大元素（转出 / 转入 / 节点类型 / 节点分类 / 备注分类 / 备注关键字） |
| `core/pinyin.js` | 汉字 → 拼音首字母（纯函数） |
| `core/plan-occurrence.js` | （无界面）计划发生：确认到今天 / 作废一期 |
| `core/qr-baked.js` | 内嵌的赞助收款码 |
| `core/qr-encode.js` | （未标注界面）QR 编码入口（纯函数） |
| `core/qr-matrix.js` | （未标注界面）QR 矩阵构造（纯函数） |
| `core/qr-rs.js` | （未标注界面）QR 里用到的有限域与纠错（纯函数） |
| `core/query-engine.js` | （无界面）查询引擎 |
| `core/reset-book.js` | （无界面）重置账户但保留流水 |
| `core/scheduler-engine.js` | （无界面）排程引擎 |
| `core/schema.js` | （无界面）数据结构定义 |
| `core/settings-schema.js` | （无界面）界面参数 SCHEMA 与分组 |
| `core/settings.js` | （无界面）界面参数 SCHEMA + 主题默认值 |
| `core/state-store.js` | （无界面）state 增删改 |
| `core/stats-panels.js` | （无界面）统计口径：分类汇总 / 节点汇总共用的「六类 × 4 列」 |
| `core/stats.js` | （无界面）统计计算 |
| `core/sync-code.js` | （未标注界面）跨设备同步码与二维码载荷（纯函数） |
| `core/sync-merge.js` | （未标注界面）合并远端记录（纯函数） |
| `core/sync-window.js` | （无界面）同步窗口自适应：一张码能装多少天就装多少天 |
| `core/table-cols.js` | （无界面）每张表各自的列与默认列宽 |
| `core/table-fit.js` | （无界面）列宽压缩与拖动上限的纯计算 |
| `core/undo-stack.js` | （无界面）有上限的撤销 / 重做栈 |
| `core/validate.js` | （无界面）账本校验 V1–V7 |
| `core/validator.js` | （无界面）校验工具 |
| `core/vault-cas.js` | （无界面）写盘冲突判定 |
| `core/vault-rekey.js` | （无界面）更换主密码：验旧密码 → 换新盐 → 整份重新加密 |
| `core/version.js` | （未标注界面）版本与更新判定（纯函数） |
| `core/xlsx-template-read.js` | 把「单文件版备份模板」的 4 张表读回 state（纯函数，Node 可跑） |
| `core/xlsx-template.js` | 按「单文件版备份模板」组装 / 解析 4 张表（纯函数，Node 可跑） |
| `core/xlsx-write.js` | xlsx 的 XML 生成（纯函数，Node 可跑） |
| `core/xlsx-xml.js` | xlsx 的 XML 解析（纯函数，Node 可跑） |
| `graph/mw-chord-shape.js` | 路径 tab → 连线几何（变宽线 / 漏斗形） |
| `graph/mw-data-fetcher.js` | （无界面）路径图数据抓取 |
| `graph/mw-depth.js` | （无界面）环图的链路层级 |
| `graph/mw-layers.js` | 路径 tab → 三层套娃（类型 / 分类 / 实体）的几何与配色 |
| `graph/mw-path-calculator.js` | （无界面）路径计算 |
| `graph/mw-slot-calculator.js` | （无界面）槽位计算 |
| `graph/path-tracer.js` | （无界面）路径追踪 |
| `platform/device-profile.js` | （无界面）设备指纹 |
| `text-app.js` | 文本整页编辑器（text.html） |
| `timeline/time-state.js` | （无界面）时间分段 |
| `ui/account-actions.js` | 设置 tab → 账户列表操作 |
| `ui/account-config.js` | 账户配置导入导出 |
| `ui/account-dialog.js` | 设置 tab → 新增/编辑账户弹窗 |
| `ui/account-new.js` | 设置页 —— 新增账户行 / 期初 |
| `ui/account-table.js` | 账户表（表格内直接编辑） |
| `ui/add-dialog.js` | 流水工具条「添加/导入」→ 添加账本·流水 弹窗 |
| `ui/alias-batch.js` | 备注区的「批量归类」——一张列表，打勾 + 目标节点，一次合并完 |
| `ui/apply-settings.js` | 全局：把界面参数写成 CSS 变量（主题/列宽） |
| `ui/backup-guard.js` | 主屏幕备份提醒 |
| `ui/cat-suggest.js` | 统计 → 分类查询的候选气泡（输入首字母弹出分类） |
| `ui/cell-caret.js` | 点击坐标 → 输入框里的字符下标（双击定位光标） |
| `ui/cell-clip.js` | 单元格剪贴板（复制 / 剪切 / 清除 / 粘贴） |
| `ui/cell-edit.js` | 流水表的单元格选中 / 编辑（Excel 式） |
| `ui/cell-geom.js` | 流水表的格子几何（给 cell-select 用） |
| `ui/cell-menu.js` | 单元格长按菜单（剪切 / 复制 / 粘贴 / 清除 / 编辑） |
| `ui/cell-nav.js` | 流水表格子的方向导航 / 留出可视区 |
| `ui/cell-outline.js` | 多格选区的整体描边 |
| `ui/cell-proxy.js` | 选中态的隐藏键盘输入框 |
| `ui/cell-range.js` | 单元格区域框选（长按起手 → 拖动框选 → 复制 / 粘贴 / 删除行） |
| `ui/cell-select.js` | 流水表的选区（Excel 式：锚点 + 右下角手柄 + 长按菜单） |
| `ui/chart-gestures.js` | 环网图的手势（拖动 / 缩放 / 平移 / 旋转） |
| `ui/chart-tip.js` | 路径 tab → 悬停提示 |
| `ui/checks-view.js` | 校验 tab → 账本校验区 |
| `ui/col-save.js` | 把某张表某列的宽度存进「用户设置」 |
| `ui/col-widths.js` | 列宽持久化（拖动 → 参数 → CSS 变量） |
| `ui/color-picker.js` | 界面参数浮层 → 取色器 |
| `ui/composer.js` | 流水 tab → 一句话输入条 |
| `ui/datalists.js` | 共用的 datalist（类型候选） |
| `ui/debug-panel.js` | ?debug=1 → 界面参数浮层 |
| `ui/debug-pip.js` | ?debug=1 → 界面参数独立窗口（画中画） |
| `ui/debug-themes.js` | ?debug=1 → 界面参数 1/2/3/4 主题按钮 |
| `ui/export-dialog.js` | 导出对话框（.lz / .xlsx / .txt / .csv） |
| `ui/file-io.js` | （未标注界面）本地文件读写（UI 层） |
| `ui/fixed-table.js` | 固定收支表（表格内直接交互） |
| `ui/flow-ends.js` | 流水格里的名字 → 节点 |
| `ui/flow-model.js` | （无界面）流水视图模型 |
| `ui/flow-shell.js` | 流水 ⇄ 账本设置 的横向切换 |
| `ui/fly-in.js` | 流水 tab → 入账飞入 |
| `ui/gate.js` | 锁屏 / 首次设密码 |
| `ui/global-undo.js` | 全局撤销 / 重做的动作与快捷键 |
| `ui/import-backup.js` | 备份文件读取（.lz 快照 / 加密备份 / 整本 Excel 备份） |
| `ui/import-bill.js` | 导入预览里的「账单」面板（起始日期 + 六元素统计） |
| `ui/import-dialog.js` | 导入 Excel / CSV / 账单 |
| `ui/import-hub.js` | 流水工具条「导入」→ 一个窗口、一个输入框 |
| `ui/import-map.js` | 导入 → 手动指定列 |
| `ui/import-source.js` | 导入源识别（文件 / 粘贴文本 → 账单 / 通用表 / 备份 / 流水文本） |
| `ui/inst-add.js` | 分期表上方的「新增」表单 |
| `ui/inst-blanks.js` | 分期表后面的固定空行（纯占位） |
| `ui/inst-layout.js` | 分期表的列宽记忆 / 新增定位 |
| `ui/inst-range.js` | 分期表上方的「月份范围」工具条 |
| `ui/inst-table.js` | 分期表（表格内直接交互） |
| `ui/layout-text.js` | 布局文本导出/导入 |
| `ui/locate-tx.js` | 从校验跳到出问题的那一笔 |
| `ui/modal.js` | 全局 → 统一弹窗（<dialog>） |
| `ui/mw-params.js` | 全局：环图参数（CSS 变量 → 数字） |
| `ui/mw-svg-renderer.js` | 路径 tab / path.html → SVG 渲染 |
| `ui/node-relations.js` | 节点关系（上下级配置表） |
| `ui/note-popover.js` | 流水 / 查询 → 长备注 |
| `ui/note-stats.js` | 备注统计（关键字 → 金额，再按备注类型分两级） |
| `ui/note-table.js` | 设置页的备注区（独立于账户的 A/B 区） |
| `ui/open-drafts.js` | 开放录入区草稿的持久化 |
| `ui/open-rows.js` | 开放录入区的结算 |
| `ui/path-debug.js` | 路径 tab → 追踪链诊断（页脚序号串 + ?debug=1 时的控制台明细） |
| `ui/path-filter.js` | 路径页左栏（流水表）的筛选 |
| `ui/path-flow-table.js` | 路径页左栏的流水查询表 |
| `ui/path-legend.js` | 路径 tab → 图例 |
| `ui/path-view.js` | 路径 tab |
| `ui/phrase-preview.js` | 流水 tab → 一句话输入的六元素预览 |
| `ui/plan-links.js` | 流水与固定收支期次的联动 |
| `ui/plan-rows.js` | 流水 tab → 未来行的确认 / 作废 |
| `ui/pwa.js` | PWA 注册 |
| `ui/qr-canvas.js` | （未标注界面）把 QR 矩阵画到 canvas（UI 层） |
| `ui/range-bar.js` | 单元格框选的工具条 |
| `ui/render-transactions.js` | 流水 tab → 表格 tbody（分批追加，照单文件版） |
| `ui/reset-actions.js` | 重置整本账（节点模板弹窗里的危险动作） |
| `ui/reset-dialog.js` | 节点模板弹窗里的「重置」区 |
| `ui/review-tip.js` | 设置页 → 新增序号气泡 |
| `ui/row-editor.js` | 流水 tab → 行内编辑 / 新增行 |
| `ui/share-block.js` | 二维码分享区块 |
| `ui/share-file.js` | 导出加密备份文件 |
| `ui/stat-fit.js` | 统计小表的字号自适应 |
| `ui/stat-order.js` | 统计小表的自定义顺序（把某一张往上挪一位） |
| `ui/stat-resize.js` | 统计小表专用的列宽拖动（只有第 1 列可拖） |
| `ui/stats-category.js` | 统计 tab → 左栏六类表 + 右侧「详情」 |
| `ui/stats-group-tables.js` | 统计页的六类小表（分类汇总与节点汇总共用同一套构建器） |
| `ui/stats-split.js` | 统计页 —— 左栏（6 大分类）与右侧查询区之间的分界条 |
| `ui/stats-swipe.js` | 统计页 —— 手机左右滑动在四个页面间循环 |
| `ui/suggest-popover.js` | 流水 tab / 查询 tab → 账户候选气泡 |
| `ui/sync-dialog.js` | （未标注界面）同步弹窗（UI 层） |
| `ui/sync-wheel.js` | 同步弹窗里的滚轮（日 / 年月共用） |
| `ui/tab-guard.js` | （无界面）其它窗口保存通知 |
| `ui/table-layout.js` | 表格冻结列 + 列宽拖动 |
| `ui/table-parts.js` | 表格里重复出现的零件 |
| `ui/table.js` | 统计 / 查询 / 固定 / 设置 → 通用表格渲染 |
| `ui/tabs.js` | 顶部 7 个 tab 切换 |
| `ui/thanks-wall.js` | 校验页「赞助感谢」—— 远程加密的感谢墙 |
| `ui/theme-manager.js` | 全局 → 主题切换（1/2/3/4） |
| `ui/type-picker.js` | 轻量选择浮层（代替原生 select 的弹层） |
| `ui/undo-bar.js` | 删除后的撤销条 |
| `ui/update-check.js` | （未标注界面）版本更新（UI 层） |
| `ui/width-fit.js` | 节点设置 / 流水记录 的宽度预算 |
| `ui/xlsx-read.js` | xlsx 读取（ZIP 展开） |
| `ui/xlsx-write.js` | xlsx 打包（ZIP 写入） |
| `views/flow.js` | 流水 tab |
| `views/lifevein.js` | LifeVein tab（时间流里的泡 · Canvas 渲染） |
| `views/path.js` | 路径 tab |
| `views/plan.js` | 固定 tab |
| `views/query.js` | 查询 tab |
| `views/settings.js` | 设置 tab |
| `views/stats.js` | 统计 tab |
| `views/validate.js` | 校验 tab |
