# 何鹏远个人 IP 官方网站

一个面向人类读者、搜索引擎和生成式 AI 的静态个人站。首版本不虚构履历，只公开已确认的姓名和当前建站目标。

## 本地运行

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
npm run dev
```

浏览器打开 `http://127.0.0.1:4173/`。

## 验收

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
npm run build
```

## 上线前必须补齐

1. 真实域名：已确认为 `https://hepengyuan.top/`。
2. 联系方式：邮箱、微信或一个公开社交账号。
3. 个人身份：一句话职业定位、所在城市（可选）、真实头像。
4. 权威交叉链接：微信公众号、知乎、小红书、B 站、GitHub、LinkedIn 等已有账号。
5. 代表项目：至少 3 个，每个包含背景、你的行动、可验证结果和相关链接。
6. 原创观点：至少 3 篇有真实经验或独立判断的内容。

## GEO 已实现

- 核心事实为静态 HTML，不依赖 JavaScript 显示。
- `Person` + `ProfilePage` + `WebSite` + `BreadcrumbList` JSON-LD。
- 显式允许 Googlebot、Bingbot、OAI-SearchBot、GPTBot、Claude-SearchBot 和 PerplexityBot。
- `profile.json` 作为机器可读的个人事实源。
- `sitemap.xml`、`robots.txt`、`canonical`、Open Graph 与大图预览。
- `llms.txt` 作为可选辅助索引；它不代替可被收录的高质量 HTML 内容。
- 明确的标准中英文名、主题、更新日期和引用边界。

## 上线后的收录步骤

1. 在 Google Search Console 验证域名，提交 `/sitemap.xml`。
2. 在 Bing Webmaster Tools 验证域名，提交 sitemap，并配置 IndexNow。
3. 用真实社交账号链回官网，同时把这些链接写入 `sameAs`。
4. 使用 Google Rich Results Test 验证 JSON-LD，用 URL Inspection 请求首次收录。
5. 每次新增项目或文章时更新 sitemap 和 `dateModified`，并通知 IndexNow。
