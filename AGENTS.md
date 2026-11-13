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
- `styles.css`：设计 token、自托管字体与全站版式（首页、`services/`、`policy.css` 都依赖它）。
- `script.js`：三态配色切换、公开联系方式复制与滚动渐显。
- `room/`：首页的 hi-fi 版——可交互的 3D 90 年代夜间房间，盖在静态首页之上，布局参照 felixrieseberg.com 的房间版（只借鉴布局与交互方式，模型、文字、代码都是自己的）。左墙角是书架（第二层的“作品书”运行时取自首页 Work 区 Projects，点了打开 WORK；另有风水摆件、图腾、符箓等纯装饰）；左边电脑桌上是铂金色电脑（ABOUT、ONLINE 拨号 BBS，电源键和亮度旋钮能按能拧）；主书桌上是放在录像机上的大彩电（POSTS 图文电视、FILM 录像带；电源、1–6 预选台、CH、VOL 能按）、录像带、遥控器、按键电话与调制解调器（ONLINE / SERVICES）、黄色记事本与墙上年份卡片（WORK）、能拿起来真的算的计算器、掌机（GAME）；窗台上是 90 年代手提录音机和一摞磁带（MUSIC）。书桌视角可以拖动旋转、右键 / 双指平移、滚轮 / 捏合缩放、“视角”按钮或 V 键切换五个机位；手机上点物件第一下只出提示，第二下才打开。`boot.js` 判断设备能力、负责降级提示与进出切换，并搭建房间里的全部 HTML（导航、右下按钮、光标提示、盖在屏幕上的面板、录像带播放控制）；`scene.js` 是按需加载的 three.js 场景（纯程序化建模，无外部模型），只负责画面、镜头、放带退带和屏幕投影位置。样式在 `styles.css` 的「hi-fi 房间」一节。
- `en/`、`de/`、`ko/`：英文、德文、韩文首页，由 `scripts/i18n.mjs` 根据 `index.html` 与 `i18n/<lang>.json` 的逐句译文生成，不要手改。页眉和 3D 房间顶部都有语言菜单（简体中文 / English / Deutsch / 한국어）；服务页与条款页目前只有中文。
- `profile.json`：机器可读权威个人资料。
- `policy.css`：`policy/`、`terms/`、`faqs/` 三页的版式，依赖 `styles.css` 的 token。
- `robots.txt` / `sitemap.xml` / `llms.txt`：抓取、发现与 GEO 补充入口。
- `assets/`：小型网站资产。大于 1MB 的二进制素材不能进 Git。
- `assets/vendor/`：自托管的 three.js（MIT，固定版本并在 `scripts/validate-room.mjs` 里校验 sha256）。静态页 CSP 的 `script-src` 只信任本站（外加 Cloudflare Web Analytics 的 beacon），不能换成 CDN。
- `assets/fonts/`：自托管的 latin 子集 woff2（OFL）。CSP 是 `font-src 'self'`，不能改成外链 Google Fonts；中文由系统字体栈承接。
- `services/`：服务方案、上门与远程部署、能力与作品、FAQ。首页只保留身份、履历、作品、文章与联系方式。
- `admin/`：Cloudflare Access 保护的影像上传与发布后台静态界面。
- `src/`：Cloudflare Worker、Access JWT 校验、D1/R2 媒体 API 与公开 SSR 页面。
- `migrations/`：D1 媒体资料 schema；生产发布前必须先应用 migration。
- `wrangler.jsonc`：Workers Static Assets、D1、R2 与生产域名绑定。

## Editing rules

- 不得虚构履历、职位、客户、奖项、学历、项目数据或联系方式。
- 更新公开身份信息时，同步检查 `index.html`、`profile.json`、`llms.txt` 和 JSON-LD。
- 中文首页是唯一的事实来源。改了 `index.html` 的可见文字后，在 `i18n/en.json`、`de.json`、`ko.json` 里补上或改掉对应句子，再运行 `npm run i18n`；生成器会拒绝残留中文和失效译文，`scripts/validate-i18n.mjs` 会核对译文页的链接、联系方式和年份与中文首页一致。译文只能翻译，不能增删事实；人物 JSON-LD 只放在中文首页，译文页用 WebPage 指回 `https://hepengyuan.com/#person`。
- 更新网址或日期时，同步检查 `robots.txt` 和 `sitemap.xml`。
- 保持核心内容为服务器直出 HTML，不要把身份与事实仅放入 JavaScript 渲染。
- 保留键盘焦点、语义标签、手机端布局和 `prefers-reduced-motion` 支持。
- 3D 房间只是增强层：没有 JS、没有 WebGL 2、软件渲染、省流量、`prefers-reduced-motion`、帧率过低或加载失败时都必须自动回到静态首页并说明原因；不得把任何内容只放在房间里。
- 房间面板里的文字和链接一律在运行时从首页已有栏目读取（`main h1`、`.pb-dek`、`#aggie-role`、`#work` 里的 `.pb-item` 与 `.pb-note`、`#posts`、`#contact .on-hd`），不要在 `room/` 里另存一份事实；改这些栏目的结构时同步改 `room/boot.js` 的 `build*` 函数，校验脚本会检查这些结构是否还在。墙上的年份卡片 `TIMELINE` 是唯一写在场景里的履历，必须与首页 Work 区逐字一致；热点 `HOTSPOTS` 必须打开一个房间视图或指向真实存在的栏目。
- 录音机（MUSIC）里的磁带只能来自首页 `#music` 的 `[data-music]` 条目（歌名 `[data-music-title]`、时长 `[data-music-length]`、`<audio>` 的同源地址）。音乐文件大于 1MB，不进 Git：放在 R2 的 `public/music/` 下，由 `src/worker.js` 的 `MUSIC_ROUTES` 以 `/media/music/*` 提供；新增一首要同时改首页条目、`MUSIC_ROUTES`、`i18n/*.json`、JSON-LD、`llms.txt` 和 `scripts/smoke-production.mjs`，并先把文件传到 R2 再发布。磁带侧标只写栏目名（音乐 MUSIC），歌名只在面板里显示。
- 录像带（FILM）里的影像只能来自两处：首页 `#personal-film` 的宣传片，以及 `/api/media.json`（服务端只返回已发布条目，`boot.js` 只接受本站同源地址）。不要在 `room/` 里写死任何影像地址、标题、地点或日期；带子侧标只写栏目名（宣传片 / 旅行 / 学习），条目标题只在播放时显示。
- 改 `room/` 下任何文件后，同步更新 `index.html` 里 `boot.js?v=` 与 `room/boot.js` 里 `SCENE_URL` 的版本号（两处必须一致）。
- 旅行国家、城市、日期、标题与媒体内容只能来自何鹏远本人确认；草稿不得进入公开 HTML、JSON、sitemap 或链接。
- 图片公开上传前必须生成去除 EXIF/GPS 的 WebP 公开版；视频必须有真实 poster 才能发布。
- 后台与 `/api/admin/*` 必须同时受 Cloudflare Access 和 Worker 端 JWT 签名、issuer、AUD、管理员邮箱校验保护。

## Deployment

网站使用 Cloudflare Workers Static Assets + D1 + R2。生产部署前必须：

1. 确认所有 canonical、sitemap、JSON-LD 和分享图链接都使用 `https://hepengyuan.com/`。
2. 运行 `npm run build`。
3. 确认 `wrangler.jsonc` 已替换真实 D1 ID，R2 bucket 已创建，Access issuer / AUD / 管理员邮箱已在生产环境配置。
4. 确认当前 HEAD 包含最新 `origin/main` 和线上生产提交。
5. 只运行 `npm run release`；不得直接绕过门禁调用 `wrangler deploy`。
6. 发布后实际请求 `/`、`/robots.txt`、`/sitemap.xml`、`/profile.json`、`/llms.txt`、`/api/media.json`、`/travel/`、`/learning/`、`/sitemap-media.xml`、`/media/music/` 下的每首音乐，`/en/`、`/de/`、`/ko/`，以及 `/room/boot.js`、`/room/scene.js` 和 `/assets/vendor/` 下的 three.js。
7. 在真实浏览器里打开 `/` 确认 3D 房间能进入、能点物件跳到对应栏目；再打开 `/?room=0` 确认静态版，`/?room=1` 确认可以强制回到房间。

## Known gotchas

- 生产域名是 `hepengyuan.com`，公开资料中的 canonical URL 必须与它一致。
- `workers_dev` 和 `preview_urls` 必须保持关闭，避免绕过生产域名上的 Access。
- `.dev.vars` 仅供 localhost 显式启用 `ADMIN_DEV_BYPASS=true`，绝不能提交或部署。
- 没有域名和站长账号时，不能完成 Search Console、Bing Webmaster Tools 或 IndexNow 提交。
- 房间的降级判断不要用 `navigator.connection.effectiveType === "3g"`：它按往返延迟估算，跨境访问时很多带宽正常的访客都会被报成 3g。
- 房间的帧率看门狗阈值必须低于 30fps：省电模式和部分移动浏览器会把刷新率锁在 30。
