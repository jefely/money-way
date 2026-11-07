# 感谢墙：改名单 → 发布

> 一句话：**管理页生成 → 覆盖 `thanks.enc.json` → 跑 `publish-thanks.mjs --commit`**。

---

## 一次性准备（只做一次）

1. 打开管理页：
   - 本地：`node nt/tools/serve.mjs 8080` → `http://127.0.0.1:8080/nt/thanks-admin.html`
   - 线上：`https://jefely.github.io/money-way/nt/thanks-admin.html`
2. **③** 设口令 → 「生成新密钥对」
3. **③** 下载 `thanks-key.enc.json` → **自己保存**（网盘/U 盘，**不要提交仓库**）
4. **③** 复制公钥 → 贴进 `nt/js/ui/thanks-wall.js` 的 `const PUB_KEY = {...};`
5. **①** 上传收款码 → 「生成 qr-baked.js」→ 覆盖 `nt/js/core/qr-baked.js`
6. 提交这一次改动

之后每次改名单都不需要碰代码。

---

## 每次改名单

1. 打开管理页（**任何电脑**都行，只要带上私钥文件）
2. **③** 「选择密钥文件」→ 选 `thanks-key.enc.json` → 输口令 → 「解锁私钥」
3. **①** 勾上「已内嵌，远程不再存收款码」（体积从 400KB 降到 10KB）
4. **④** 「从仓库载入当前名单」← 拿到当前值当起点，**别跳过**
5. **②** 编辑（一行一个名字；`|` 手动断行）
6. **④** 「加密并生成」→ 「下载 thanks.enc.json」
7. 覆盖 `D:\myproject\money-way\nt\thanks.enc.json`

---

## 发布

```powershell
cd D:\myproject\money-way

# 先检查（不提交、不改版本）
node nt/tools/publish-thanks.mjs

# 通过后正式发布（验签 → 升版本 → 公约 → 提交 → 推送）
node nt/tools/publish-thanks.mjs --commit
```

脚本会做四件事，任何一步失败就停下：

| 步骤 | 检查什么 |
|---|---|
| 1. 校验签名 | `thanks.enc.json` 的 `sig` 能否用代码里的 `PUB_KEY` 验过 |
| 2. 升版本 | `version.js` 的 `APP_VER` 和 `sw.js` 的 `CACHE_NAME` 一起 +1 |
| 3. 公约 | `check-rules.mjs`：300 行/文件、core 无浏览器 API |
| 4. 提交 | `git add nt` → commit → push |

---

## 发布后确认

```powershell
Start-Sleep -Seconds 80
$t = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
(Invoke-WebRequest "https://jefely.github.io/money-way/nt/js/core/version.js?x=$t" -UseBasicParsing).Content -match 'APP_VER'
```

看到新版本号才算部署完成。GitHub Pages 偶尔卡住，等 1–2 分钟仍不变就发个空提交重触发：

```powershell
git commit --allow-empty -m "chore: retrigger pages"
git push origin main
```

**手机上必须「划掉后台重开」**，否则 Service Worker 还用旧缓存。

---

## 出问题看这里

| 现象 | 原因 / 处理 |
|---|---|
| `签名 ✗ 不匹配` | 公钥与私钥不是一对，或 `thanks.enc.json` 被改过 |
| `没有 sig` | 生成时私钥没解锁（第 2 步漏了） |
| `thank-wall.js 里找不到 PUB_KEY` | 公钥被删或格式变了 |
| 手机有收款码、墙是空的 | 手机浏览器不支持签名算法（现为 ECDSA P-256，iOS 11/Android 5 起都支持） |
| 改完名单手机上没变 | 版本没升，或没划掉后台重开 |
| 载入后名字是乱码/空 | `thanks-wall.js` 里的内置 AES 密钥被改过，线上文件解不开了 |

---

## 安全边界

- **私钥**：只在你手上，口令加密，**永不提交**
- **公钥**：写死在 `thanks-wall.js`，公开无妨
- **收款码**：内嵌在 `qr-baked.js`，要改必须发版
- **防篡改**：换掉 `thanks.enc.json` 但没有私钥 → 签名对不上 → 客户端整块不显示
