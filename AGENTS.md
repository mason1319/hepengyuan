# Project Agent Guide

## Project

何鹏远个人 IP 官方网站。核心用户是搜索“何鹏远 / He Pengyuan”的潜在合作者、读者、搜索引擎和生成式 AI。

## Commands

- 本地启动：`npm run dev`
- 内容与 GEO 校验：`npm run validate`
- 构建门禁：`npm run build`

## Structure

- `index.html`：主页可见内容、meta 和 JSON-LD。
- `styles.css`：所有视觉与响应式样式。
- `script.js`：导航、滚动显示与轻交互。
- `profile.json`：机器可读权威个人资料。
- `robots.txt` / `sitemap.xml` / `llms.txt`：抓取、发现与 GEO 补充入口。
- `assets/`：小型网站资产。大于 1MB 的二进制素材不能进 Git。

## Editing rules

- 不得虚构履历、职位、客户、奖项、学历、项目数据或联系方式。
- 更新公开身份信息时，同步检查 `index.html`、`profile.json`、`llms.txt` 和 JSON-LD。
- 更新网址或日期时，同步检查 `robots.txt` 和 `sitemap.xml`。
- 保持核心内容为服务器直出 HTML，不要把身份与事实仅放入 JavaScript 渲染。
- 保留键盘焦点、语义标签、手机端布局和 `prefers-reduced-motion` 支持。

## Deployment

静态网站可部署至 Cloudflare Pages 或 Vercel。生产部署前必须：

1. 确认所有 canonical、sitemap、JSON-LD 和分享图链接都使用 `https://hepengyuan.top/`。
2. 运行 `npm run build`。
3. 确认当前 HEAD 包含最新 `origin/main` 和线上生产提交。
4. 从项目根目录发布，不设置构建输出目录。
5. 发布后实际请求 `/`、`/robots.txt`、`/sitemap.xml`、`/profile.json` 与 `/llms.txt`。

## Known gotchas

- 生产域名是 `hepengyuan.top`，公开资料中的 canonical URL 必须与它一致。
- 未确认联系方式之前，联系按钮故意不发送邮件。
- 没有域名和站长账号时，不能完成 Search Console、Bing Webmaster Tools 或 IndexNow 提交。
