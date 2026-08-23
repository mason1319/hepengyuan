# 何鹏远个人 IP 官方网站

一个面向人类读者、搜索引擎和生成式 AI 的个人官方网站。公开身份内容保持服务器直出；影像后台使用 Cloudflare Access、Workers、D1 与 R2，让何鹏远可以从本地自行上传旅行照片、旅行视频和学习视频。

## 本地运行

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
npm run dev
```

浏览器打开 `http://127.0.0.1:4173/`。

这只预览静态主页。要测试上传、草稿、公开媒体页和视频 Range：

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev:worker
```

浏览器打开 `http://localhost:8787/`；上传后台位于 `http://localhost:8787/admin/`。

## 自助上传与发布

- 本地选择 JPEG、PNG、WebP、AVIF、MP4 或 WebM。
- 填写旅行 / 学习分类、标题、说明、国家、城市和日期；未确认的信息留空。
- 上传完成默认是草稿，不会被访客、搜索引擎或 AI 看到。
- 视频自动生成真实画面 poster；图片生成去除 EXIF/GPS 的 WebP 公开版。
- 只有手动点击“公开”后，内容才进入主页、详情页、公开 JSON 和媒体 sitemap。
- 随时可以“转为草稿”，或在明确确认后永久删除 R2 文件、封面与媒体记录。

完整 Cloudflare 初始化与 Access 配置见 [docs/cloudflare-media-setup.md](docs/cloudflare-media-setup.md)。

## S1 漫画服务页样板

本地启动后访问 `http://127.0.0.1:4173/samples/s1/`。该页面仅用于视觉与交互确认，不会自动替换 `https://hepengyuan.top/` 根主页，本任务未部署。

## 验收

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
npm run build
```

## 上线前继续完善

1. 真实域名：已确认为 `https://hepengyuan.top/`。
2. 公开联系方式：微信、抖音、邮箱、电话、Telegram、X 与 YouTube 已确认并同步。
3. Cloudflare：仍需填入真实 D1 ID、Access 团队域名、AUD 和管理员登录邮箱后才能生产启用上传后台。
4. 影像素材：首批国家、照片和视频尚未提供，因此公开页保持中性的发布规则与空目录，不虚构地点或内容。
5. 个人身份：一句话职业定位、所在城市（可选）、真实头像。
6. 权威交叉链接：微信公众号、知乎、小红书、B 站、GitHub、LinkedIn 等已有账号。
7. 代表项目与原创观点：只发布有真实证据和本人确认的内容。

生产更新必须声明当前平台并校验线上 Git SHA；当前 Pages → Worker 首次切换的完整命令、回滚快照与恢复步骤见 [Cloudflare 影像后台配置](docs/cloudflare-media-setup.md)。所有生产发布都要求仓库存在 `origin` 并包含最新 `origin/main`。

## GEO 已实现

- 核心事实为静态 HTML，不依赖 JavaScript 显示。
- `Person` + `ProfilePage` + `WebSite` + `BreadcrumbList` JSON-LD。
- 显式允许 Googlebot、Bingbot、OAI-SearchBot、GPTBot、Claude-SearchBot 和 PerplexityBot。
- `profile.json` 作为机器可读的个人事实源。
- `sitemap.xml`、`robots.txt`、`canonical`、Open Graph 与大图预览。
- `llms.txt` 作为可选辅助索引；它不代替可被收录的高质量 HTML 内容。
- 明确的标准中英文名、主题、更新日期和引用边界。
- 已发布媒体拥有服务器直出的 `/travel/`、`/learning/`、`/stories/:slug`、`/api/media.json` 与 `/sitemap-media.xml`。
- 草稿、对象 key、原文件名、管理员邮箱与未确认位置不会进入公开索引。

## 上线后的收录步骤

1. 在 Google Search Console 验证域名，提交 `/sitemap.xml`。
2. 在 Bing Webmaster Tools 验证域名，提交 sitemap，并配置 IndexNow。
3. 用真实社交账号链回官网，同时把这些链接写入 `sameAs`。
4. 使用 Google Rich Results Test 验证 JSON-LD，用 URL Inspection 请求首次收录。
5. 每次新增项目或文章时更新 sitemap 和 `dateModified`，并通知 IndexNow。
