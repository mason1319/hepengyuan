# Cloudflare 影像后台配置

本站的公开页面、上传后台和媒体发布统一运行在 Cloudflare Workers；照片与视频存入 R2，标题、地点和发布状态存入 D1。后台路径由 Cloudflare Access 保护，Worker 还会再次验证 Access JWT。

## 1. 一次性创建资源

先登录何鹏远网站所在的 Cloudflare 账号：

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
npm run cloudflare:whoami
```

若未登录，执行：

```bash
npx --yes wrangler@4.125.0 login
```

创建 R2 bucket 和 D1 database：

```bash
npx --yes wrangler@4.125.0 r2 bucket create hepengyuan-media
npx --yes wrangler@4.125.0 d1 create hepengyuan-media
```

把 D1 命令返回的真实 `database_id` 写入 `wrangler.jsonc`，替换占位值。不要把 API token、Access Key 或密码写入仓库。

## 2. 配置 Cloudflare Access

在 Cloudflare 控制台进入 **Zero Trust → Access → Applications → Add an application → Self-hosted**，为以下父路径和通配路径建立保护：

```text
hepengyuan.com/admin
hepengyuan.com/admin/*
hepengyuan.com/api/admin
hepengyuan.com/api/admin/*
```

策略使用：

- Action：`Allow`
- Include：管理员实际登录邮箱
- Require：建议开启 MFA

`/admin/*` 不覆盖 `/admin` 本身，`/api/admin/*` 也不覆盖 `/api/admin`，因此父路径与通配路径都要配置。

从 Access 应用复制 Audience (`AUD`) tag，并确认团队域名，例如 `https://your-team.cloudflareaccess.com`。生产 Worker 需要：

```text
CF_ACCESS_ISSUER=https://your-team.cloudflareaccess.com
CF_ACCESS_AUD=Access 应用的 AUD tag
ADMIN_EMAILS=允许管理网站的登录邮箱；多个邮箱用英文逗号分隔
```

这些非密钥配置必须在正式发布前填入 `wrangler.jsonc`；发布预检会拒绝任何占位值。`workers_dev` 与 `preview_urls` 必须保持 `false`，避免从备用域名绕过 Access。API token、密码和私钥仍不得写入配置或 Git。

## 3. 本地验证

创建只在本机使用的变量文件：

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:worker
```

打开：

- 公开主页：`http://localhost:8787/`
- 私有上传后台：`http://localhost:8787/admin/`

只有 localhost 且 `.dev.vars` 显式设置 `ADMIN_DEV_BYPASS=true` 时才允许绕过 Access；生产域名永不使用该绕过。`.dev.vars` 已被 Git 忽略。

## 4. 发布与验收

生产发布会应用 D1 migration、切换 `hepengyuan.com` 的 Worker 版本并运行在线冒烟检查。发布前必须先配置 Git `origin`，确保当前 `HEAD` 包含最新 `origin/main` 和线上提交。

截至 2026-08-23，生产域名仍由 Cloudflare Pages 项目 `hepengyuan-personal-site` 提供：

- Production deployment：`b762e7a3-7e3d-461c-b36d-5214993ca9b9`
- Source commit：`3c96abea681647096a8c329286eed290a0e9f13a`
- 已验证回滚快照：`https://b762e7a3.hepengyuan-personal-site.pages.dev/`

完成 D1、R2、Access 和 `origin` 配置后，Pages → Worker 首次切换的唯一入口是：

```bash
CURRENT_PRODUCTION_PLATFORM=pages \
PAGES_TO_WORKER_CUTOVER_CONFIRMED=true \
PAGES_ROLLBACK_URL=https://b762e7a3.hepengyuan-personal-site.pages.dev/ \
PRODUCTION_COMMIT_SHA=3c96abea681647096a8c329286eed290a0e9f13a \
npm run release
```

切换完成后的 Worker 更新使用：

```bash
CURRENT_PRODUCTION_PLATFORM=worker \
PRODUCTION_COMMIT_SHA=<当前线上 Worker 对应的 Git SHA> \
npm run release
```

只有确认域名从未存在 Pages 或 Worker 生产版本时，才使用 `CURRENT_PRODUCTION_PLATFORM=none ALLOW_FIRST_DEPLOY=true npm run release`。当前项目已经存在 Pages 生产版本，禁止使用首次发布模式。

不要单独调用 `wrangler deploy` 绕过构建、同步和冒烟门禁。发布后检查：

- `/admin/` 未登录时进入 Cloudflare Access 登录页。
- `/api/admin/media` 未登录时同样跳转 Cloudflare Access；生产 smoke 会验证两个后台入口都跳转到 `*.cloudflareaccess.com`，单纯由 Worker 返回 `401/403` 不算 Access 配置成功。
- 使用管理员实际邮箱完成一次登录，确认后台显示登录邮箱并能读取“草稿与已公开内容”列表；这一步验证 Allow policy，而不是只验证登录页存在。
- 上传照片后先显示“草稿”，点击“公开”后才进入主页、`/travel/` 或 `/learning/`。
- `/api/media.json` 只包含已发布内容，不含对象 key、原文件名或管理员邮箱。
- 视频请求 `Range: bytes=0-99` 返回 `206 Partial Content`，并可在 Safari / iPhone 拖动进度。
- 把条目“转为草稿”后，新的请求会立即从公开 HTML、JSON、sitemap 和文件接口得到不可用结果；浏览器已经完整加载到内存或被访客另行保存的副本无法远程收回。

首次 Pages → Worker 切换失败时：

1. 先确认回滚快照 `https://b762e7a3.hepengyuan-personal-site.pages.dev/` 仍返回正确网站。
2. 在 Cloudflare **Workers & Pages → hepengyuan-personal-site Worker → Settings → Domains & Routes** 移除 `hepengyuan.com` 的 Worker 自定义域绑定。
3. 在 **Workers & Pages → hepengyuan-personal-site Pages → Custom domains** 重新绑定并验证 `hepengyuan.com`。
4. 实际请求 `/`、`/robots.txt`、`/sitemap.xml`、`/profile.json` 和 `/llms.txt`；全部正常后才算回滚完成。

切换成功后的普通 Worker 版本回滚，在 Cloudflare Workers 的 **Deployments / Versions** 恢复上一个已验证版本。D1 migration 不随 Worker 版本自动回滚，因此 migration 只做向前兼容变更，不在紧急回滚时删除表或字段。

## 5. 素材边界

- 图片在浏览器中生成最长边 2560px 的 WebP 公开版，以移除 EXIF/GPS；原始本地照片不进入 Git 或公开 R2 对象。
- MP4 / WebM 视频按 32 MiB 分片上传；后台自动读取时长并提取真实视频帧作为 WebP poster，没有有效时长或 poster 的视频不能发布。
- 视频原文件不会在浏览器中重新编码，也不会自动删除设备、时间或定位元数据；上传前请先用可信工具检查并导出公开版本。
- MOV、HTML、SVG 和其他未列入白名单的文件会被拒绝；iPhone MOV 请先导出为 MP4。
- 国家、城市、日期和说明只按本人确认内容填写，不从 EXIF 推断，不填写住址或实时精确位置。
