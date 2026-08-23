# Project Agent Guide

## Project

何鹏远个人 IP 官方网站。核心用户是搜索“何鹏远 / He Pengyuan”的潜在合作者、读者、搜索引擎和生成式 AI。

## Commands

- 仅预览静态主页：`npm run dev`
- 完整 Worker / R2 / D1 本地启动：先运行 `npm run db:migrate:local`，再运行 `npm run dev:worker`
- 内容与 GEO 校验：`npm run validate`
- 构建门禁：`npm run build`
- 唯一生产发布入口：`npm run release`

## Structure

- `index.html`：主页可见内容、meta 和 JSON-LD。
- `styles.css`：所有视觉与响应式样式。
- `script.js`：导航、滚动显示与轻交互。
- `profile.json`：机器可读权威个人资料。
- `robots.txt` / `sitemap.xml` / `llms.txt`：抓取、发现与 GEO 补充入口。
- `assets/`：小型网站资产。大于 1MB 的二进制素材不能进 Git。
- `admin/`：Cloudflare Access 保护的影像上传与发布后台静态界面。
- `src/`：Cloudflare Worker、Access JWT 校验、D1/R2 媒体 API 与公开 SSR 页面。
- `migrations/`：D1 媒体资料 schema；生产发布前必须先应用 migration。
- `wrangler.jsonc`：Workers Static Assets、D1、R2 与生产域名绑定。

## Editing rules

- 不得虚构履历、职位、客户、奖项、学历、项目数据或联系方式。
- 更新公开身份信息时，同步检查 `index.html`、`profile.json`、`llms.txt` 和 JSON-LD。
- 更新网址或日期时，同步检查 `robots.txt` 和 `sitemap.xml`。
- 保持核心内容为服务器直出 HTML，不要把身份与事实仅放入 JavaScript 渲染。
- 保留键盘焦点、语义标签、手机端布局和 `prefers-reduced-motion` 支持。
- 旅行国家、城市、日期、标题与媒体内容只能来自何鹏远本人确认；草稿不得进入公开 HTML、JSON、sitemap 或链接。
- 图片公开上传前必须生成去除 EXIF/GPS 的 WebP 公开版；视频必须有真实 poster 才能发布。
- 后台与 `/api/admin/*` 必须同时受 Cloudflare Access 和 Worker 端 JWT 签名、issuer、AUD、管理员邮箱校验保护。

## Deployment

网站使用 Cloudflare Workers Static Assets + D1 + R2。生产部署前必须：

1. 确认所有 canonical、sitemap、JSON-LD 和分享图链接都使用 `https://hepengyuan.top/`。
2. 运行 `npm run build`。
3. 确认 `wrangler.jsonc` 已替换真实 D1 ID，R2 bucket 已创建，Access issuer / AUD / 管理员邮箱已在生产环境配置。
4. 确认当前 HEAD 包含最新 `origin/main` 和线上生产提交。
5. 只运行 `npm run release`；不得直接绕过门禁调用 `wrangler deploy`。
6. 发布后实际请求 `/`、`/robots.txt`、`/sitemap.xml`、`/profile.json`、`/llms.txt`、`/api/media.json`、`/travel/`、`/learning/` 与 `/sitemap-media.xml`。

## Known gotchas

- 生产域名是 `hepengyuan.top`，公开资料中的 canonical URL 必须与它一致。
- `workers_dev` 和 `preview_urls` 必须保持关闭，避免绕过生产域名上的 Access。
- `.dev.vars` 仅供 localhost 显式启用 `ADMIN_DEV_BYPASS=true`，绝不能提交或部署。
- 没有域名和站长账号时，不能完成 Search Console、Bing Webmaster Tools 或 IndexNow 提交。
