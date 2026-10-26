# 流水页代码地图

> 记录 `personal/index.html` 里「余额怎么算」「流水怎么渲染」这两件事的**当前实现**。
> 基于 v13.64（表格部分回退自 v13.41）。行号会随改动漂移，以函数名为准。
> 重构计划另见 [`TABLE-REFACTOR.md`](TABLE-REFACTOR.md)；数据契约见 [`DATA-MODEL.md`](DATA-MODEL.md)。

---

## 一、数据流总览

```
state.accounts[]       账户（cat/sub/code/name/opening/billDay/repayDay）
state.transactions[]   流水（date/from/to/amount/note/seq/…）

        │
        ├─ statsMap(range)      一次全表扫描 → Map<bucketKey, 6 个累计桶>
        │        │
        │        └─ computeStats(acc, range)
        │                 │
        │                 └─ { balance, mOut, mIn, hOut, hIn }
        │                          ↑ 汇总表 / 统计汇总 / 页脚都用它
        │
        └─ renderFlow()         按 seq 排序 → 分批铺 DOM
                 │
                 └─ makeFlowRow()   每行 6 个 <input>，输入即编辑
                          │
                          └─ bindFlowEvents()  事件全部委托在 tbody 上
```

---

## 二、计算余额

### 2.1 `statsMap(range)` —— index.html:13968

一次扫描，把所有账户的流水按「区间」切成三段累计。**六个桶**：

| 桶 | 含义 | 谁在用 |
|---|---|---|
| `tOut` / `tIn` | **到区间末为止**的累计（含区间之后的不算） | 算 `balance` |
| `pOut` / `pIn` | **区间内**的流出 / 流入 | 「转出」「转入」两列 |
| `hOut` / `hIn` | **区间之前**的流出 / 流入 | 「转出历史」「转入历史」两列 |

```js
function statsMap(range) {
  const start = (range && range.start) || '';
  const end = (range && range.end) || '9999-99-99';
  const key = start + '|' + end;
  if (_statsMemo.key === key && _statsMemo.map) return _statsMemo.map;   // 同区间复用
  const map = new Map();
  const bucket = k => {
    let v = map.get(k);
    if (!v) { v = { tOut: 0, tIn: 0, pOut: 0, pIn: 0, hOut: 0, hIn: 0 }; map.set(k, v); }
    return v;
  };
  const byName = new Map();
  for (const a of state.accounts) byName.set(a.name, 'id:' + a.id);
  for (const t of state.transactions) {
    const amt = Number(t.amount) || 0;
    const d = t.date || '';
    const rowKey = t.fromId ? 'id:' + t.fromId : (byName.get(t.from) || 'n:' + (t.from || ''));
    const inKey  = t.toId   ? 'id:' + t.toId   : (byName.get(t.to)   || 'n:' + (t.to   || ''));
    const afterRange  = d && d > end;
    const inRange     = d && d >= start && d <= end;
    const beforeRange = d && d < start;
    if (rowKey !== 'n:') {
      const v = bucket(rowKey);
      if (!afterRange) v.tOut += amt;
      if (inRange) v.pOut += amt; else if (beforeRange) v.hOut += amt;
    }
    if (inKey !== 'n:') {
      const v = bucket(inKey);
      if (!afterRange) v.tIn += amt;
      if (inRange) v.pIn += amt; else if (beforeRange) v.hIn += amt;
    }
  }
  _statsMemo = { key, map };
  return map;
}
```

**桶的 key**：优先用 `id:<账户id>`；流水里只存了账户名（没存 id）时退回 `n:<账户名>`，再用 `byName` 映射到 id。所以**改账户名会让旧流水的匹配走 name 分支**——`computeStats` 里 `map.get('id:…') || map.get('n:…')` 就是在兜这个底。

### 2.2 `computeStats(acc, range)` —— index.html:14004

```js
function computeStats(acc, range) {
  const map = statsMap(range);
  const v = map.get('id:' + acc.id) || map.get('n:' + acc.name)
          || { tOut: 0, tIn: 0, pOut: 0, pIn: 0, hOut: 0, hIn: 0 };
  const isDebit = (acc.cat === '资产类' || acc.cat === '费用类');
  const op = Number(acc.opening) || 0;
  const balance = isDebit ? op + v.tIn - v.tOut : op + v.tOut - v.tIn;
  return { balance, mOut: v.pOut, mIn: v.pIn, hOut: v.hOut, hIn: v.hIn };
}
```

**口径**（与 `DATA-MODEL.md` 的「账户性质决定加减」一致）：

| 账户性质 | 转入 | 转出 |
|---|---|---|
| 资产类 · 费用类（借增贷减） | `+` | `−` |
| 负债类 · 权益类 · 收入类 | `−` | `+` |

---

## 三、渲染流水列表

### 3.1 `renderFlow(main, footer)` —— index.html:14247

按顺序做五件事：

1. **工具栏**（`流水记录` + 添加 / 同步 / 导入 / 导出）
2. **表头**：`序 | 日期 | 转出账户 | 转入账户 | 金额 | 备注 | （行尾）`
3. **分批渲染**：`txs = state.transactions` 按 `seq` 升序，只铺前 `flowShown` 行
4. **空行**：仅当**全部数据都渲染完**时才铺 `FLOW_BLANK_ROWS` 行（否则空行会夹在数据和"加载更多"之间）
5. **加载更多**：`还有 N 笔没显示` 那一行，点击或滚到附近追加一批（`observeFlowMore`）

```js
function renderFlow(main, footer) {
  // 1. 工具栏
  const bar = document.createElement('div');
  bar.className = 'toolbar flow-bar';
  bar.innerHTML = `
    <span class="flow-title">流水记录</span>
    <button class="ghost" id="f-add" title="批量添加账户与流水（文本 / TXT）">添加</button>
    <button class="ghost" id="f-sync">同步</button>
    <button class="ghost" id="f-import" title="导入 Excel 或文本">导入</button>
    <button class="ghost" id="f-exp">导出</button>`;
  main.appendChild(bar);
  document.getElementById('f-add').onclick    = () => openImportTextDialog();
  document.getElementById('f-sync').onclick   = () => openSyncDialog();
  document.getElementById('f-exp').onclick    = () => openExportMenu();
  document.getElementById('f-import').onclick = () => openImportMenu();

  // 2. 表头
  const wrap = document.createElement('div');
  wrap.className = 'grid-wrap';
  const table = document.createElement('table');
  table.className = 'grid'; table.id = 'flow-table';
  table.innerHTML = `
    <thead><tr>
      <th class="col-seq">序</th>
      <th class="col-date">日期</th>
      <th class="col-from">转出账户</th>
      <th class="col-to">转入账户</th>
      <th class="col-amount">金额</th>
      <th class="col-note">备注</th>
      <th class="col-del"></th>
    </tr></thead><tbody></tbody>`;
  const tbody = table.querySelector('tbody');

  // 3. 排序 + 分批
  const txs = state.transactions.slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const shown = txs.slice(0, flowShown);
  const frag = document.createDocumentFragment();
  shown.forEach(t => frag.appendChild(makeFlowRow(t, 0, false)));

  // 4. 空行（只在全部渲染完时铺）
  if (flowShown >= txs.length) {
    for (let i = 0; i < FLOW_BLANK_ROWS; i++) frag.appendChild(makeFlowRow(blankFlowRow(), 0, true));
  }
  tbody.appendChild(frag);
  renumberFlowRows(tbody);
  shown.forEach(t => {
    const tr = tbody.querySelector('tr[data-id="' + t.id + '"]');
    if (tr) attachFixedCheckbox(tr);
  });

  // 5. 加载更多
  if (txs.length > flowShown) {
    const more = document.createElement('tr');
    more.className = 'flow-more';
    more.innerHTML = '<td colspan="7" class="flow-more-td">还有 ' + (txs.length - flowShown)
      + ' 笔没显示 · 已显示 ' + flowShown + ' / ' + txs.length + ' 笔 · <b>点击加载更多</b></td>';
    more.addEventListener('click', () => {
      if (_flowLoading) return;
      _flowLoading = true; _lastFlowLoad = Date.now();
      const td = more.querySelector('.flow-more-td');
      if (td) td.innerHTML = '正在加载…';
      requestAnimationFrame(() => setTimeout(() => {
        _flowLoading = false; ensureFlowBuffer(); observeFlowMore();
      }, 24));
    });
    tbody.appendChild(more);
  } else if (flowShown !== FLOW_BATCH && txs.length <= FLOW_BATCH) {
    flowShown = FLOW_BATCH;
  }

  wrap.appendChild(table);
  main.appendChild(wrap);
  initColResize(table, 'flow');
  bindFlowEvents(tbody);
  updateFlowFooter(footer);
  syncFlowTitleWidth();
  observeFlowMore();
  bindFlowScrollBuffer();
  ensureFlowBuffer();
}
```

### 3.2 `makeFlowRow(t, idx, isNew)` —— index.html:14478

每行 = 序号 + 5 个可编辑格 + 行尾（删除 × 与「登记为固定收支」勾选框）。

```js
function makeFlowRow(t, idx, isNew) {
  const tr = document.createElement('tr');
  tr.dataset.id = t.id;
  tr.dataset.new = isNew ? '1' : '0';

  const tdSeq = document.createElement('td');
  tdSeq.className = 'col-seq'; tdSeq.textContent = idx;
  tr.appendChild(tdSeq);

  ['date', 'from', 'to', 'amount', 'note'].forEach(field => {
    const td = document.createElement('td');
    td.className = 'col-' + field;
    const input = document.createElement('input');
    input.dataset.field = field;
    if (field === 'date') {
      input.type = 'text'; input.inputMode = 'numeric';
      input.value = t.date ? toYYMMDD(t.date) : '';      // 存 YYYY-MM-DD，显示 YYMMDD
    } else if (field === 'amount') {
      input.type = 'text'; input.inputMode = 'decimal';
      input.value = fmtMoneyOrBlank(t.amount);           // ¥1,400.00
      input.onfocus = function () { try { this.select(); } catch (e) {} };
    } else {
      input.type = 'text'; input.value = t[field] || '';
    }
    td.appendChild(input);
    tr.appendChild(td);
  });

  // 行尾：删除 × + 勾选框（空行也补不可见占位，保证和已有行对齐）
  const tdDel = document.createElement('td');
  tdDel.className = 'col-del';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'row-del'; btn.textContent = '×';
  btn.title = '删除这笔流水';
  if (isNew) {
    btn.style.setProperty('visibility', 'hidden', 'important');
    btn.tabIndex = -1;
  } else {
    btn.addEventListener('click', () => deleteFlowTx(t.id));
  }
  tdDel.appendChild(btn);
  if (isNew) {
    const ph = document.createElement('input');
    ph.type = 'checkbox'; ph.className = 'fixed-chk';
    ph.style.setProperty('visibility', 'hidden', 'important');
    ph.disabled = true; ph.tabIndex = -1;
    tdDel.appendChild(ph);
  }
  tr.appendChild(tdDel);
  return tr;
}
```

### 3.3 相关函数索引

| 函数 | 作用 |
|---|---|
| `bindFlowEvents(tbody)` | 输入监听、粘贴、删除、金额格式化——**全部事件委托在 tbody** |
| `renumberFlowRows(tbody)` | 重排序号（增删后调用） |
| `blankFlowRow()` | 造一个空行对象（`id` 为空、`dataset.new = '1'`） |
| `attachFixedCheckbox(tr)` | 给已有行补「登记为固定收支」勾选框 |
| `ensureFlowBuffer()` / `bindFlowScrollBuffer()` / `observeFlowMore()` | 分批加载的三个触发口 |
| `updateFlowFooter(footer)` | 页脚「共 N 笔 · 合计」 |
| `syncFlowTitleWidth()` | 工具栏标题与表格对齐 |

---

## 四、三个结构性问题（改的时候会碰到）

### 4.1 没有「计划段」

`DATA-MODEL.md` 第五节定义了流水表三段式（期初 / 当前 / 计划），但代码里：

- `status: 'planned'` —— **0 处**
- `settleDue()` —— **0 处**
- `renderFlow` 只是把 `txs` 按 `seq` 排一遍渲染，**没有分段**

也就是说第三段（规则演算出的计划流水）**尚未实现**。文档开头那句"设计已定稿，工程未动工"指的就是这块。

> 注意区分：代码里的 `opening`（52 处）几乎全是**账户的期初余额**，不是流水表的「期初行」。

### 4.2 余额依赖缓存，任何变动都要失效

`statsMap` 用 `_statsMemo` 缓存，key 是 `start|end`。**只按区间做 key，不看数据本身**——所以：

- 新增 / 删除 / 修改一笔流水 → 必须让 `_statsMemo` 失效，否则余额是旧的
- 改账户的 `opening` / `cat` → 同理

改这块时要搜一遍所有写 `state.transactions` 和 `state.accounts` 的地方，确认都清了缓存。

### 4.3 每行 6 个 `<input>`，所以才有分批

流水行不是只读文本，而是「输入框即编辑」。`FLOW_BATCH` / `flowShown` / 空行补位 / 滚到附近自动追加，全是为了消化这个成本。

**如果将来改成「点一下才进入编辑」**（只读行 + 点击变输入框），这几套分批逻辑可以整体删掉——这是流水页最值得做的一次简化，但属于 `TABLE-REFACTOR.md` 之外的另一件事。
