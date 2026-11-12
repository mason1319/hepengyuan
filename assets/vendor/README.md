# 自托管的第三方库

| 文件 | 来源 | 授权 |
| --- | --- | --- |
| `three-0.170.0.module.min.js` | npm `three@0.170.0` 的 `build/three.module.min.js`，未修改 | MIT，见 `three-LICENSE.txt` |

只给首页的 hi-fi 版（`/room/scene.js`）使用，按需加载，不在首屏。

自托管的原因：本站 CSP 的 `script-src` 只信任本站（唯一例外是 Cloudflare Web Analytics 的 beacon），不能从 CDN 加载；国内访问公共 CDN 也不稳定。

升级方式：从 npm 下载新版本的 tarball，核对 registry 给出的 `dist.integrity`（sha512），
取出 `build/three.module.min.js` 放到这里并改文件名里的版本号，然后同步更新
`room/scene.js` 的 import 路径、`scripts/validate-room.mjs` 里的 `THREE_PATH` / `THREE_SHA256`
和 `scripts/smoke-production.mjs`。0.171 起官方构建拆成了两个文件，升级时要一起带上。
