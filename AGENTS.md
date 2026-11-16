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
- `room/`：首页的 hi-fi 版——可交互的 3D 90 年代夜间房间，盖在静态首页之上，布局参照 felixrieseberg.com 的房间版（只借鉴布局与交互方式，模型、文字、代码都是自己的）。左墙角是书架（第二层的“作品书”运行时取自首页 Work 区 Projects，点了打开 WORK；另有风水摆件、图腾、符箓等纯装饰）；天花板上有个拉线开关，灯绳垂在窗前，拉一下在雨夜和晴天午后之间切换；房间右侧是放映角：后墙挂幕布，对面矮柜上一台双片盘的老式放映机，片盘转动、一束光打到幕布上，放首页登记的片子（Aggie 的短片和品牌片、个人宣传片），镜头可以绕着它拖动、缩放、平移；左边电脑桌上是铂金色电脑（ABOUT、ONLINE 拨号 BBS，电源键和亮度旋钮能按能拧）；主书桌上是放在录像机上的大彩电（POSTS 图文电视、FILM 录像带；电源、1–6 预选台、CH、VOL 能按）、录像带、遥控器、按键电话与调制解调器（ONLINE / SERVICES）、黄色记事本与墙上年份卡片（WORK）、能拿起来真的算的计算器、名片盒（CARD：拿出一张，点击翻面、拖动转着看）、掌机（GAME）；窗台上是 90 年代手提录音机和一摞磁带（MUSIC）。书桌视角可以拖动旋转、右键 / 双指平移、滚轮 / 捏合缩放、“视角”按钮或 V 键切换五个机位；手机上点物件第一下只出提示，第二下才打开。`boot.js` 判断设备能力、负责降级提示与进出切换，并搭建房间里的全部 HTML（导航、右下按钮、光标提示、盖在屏幕上的面板、录像带播放控制）；`scene.js` 是按需加载的 three.js 场景（纯程序化建模，无外部模型），只负责画面、镜头、放带退带和屏幕投影位置。`avatar.js` 是房间亮起来之后才加载的小人——Q 版何鹏远（白色唐装、黑发、眼镜，照本人形象照程序化建模），踩着飞剑在房间里飞、在主书桌上跑跳、落到电脑 / 电视 / 录音机顶上，可以拖着走；点它会说话（文字气泡），按 G 或点「带我逛逛」会按顺序介绍房间里的物件。它不 import 任何东西，three.js 由 `scene.js` 通过 `addActor` 交进去；自己搭气泡的 HTML。样式在 `styles.css` 的「hi-fi 房间」一节。
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
- `src/aggie-guard.js`：`/aggie-3a/` 的游戏是 R2 里编译好的单文件（`public/experiences/aggie-3a-v6.html`，没有源码，不要改它）。它按电脑规格做（约 190 万三角形、116 个着色器），手机上常被系统因内存不够杀掉重载，看起来就是一直卡在载入。Worker 返回游戏页时用 HTMLRewriter 在 `<head>` 末尾插入这段手机保护脚本：上次被杀掉时不再启动游戏、改为说明停在哪一步；同一阶段卡 45 秒给出提示；游戏报启动失败时补上出路；`?debug=1` 在任何设备上显示各阶段耗时和报错。电脑不带 `?debug=1` 时脚本立即退出。改脚本要同步改 `AGGIE_GUARD_VERSION`（ETag 跟着变），并保持旧 iOS 能解析的语法（校验脚本会查）。
- `migrations/`：D1 媒体资料 schema；生产发布前必须先应用 migration。`0007_go_clicks.sql` 是出口点击的按日汇总表。
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
- 房间里的三张照片（墙上全家福、主书桌上的童年照立框、显示器右上角的拍立得）和左墙上那幅裱好的工笔牡丹图（`peony.webp`，镜框装裱：黄花梨边框、米色绫边）是纯装饰，放在 `assets/room/`；换照片要先去掉 EXIF / GPS 并转成 WebP（单张远小于 1MB），不要放未经本人同意公开的照片；挂别人的画作之前先确认可以公开展示。
- 名片盒里那张名片的正反面文字、联系方式和二维码，只能来自首页 `#card`（`data-card-*` 字段，二维码图片在 `assets/card/`）；改名片就改首页这一节和 `i18n/*.json`，场景按它重画贴图，`room/` 里不写名片内容。
- 录音机（MUSIC）里的磁带只能来自首页 `#music` 的 `[data-music]` 条目（歌名 `[data-music-title]`、时长 `[data-music-length]`、`<audio>` 的同源地址）。音乐文件大于 1MB，不进 Git：放在 R2 的 `public/music/` 下，由 `src/worker.js` 的 `MUSIC_ROUTES` 以 `/media/music/*` 提供；新增一首要同时改首页条目、`MUSIC_ROUTES`、`i18n/*.json`、JSON-LD、`llms.txt` 和 `scripts/smoke-production.mjs`，并先把文件传到 R2 再发布。磁带侧标只写栏目名（音乐 MUSIC），歌名只在面板里显示。
- 录像带（FILM）里的影像只能来自两处：首页 `#personal-film` 的宣传片，以及 `/api/media.json`（服务端只返回已发布条目，`boot.js` 只接受本站同源地址）。不要在 `room/` 里写死任何影像地址、标题、地点或日期；带子侧标只写栏目名（宣传片 / 旅行 / 学习），条目标题只在播放时显示。
- 改 `room/` 下任何文件后，同步更新 `index.html` 里 `boot.js?v=` 与 `room/boot.js` 里 `SCENE_URL`、`AVATAR_URL` 的版本号（三处必须一致）。
- 小人的台词写在 `room/avatar.js` 的 `STRINGS`（四种语言）：只有招呼、玩笑和对房间物件的说明，不写任何履历事实。平时不说脏话，五秒内被连戳三下或被拎起来才爆粗口，用词限于口头禅，不针对任何人。
- 小人会去哪、会介绍什么，都靠登记：`room/scene.js` 的 `perches` 里每个落脚点一行（`stand` 表示能落地站着，`poses` 是它在那儿可以摆的姿态，不写用默认的一组），`room/avatar.js` 的 `stops` 里用同一个 id 写四种语言的介绍；要进带逛就在 `TOUR` 里加一行；要让它能替访客“用”这件东西（放映、拉灯绳），在 `STOP_ACTIONS` 里加一行并在 `room/boot.js` 的 `guideAct` 里接住。以后新增的场景和物件照这四步登记，不用改小人的其它代码（校验脚本会查落脚点、四种语言的台词和动作是否齐）。姿态有五种：站、趴（prone）、侧躺（lie）、耍赖打滚（tantrum）、撒娇（cute）；只在落地站稳时摆，一动身就收。自己逛到某处会随机摆一个；连戳三下骂完会躺地上耍赖，每戳三下里有一下撒娇。撒娇和耍赖的台词（`cute` / `rogue`）也有本人录音：被访客戳出来的撒娇、连戳三下骂完之后接的那句耍赖会出声；小人自己落地时赖的那一句仍然只出文字气泡。调试姿态：网址加 `?pose=prone`（或 lie / tantrum / cute），小人一进房间就在电视顶上摆这个姿态且不乱跑。
- 小人出声只能用何鹏远本人的录音：`assets/room/voice/<台词 id>.mp3`（单个文件小于 1MB），并把 id 登记进 `room/avatar.js` 的 `VOICE`；没有录音的台词只出文字气泡。不得用机器合成或克隆的声音，校验脚本会拒绝 `speechSynthesis`，也会拒绝目录里没登记的文件。录音是普通话，四种语言的页面共用，气泡里的译文当字幕；改了某句中文台词的意思要重录那一句。录音文件不带任何元数据（手机录音的文件名和标签里可能有地点），单声道 mp3；替换已有录音后把 `VOICE_REV` 加一（`/assets/` 缓存七天）。只有访客点了小人、拖了小人或开始带逛才出声，进房间时自动出的招呼和小人自己逛到某处时的介绍不出声；有录音的气泡里带「静音」开关。iPhone 的 Safari 和微信只允许在点按事件（touchend / click / 按键）里开始出声：`avatar.js` 在房间里任何一次点按时给那个复用的 `Audio` 解锁（`prime`），某句没放出来时把声音按钮变成「点这里出声」并在那次点击里重说；改这段逻辑要保留这三层。一句录音 20 秒还没开口算超时（气泡里给「点这里出声」，带逛不再等）；开口之后限时按这句剩下的长度重算，长句子不会被掐断。录音文件在静态资源里，但由 Worker 的 `handleVoiceClip` 应答（`wrangler.jsonc` 的 `run_worker_first` 里有 `/assets/room/voice/*`），因为静态资源层不支持 Range。
- 旅行国家、城市、日期、标题与媒体内容只能来自何鹏远本人确认；草稿不得进入公开 HTML、JSON、sitemap 或链接。
- 图片公开上传前必须生成去除 EXIF/GPS 的 WebP 公开版；视频必须有真实 poster 才能发布。
- 后台与 `/api/admin/*` 必须同时受 Cloudflare Access 和 Worker 端 JWT 签名、issuer、AUD、管理员邮箱校验保护。
- 公开接口和公开页面不得带后台登录邮箱或内部 id：文章走 `mapPublicArticle`，影像走 `mapPublicRow`；只有 `/api/admin/*` 返回完整记录。
- 后台只收 MP4 / WebM 视频，MOV 一律拒收并提示先导出为 MP4（H.264）：`media` 表的 CHECK 不含 `video/quicktime`，iPhone 的 MOV 常是 HEVC 且带拍摄地点。`src/media-store.js` 的 `MIME_TYPES` 必须是这张表 CHECK 的子集（校验脚本会查）。
- 后台改文章（保存、发布、转草稿）都带上读到时的 `updatedAt`（`expectedUpdatedAt`），服务端对不上就回 409，不让旧内容盖掉别处刚保存的新内容。
- 房间退回静态版时：这一次出的事（加载失败、帧率太低、渲染被中断）必须说明原因，访客以前关过提示也要显示（`showNotice` 的 `always`）；关掉提示只压住同一原因的开场说明。访客已经点了「静态版」之后后台场景再出事，只悄悄拆掉，不在静态页上弹提示。
- 房间左段：一张金丝楠木翘头案单独靠在左墙上（不和电脑桌排成一排），摆着九十年代的老物件和风水摆件：电风扇（可以点开关）、暖水瓶、搪瓷缸、铜葫芦、煤油灯（这张桌子的光源）、算盘、貔貅、双反相机、罗盘、文昌塔。桌子和桌上的东西按桌子自己的坐标摆在 `relics` 这一组里，`RELIC_AT` 是桌子在房间里的位置，挪桌子只改这一行，椅子和画跟着走。桌前配一把海南黄花梨（降香黄檀）的明式圈椅：椅圈是一根弯料，从扶手头绕过靠背连成一整圈（材质 `huali`，圆料用 `hualiRod`）；案上方的左墙挂牡丹图。后墙书架左边那一段是五帝钱和一本显示访客当天日期的挂历（星期用圆点表示，不用文字）。电脑桌前的椅子是金丝楠木的宫廷式圈椅。这些都是程序建模的装饰，不写任何履历事实；金丝楠木用 `nanmu` 这一个材质。
- 整个房间都是自由镜头：书桌视角下拖动旋转、滚轮 / 双指缩放、右键 / 双指平移的范围是同一套 `LIMIT`（左右各约 75°），镜头和它盯着的点都被夹在房间里。“视角”按钮依次是全景、电脑桌、书架、录音机、电视、老物件桌、放映员位；放映角另有特写和观众席两个机位（`controller.corner(1 / 2)`）。加宽或改房间尺寸后，`LEFT` / `RIGHT` 一改，镜头边界跟着变。
- 灯绳（天花板上的拉线开关，绳子垂在窗前）把房间在「雨夜」和「晴天午后」之间切换：点绳子、按 T、点「天色」按钮是同一个开关（`scene.js` 的 `toggleLight`），选择记在 `sessionStorage` 的 `hpy-room-light` 里，默认仍是雨夜。窗外的白天同样全由着色器画（`dayOutside`），不放照片、不指向任何真实地点。阳光是一盏带“窗格”贴图的聚光灯（`sun`，夜里强度为 0）：光斑的形状来自贴图而不是阴影，所以没有阴影的低画质也有；这盏灯必须从一开始就在场景里，灯的数量不变，切换时才不用重新编译着色器。白天界面要保持可读：`.room[data-light="day"]` 压深顶部衬底、加重底部提示的描边，悬停高亮跟着加强。改白天的亮度后，在电脑和手机两种尺寸下各看一眼。
- 出口登记表：首页上每个通往项目的链接带 `data-go="<id>"`（`href` 仍是真实地址，给无 JS 和搜索引擎看）；同一个 id 可以出现多次但地址必须一致。`scripts/build.mjs` 把它们汇成 `/projects.json`。Worker 的 `/go/<id>` 只认这张表：GET 跳转（外站带 `utm_source=hepengyuan.com` 等来源标记）并记数，POST 只记数；`/script.js` 在点击时发 `sendBeacon` 并给外站地址补标记。记数只到“哪个出口、哪一天、页面还是房间”（D1 的 `go_clicks`），不记访客；`/api/admin/go-stats` 可以查。新增项目入口就是在首页加一个带 `data-go` 的链接，不改 Worker。
- 放映机（房间右侧的放映角，按 R 或点放映机 / 幕布）：片子只来自首页带 `data-film` 的链接（必须是本站 `/media/` 下的地址）和 `#personal-film` 的宣传片；`data-film-next` 是放完推荐的下一盘，`data-film-exits` 是片尾给出的出口（`data-go` 的 id）。`room/` 里不写任何片子或项目的地址（校验脚本会查）。Aggie 的两部片子由 `src/worker.js` 的 `AGGIE_FILMS` 从 aggieai.me 代取（上游地址写死，Range 原样转发）；新增别的站的片子照这个办法加一条代取路由，或传到 R2。直达链接 `/?room=1&show=<片子 id>` 打开房间后直接到放映机前。
- 流畅版：放映机的每部片子在首页另外登记一个低码率版本（`data-film-lite`：Aggie 的两部写在链接上，宣传片写在 `#personal-film` 的 `<video>` 上）。文件是 360p、约 270 kbps，放在 R2，由 `src/worker.js` 的 `LITE_FILMS` 提供。国内不开 VPN 直连时，原版（1.3 Mbps 左右）常常一直停在「正在上片」，所以上片超过 5 秒（`LITE_AFTER`）、放到一半卡住超过 5 秒、或者原版报错时，放映机自动换成流畅版接着放（`useLite`），片名后面标「流畅版」；这次进房间换过一次，后面的片子直接从流畅版开始。新增或更换片子时流畅版要一起转码上传（`-vf scale=-2:360`、H.264 Main、`-b:v 230k -maxrate 300k`、单声道 AAC 40k、`-movflags +faststart`、`-map_metadata -1`），先传到 R2 再发布；校验脚本会查每部片子都登记了流畅版、Worker 里有对应路由。录像带（FILM）里的宣传片还没有接这条退路。
- 放映角是自由镜头：它在场景里仍是“书桌视角”，用 `deskPresets` 里 `CORNER_FIRST` 起的三个机位（放映员位、特写、观众席，`controller.corner(0 / 1 / 2)`）。选片、暂停、片尾的下一步和机位按钮在底部的 `.room-cinebar`，不盖幕布。电脑上影片是幕布前的一层视频贴图（`setWallVideo`），镜头怎么转它都在幕布上；手机和平板（`(pointer: coarse)`）因为把视频画进 3D 不可靠，放片时改成正对幕布、把 `<video>` 摆在幕布的位置（`watchOnScreen`）。放映机是一台程序建模的 16 毫米双片盘放映机：片盘上胶片的多少跟着播放进度变（`setFilmProgress`），运转时片盘转、带齿孔的胶片走、灯箱散热缝透光、镜头到幕布有一束带灰尘的光（`runProjector` 这段），同时把房间的灯压暗（`setProjector`），不改访客选的天色。灯箱那盏点光源和太阳一样从一开始就在场景里。
- 手机上的放映（`watchOnScreen`）：`play()` 的那一刻视频必须已经渲染在页面上。所以装视频的面板收起时不是 `display:none`，而是缩成看不见的一小点（`styles.css` 的 `.room-cinema[hidden]`）；片子一点就先把画面摆到幕布最后会在的位置（画面正中、占 82%，和 `poses.cinema` 的取景一致），再给地址、再 `play()`，镜头到位后用真实投影对齐。不要改回“镜头到了才显示”。被系统拦下播放时停在画面上提示「点画面播放」（`filmBlocked`）；上片超过 6 秒显示已等秒数并给出「直接打开影片」（`watchLoading`，地址就是首页登记的那个）；取不到时片名行带上 `E<代码>`（1 中断、2 网络、3 解码、4 格式）。
- 房间里第一个 Tab 停靠点是「静态版」跳转（`.room-skiplink`）；焦点在按钮或链接上时，Enter / 空格归那个控件，全局快捷键不得抢。快捷键挂在房间外壳上；重画一组按钮时把焦点留在那一组里（`setFilmState`、`playFilm`），焦点万一掉到 `body` 上，房间开着时由 `onStrayKey` 把按键接过来，否则 Esc 和空格会失灵。

## Deployment

网站使用 Cloudflare Workers Static Assets + D1 + R2。生产部署前必须：

1. 确认所有 canonical、sitemap、JSON-LD 和分享图链接都使用 `https://hepengyuan.com/`。
2. 运行 `npm run build`。
3. 确认 `wrangler.jsonc` 已替换真实 D1 ID，R2 bucket 已创建，Access issuer / AUD / 管理员邮箱已在生产环境配置。
4. 确认当前 HEAD 包含最新 `origin/main` 和线上生产提交。
5. 只运行 `npm run release`；不得直接绕过门禁调用 `wrangler deploy`。
6. 发布后实际请求 `/`、`/robots.txt`、`/sitemap.xml`、`/profile.json`、`/llms.txt`、`/api/media.json`、`/travel/`、`/learning/`、`/sitemap-media.xml`、`/media/music/` 下的每首音乐，三部流畅版影片（`/media/promo/pengyuan-personal-promo-360p.mp4`、`/media/aggie/learning-15s-360p.mp4`、`/media/aggie/brand-film-360p.mp4`），`/en/`、`/de/`、`/ko/`，以及 `/room/boot.js`、`/room/scene.js` 和 `/assets/vendor/` 下的 three.js。
7. 在真实浏览器里打开 `/` 确认 3D 房间能进入、能点物件跳到对应栏目；再打开 `/?room=0` 确认静态版，`/?room=1` 确认可以强制回到房间。

## Known gotchas

- 生产域名是 `hepengyuan.com`，公开资料中的 canonical URL 必须与它一致。
- `workers_dev` 和 `preview_urls` 必须保持关闭，避免绕过生产域名上的 Access。
- `.dev.vars` 仅供 localhost 显式启用 `ADMIN_DEV_BYPASS=true`，绝不能提交或部署。
- 没有域名和站长账号时，不能完成 Search Console、Bing Webmaster Tools 或 IndexNow 提交。
- Workers Static Assets 不理会 Range 请求（`bytes=0-1` 也整份返回 200，HEAD 也不带 `Content-Length`）。苹果要求给 iOS 播放的音视频支持分段请求，所以凡是要用 `<audio>` / `<video>` 播的文件，要么放 R2 由 `handleMediaFile` 提供，要么像小人录音那样在 `run_worker_first` 里登记、由 Worker 代答 206；`scripts/smoke-production.mjs` 的 `range: true` 检查的就是这一点。
- 房间的降级判断不要用 `navigator.connection.effectiveType === "3g"`：它按往返延迟估算，跨境访问时很多带宽正常的访客都会被报成 3g。
- 房间的帧率看门狗阈值必须低于 30fps：省电模式和部分移动浏览器会把刷新率锁在 30。
- 国内手机（尤其微信里）不开 VPN 直连 Cloudflare 时，房间约 230KB 的场景常要下十几秒。所以 `boot.js` 打开房间时用 modulepreload 把 three.js（`THREE_URL`，必须与 `scene.js` 的 import 一致）和 `scene.js` 并行预取；下载限时 30 秒、搭建限时 15 秒，超过 6 秒就显示“网络有点慢”和秒数，并给出「先看静态版」（只离开这一次，不记偏好）。失败时静态页提示会写明是下载超时、搭建超时还是哪条报错，让访客截图就能定位。不要再改回一个总的短限时。
- `styles.css`、`script.js`、`policy.css` 的网址在 `scripts/build.mjs` 里换成内容指纹（`?v=<sha256 前 10 位>`），`_headers` 让它们缓存一周；源文件里的 `?v=` 只是给人看的，不必手改。新增引用这三个文件的页面时，把它加进 `build.mjs` 的 `fingerprintedPages`。`room/` 下的三个脚本仍然靠手改版本号（见上）。
- 首页内联脚本给会进房间的访客先盖一层黑色遮罩（上面写着「正在布置房间…」，文字在 `styles.css` 里按 `:lang()` 给四种语言）。`boot.js` 超过 6 秒没到，遮罩自己撤掉并打上 `data-room-late`；晚到的 `boot.js` 看到它就不再打开房间，留在静态版并提示网络慢。
- 宣传片和音乐是固定路由，`handleMediaFile` 让浏览器缓存一天（`FIXED_MEDIA_CACHE`）；同一个 R2 键换文件后，访客最多一天内还会拿到旧文件。后台发布的影像仍然不缓存，转为草稿立即生效。
- 宣传片有两个版本：1080p（R2 `public/promo/pengyuan-personal-promo-1080p.mp4`，电脑用）和 720p（`public/promo/pengyuan-personal-promo-720p.mp4`，约 1.3 Mbps，手机用）。国内手机不开 VPN 直连 Cloudflare 时，1080p 的码率常常加载不动。首页用 `<source media>` 让手机选 720p，3D 房间按同样规则挑选；另有给放映机慢网络时用的 360p 流畅版（`public/promo/pengyuan-personal-promo-360p.mp4`，见「流畅版」一条）。换宣传片时三个文件都要重新编码上传（H.264、`-movflags +faststart`）。
