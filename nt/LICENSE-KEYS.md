# 离线激活码

NT 账本可以在没有服务器的情况下核对一枚激活码。核对只发生在这台设备上：Ed25519 验签、到期、设备名额、会员占位功能。核心记账不看激活状态。

公钥写在 `nt/js/core/license-pubkey.js`。私钥永远不要放进这个公开仓库。

这套机制提高篡改成本，**解不开**「有人改了本机上的 JavaScript」这种情况。边界写在最后一节。

## 1. 生成密钥

在仓库外生成一对密钥。默认写到 `~/.nt-keys/nt-ed25519.pem`。

```bash
node nt/tools/license-keygen.mjs --write-public nt/js/core/license-pubkey.js
```

指定路径也可以（仍然必须在仓库外面）：

```bash
export NT_LICENSE_PRIV="$HOME/.nt-keys/nt-ed25519.pem"
node nt/tools/license-keygen.mjs --out "$NT_LICENSE_PRIV" --write-public nt/js/core/license-pubkey.js
```

- 标准输出是 32 字节公钥的 base64。
- 已有私钥时不会覆盖，确认要换钥再加 `--force`。换钥之后，旧激活码全部失效，而且要发一版带新公钥的应用。
- 工具如果发现目标路径在仓库里面，会直接退出，不写文件。

当前仓库里的公钥是全 0 占位。不跑上面的命令，任何激活码都验不过。

## 2. 签发激活码

```bash
node nt/tools/license-issue.mjs \
  --priv "$HOME/.nt-keys/nt-ed25519.pem" \
  --user alice@example.com \
  --tier pro \
  --days 365 \
  --seats 3
```

`--priv` 可以省略，改用环境变量 `NT_LICENSE_PRIV`。

| 参数 | 含义 |
|---|---|
| `--user` | 持有人。邮箱、手机号哈希或名字都行。会写进激活码，别人拿到码就能看见，敏感信息请先自行哈希。 |
| `--tier` | `free`、`plus`（进阶）、`pro`（专业）。默认 `pro`。 |
| `--features` | 逗号分隔：`report.advanced`、`chart.ringExport`。不写时按档位给。 |
| `--days` | 从签发起多少天过期。 |
| `--expiry` | 具体日期，例如 `2027-01-01`。和 `--days` 都省略表示长期。 |
| `--seats` | 允许几台设备。默认 3。`0` 表示不限制。 |
| `--id` | 可选，16 位十六进制许可证编号。不写就随机。 |
| `--seal-file` | 可选，16 字节密封钥文件，必须在仓库外。不写就用源码里的开发密封钥。 |

激活码打印在标准输出，形如 `NT1-XXXX-XXXX-…`。可以口头念、贴到聊天里。抄错一位会先被校验位拦住，不必等到验签。

持有人在「设置 → 会员」里粘贴。通过后能看到档位、持有人、到期和编号，也可以停用。记录写在账本 state 的 `license` 字段里，跟整本账一起 AES-GCM 加密进 IndexedDB，加密备份带走它。安装号另存在本机 `localStorage`，不进备份，所以新设备会再占一个名额。

## 3. 发行前给文件清单签名

开发构建的 `nt/integrity.json` 是 `dev: true`，没有签名。本机打开时会员功能可以试用。

官方站点 `https://jefely.github.io` 上如果清单没签名，会提示「非官方或被篡改的版本」，并关掉会员功能。记账仍然可用。

公钥写好之后：

```bash
node nt/tools/license-integrity.mjs --priv "$HOME/.nt-keys/nt-ed25519.pem"
```

这会重写 `nt/integrity.json`：里面是 `nt/js` 下每个脚本的 SHA-256，以及用同一把私钥做的 Ed25519 签名。应用启动后重新拉取这些文件核对。对不上只关会员，不锁账本。

改过任何一个被列出的脚本，都要重新跑一遍，否则官方站点上的会员功能会关掉。

## 4. 可选：重封会员模块

开发源码用公开的 `DEV_SEAL` 密封两个占位功能（高级报表、环图导出）。要换成自己的密封钥：

```bash
# 16 字节，放在仓库外
node nt/tools/license-obfuscate.mjs --seal-file "$HOME/.nt-keys/nt-seal.key"
```

输出在 `nt/dist/`（已忽略，不进 git），`nt/js` 不动。发行激活码时加上同一份 `--seal-file`。对不上的话，签名即使有效，占位模块也解不开。

这一步会去掉那两个模块副本里的注释。没有新的依赖，也不是防破解。

## 5. 应用里怎么用

- 设置页「会员」：粘贴、激活、停用，并试用两个占位功能。
- 账本说明页展示官方地址 `https://jefely.github.io/money-way/nt/`。`location.origin` 对不上会警告。
- `nt/js/core/entitlements.js` 的 `has(feature)` 每次重新验签。没有 `isPro` 字段。
- 占位功能再验一次签，并用签名字节做出导出文本里的绑定 token。

Service Worker 的 `CACHE_NAME` 已包含新文件。发版时仍要和 `nt/js/core/version.js` 的 `APP_VER` 一起改。

## 6. 仍然能被破解的部分

这些是客户端方案的上限，不是漏做：

1. 验签、名额、到期、完整性都在用户自己的浏览器里。对方改 `verifyEd25519` 或 `has`，再改掉完整性清单（或让清单检查直接返回通过），会员门闩就开了。我们做不到在不信任这台设备的前提下拦住它。
2. 开发密封钥写在源码里，不是秘密。发行密封钥会放进激活码载荷，拿到一枚合法码的人可以抽出它，解开同一版的占位模块。它防的是「只把某个布尔值改成 true」，防不住「有一枚合法码，并且会改程序」。
3. 设备名额存在本地加密账本里。清站点数据，或解开自己的备份后改 `activations`，可以重计。这是软绑定。
4. 防时钟回拨靠本机见过的最大时间。清掉本地数据后，这个水位会丢。没有联网对时。
5. 没有服务器，就不能远程吊销某一枚码。过期和名额只看码里签过的字段。
6. 公钥换了必须发新版本。旧应用仍会承认旧私钥签发的码。
7. 核心记账不读这些结果。会员门闩被绕过，也不应该挡住用户看自己的账。
