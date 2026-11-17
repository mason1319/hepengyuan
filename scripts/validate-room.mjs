/* hi-fi 版（3D 房间）的发布门禁。
   房间盖在静态首页之上，所以这里守的是三件事：
   1. 降级永远可用：首页仍然自带静态内容、提示条和 HI-FI 入口；
   2. CSP 约束不被破坏：只从本站加载脚本，不靠内联样式或 eval；
   3. 房间里出现的履历与首页逐字一致，不在 3D 场景里新增任何事实。 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";

const THREE_PATH = "assets/vendor/three-0.170.0.module.min.js";
/* 来自 npm three@0.170.0 的 build/three.module.min.js，下载时已核对过 tarball 的 sha512。 */
const THREE_SHA256 = "08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7";

const failures = [];
const fail = (message) => failures.push(message);

for (const file of ["room/boot.js", "room/scene.js", "room/avatar.js", THREE_PATH, "assets/vendor/three-LICENSE.txt"]) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) fail(`${file}: missing or empty`);
  } catch {
    fail(`${file}: missing`);
  }
}

if (failures.length === 0) {
  const html = await readFile("index.html", "utf8");
  const css = await readFile("styles.css", "utf8");
  const boot = await readFile("room/boot.js", "utf8");
  const scene = await readFile("room/scene.js", "utf8");
  const avatar = await readFile("room/avatar.js", "utf8");
  const worker = await readFile("src/worker.js", "utf8");
  const three = await readFile(THREE_PATH);

  if (three.length >= 1_000_000) fail(`${THREE_PATH}: vendored library must stay below 1 MB`);
  if (createHash("sha256").update(three).digest("hex") !== THREE_SHA256) {
    fail(`${THREE_PATH}: does not match the pinned three@0.170.0 build; re-vendor it and update THREE_SHA256 together`);
  }

  for (const file of ["room/boot.js", "room/scene.js"]) {
    try {
      execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
    } catch (error) {
      fail(`${file}: syntax error (${String(error.stderr || error.message).split("\n")[0]})`);
    }
  }

  /* ---- 只从本站加载 */
  const imports = [...scene.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((match) => match[1]);
  if (imports.length !== 1 || imports[0] !== `/${THREE_PATH}`) {
    fail(`room/scene.js: must import only /${THREE_PATH} (found ${JSON.stringify(imports)})`);
  }
  /* 小人模块不自己 import three.js：由 scene.js 通过 host 交进去，保证是同一份。 */
  if (/^\s*import\s/m.test(avatar)) fail("room/avatar.js: must not import anything; three.js comes in through the host from scene.js");
  if (!/export function start\(/.test(avatar)) fail("room/avatar.js: must export start()");
  /* node --check 把 .js 当脚本解析，认不出 export：按模块语法检查。 */
  try {
    execFileSync(process.execPath, ["--input-type=module", "--check"], { input: avatar, stdio: "pipe" });
  } catch (error) {
    fail(`room/avatar.js: syntax error (${String(error.stderr || error.message).split("\n").find((line) => /Error/.test(line)) || "see node --check"})`);
  }
  for (const [name, source] of [["room/boot.js", boot], ["room/scene.js", scene], ["room/avatar.js", avatar]]) {
    if (/https?:\/\//.test(source)) fail(`${name}: must not reference external URLs (CSP is script-src 'self')`);
    if (/\beval\s*\(|new\s+Function\s*\(/.test(source)) fail(`${name}: eval / new Function is blocked by the site CSP`);
    if (/\.innerHTML\b|setAttribute\(\s*["']style["']|\.cssText\b|createElement\(\s*["']style["']/.test(source)) {
      fail(`${name}: inline styles / innerHTML are not allowed (CSP is style-src 'self')`);
    }
  }

  /* ---- 预取的 three.js 必须就是 scene.js import 的那个文件，否则预取白下、下载也不会并行 */
  const preloadThree = boot.match(/const THREE_URL = "([^"]+)";/)?.[1];
  if (preloadThree !== `/${THREE_PATH}`) fail(`room/boot.js: THREE_URL must be /${THREE_PATH} so it preloads the file scene.js imports (found ${preloadThree})`);

  /* ---- 首页接线与版本号 */
  const bootTag = html.match(/<script src="\/room\/boot\.js\?v=([\w-]+)" defer><\/script>/);
  if (!bootTag) fail("index.html: deferred /room/boot.js script tag is missing");
  const sceneVersion = boot.match(/const SCENE_URL = "\/room\/scene\.js\?v=([\w-]+)";/)?.[1];
  if (!sceneVersion) fail("room/boot.js: SCENE_URL must point at /room/scene.js with a ?v= version");
  if (bootTag && sceneVersion && bootTag[1] !== sceneVersion) {
    fail(`room version mismatch: index.html loads boot.js?v=${bootTag[1]} but boot.js loads scene.js?v=${sceneVersion}`);
  }
  const avatarVersion = boot.match(/const AVATAR_URL = "\/room\/avatar\.js\?v=([\w-]+)";/)?.[1];
  if (!avatarVersion) fail("room/boot.js: AVATAR_URL must point at /room/avatar.js with a ?v= version");
  if (avatarVersion && sceneVersion && avatarVersion !== sceneVersion) {
    fail(`room version mismatch: boot.js loads scene.js?v=${sceneVersion} but avatar.js?v=${avatarVersion}`);
  }

  /* ---- 小人说话只能用本人录音：登记在 VOICE 里的每句都要有对应文件，单个文件小于 1MB */
  const voiceIds = [...(avatar.match(/const VOICE = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? "").matchAll(/"([\w-]+)"/g)].map((match) => match[1]);
  for (const id of voiceIds) {
    try {
      const info = await stat(`assets/room/voice/${id}.mp3`);
      if (info.size >= 1_000_000) fail(`assets/room/voice/${id}.mp3: voice clips must stay below 1 MB`);
    } catch {
      fail(`room/avatar.js: VOICE lists "${id}" but assets/room/voice/${id}.mp3 is missing`);
    }
  }
  /* 助理胡以沫只用她本人的录音：文件名带 yimo- 前缀，登记在 AIDE_VOICE 里。id 必须是一句真的会出声的台词
     （hi，或 组名 + 序号）；她自己冒出来的话（giveWay）只出文字，不该有录音。 */
  const aideVoiceBlock = avatar.match(/const AIDE_VOICE = new Set\(\[([\s\S]*?)\]\);/)?.[1];
  if (aideVoiceBlock === undefined || !avatar.includes('const AIDE_VOICE_PREFIX = "yimo-";')) {
    fail("room/avatar.js: AIDE_VOICE (the assistant's own recordings, files named yimo-<id>.mp3) could not be read");
  }
  const aideVoiceIds = [...(aideVoiceBlock ?? "").matchAll(/"([\w-]+)"/g)].map((match) => match[1]);
  const aideZh = avatar.match(/const AIDE_LINES = \{\n  zh: \{([\s\S]*?)\n  \},/)?.[1] ?? "";
  const aideSpoken = new Set(["hi"]);
  for (const group of ["chat", "fuss", "held", "freed", "scold", "escort", "bossHeld"]) {
    const lines = aideZh.match(new RegExp(`\\n    ${group}: \\[([\\s\\S]*?)\\],`))?.[1] ?? "";
    const count = (lines.match(/"(?:[^"\\]|\\.)*"/g) || []).length;
    if (!count) fail(`room/avatar.js: AIDE_LINES.zh.${group} could not be read`);
    for (let index = 1; index <= count; index += 1) aideSpoken.add(`${group}${index}`);
  }
  for (const id of aideVoiceIds) {
    if (!aideSpoken.has(id)) {
      fail(`room/avatar.js: AIDE_VOICE lists "${id}", which is not a line the assistant says aloud (hi, or group + number from AIDE_LINES; giveWay stays text-only)`);
      continue;
    }
    try {
      const info = await stat(`assets/room/voice/yimo-${id}.mp3`);
      if (info.size >= 1_000_000) fail(`assets/room/voice/yimo-${id}.mp3: voice clips must stay below 1 MB`);
    } catch {
      fail(`room/avatar.js: AIDE_VOICE lists "${id}" but assets/room/voice/yimo-${id}.mp3 is missing`);
    }
  }
  /* 反过来也一样：目录里不放没登记的录音（多半是切错的或被替换掉的），免得发布出去没人用。 */
  const voiceFiles = new Set([...voiceIds, ...aideVoiceIds.map((id) => `yimo-${id}`)]);
  for (const file of await readdir("assets/room/voice").catch(() => [])) {
    if (file.startsWith(".")) continue;
    if (!file.endsWith(".mp3") || !voiceFiles.has(file.slice(0, -4))) {
      fail(`assets/room/voice/${file}: not listed in VOICE or AIDE_VOICE in room/avatar.js (only registered .mp3 clips belong here)`);
    }
  }
  /* 两个人的声音不能串：他的录音 id 不带 yimo- 前缀。 */
  for (const id of voiceIds) {
    if (id.startsWith("yimo-")) fail(`room/avatar.js: VOICE lists "${id}"; the yimo- prefix is reserved for the assistant's own recordings (AIDE_VOICE)`);
  }
  /* ---- 房间里的图片（照片、挂画）：场景引用的每一张都要在仓库里，WebP，单张小于 1MB */
  const roomPictures = [...new Set([...scene.matchAll(/"\/assets\/room\/([\w-]+\.\w+)"/g)].map((match) => match[1]))];
  if (roomPictures.length < 3) fail("room/scene.js: the room pictures could not be read");
  for (const file of roomPictures) {
    if (!file.endsWith(".webp")) fail(`room/scene.js: room pictures must be WebP (${file})`);
    try {
      const info = await stat(`assets/room/${file}`);
      if (info.size >= 1_000_000) fail(`assets/room/${file}: room pictures must stay below 1 MB`);
    } catch {
      fail(`room/scene.js: /assets/room/${file} is referenced but the file is missing`);
    }
  }
  if (/speechSynthesis|SpeechSynthesisUtterance/.test(avatar)) fail("room/avatar.js: the avatars only speak with their own recorded clips (He Pengyuan's, and the assistant's own); do not use speech synthesis");

  for (const key of ["hpy-room", "hpy-room-seen"]) {
    if (!html.includes(`"${key}"`) || !boot.includes(`"${key}"`)) {
      fail(`storage key "${key}" must be used by both the inline pre-check in index.html and room/boot.js`);
    }
  }

  /* ---- 降级路径：没有 JS / WebGL 时首页必须仍然完整 */
  for (const [pattern, message] of [
    [/<div class="ph-warn" id="bm-warn"[^>]*\bhidden\b/, "static-version notice #bm-warn must exist and start hidden"],
    [/<p class="ph-warn-a" id="bm-try" hidden><a href="\/\?room=1">/, "retry link #bm-try must exist and start hidden"],
    [/<a class="ph-room" href="\/\?room=1" data-room[^>]*\bhidden\b/, "HI-FI pill must exist and start hidden"],
    [/<main id="top">/, "main#top is the room's ENTER target"],
  ]) {
    if (!pattern.test(html)) fail(`index.html: ${message}`);
  }
  if (/<html[^>]*data-room/.test(html)) fail("index.html: data-room must never be server-rendered; it is set by script only");
  if (!css.includes('html[data-room="boot"] body::before')) fail("styles.css: boot cover rule for html[data-room] is missing");
  /* 黑色遮罩上要有字；遮罩超时撤掉后晚到的 boot.js 不能再把静态页盖住。 */
  if (!css.includes('html[data-room="boot"] body::after{content:"')) fail("styles.css: the boot cover must say what the visitor is waiting for");
  if (!html.includes('"data-room-late"') || !boot.includes('"data-room-late"')) {
    fail("index.html and room/boot.js must both use data-room-late so a late boot.js does not cover the static page");
  }
  /* 这一次出了事退回静态版，必须说明原因：关过提示也不能让它永久沉默。 */
  if (/NOTICE_KEY\) === "off"\) return/.test(boot) || !boot.includes("showNotice(reason, canRetry, detail, true)")) {
    fail("room/boot.js: a dismissed notice must not silence the reason for a failure that just happened");
  }
  /* 从别的页面返回、整页重载、失败退出之后，历史记录里不能留着会自己弹出来的视图标记。 */
  if ((boot.match(/dropRoomHistory\(\)/g) || []).length < 3) fail("room/boot.js: the room's history marker must be cleared on load and on teardown");
  if (!/pageshow[\s\S]{0,600}openView\("desk"\)/.test(boot)) fail("room/boot.js: a bfcache restore must return to the desk through openView");
  /* 灯绳（雨夜 / 晴天午后）：窗外全用着色器画，不加载图片；绳子、按键、按钮是同一个开关，四种语言都有说明。 */
  const sceneSource = scene;
  for (const token of ["uniform float uDay;", "uniform float uWet;", 'cord: { label: "LIGHT"', "sun.map = canvasTexture(", "toggleLight,"]) {
    if (!sceneSource.includes(token)) fail(`room/scene.js: the day / night switch is missing ${token}`);
  }
  if (!boot.includes('"hpy-room-light"') || !boot.includes('key === "t" && view === "desk"') || !boot.includes("room-light")) {
    fail("room/boot.js: the light switch needs its session key, the T shortcut and the on-screen button");
  }
  if ((boot.match(/light: \{ day: "/g) || []).length !== 4 || (boot.match(/, light: "/g) || []).length !== 4) {
    fail("room/boot.js: every language needs the light button's label and its day / night description");
  }
  if (!css.includes('.room[data-light="day"] .room-hud')) fail("styles.css: the daytime room needs a darker scrim behind the top navigation");
  /* 放映机：片子只来自首页登记（data-film，本站地址），出口只来自 data-go；room/ 里不写任何片子或项目的地址。 */
  for (const [name, source] of [["room/boot.js", boot], ["room/scene.js", scene]]) {
    if (/aggieai\.me|\/media\/aggie\/|beimingquant|listingforge/.test(source)) fail(`${name}: project and film addresses must come from the homepage registry, not from room code`);
  }
  const filmTags = [...html.matchAll(/<a\b[^>]*\bdata-film="([a-z0-9-]+)"[^>]*>/g)];
  const filmIds = new Set(filmTags.map((match) => match[1]));
  if (!filmTags.length) fail("index.html: the projector needs at least one data-film link");
  for (const [tag, id] of filmTags) {
    if (!/\bhref="\/media\/[^"]+"/.test(tag)) fail(`index.html: film "${id}" must be served from this site under /media/`);
    /* 流畅版（慢网络时放映机自动换成它）：同样只能是本站 /media/ 下的地址，并且 Worker 里要有这条固定路由。 */
    const lite = /\bdata-film-lite="([^"]*)"/.exec(tag)?.[1];
    if (!lite) fail(`index.html: film "${id}" needs a data-film-lite version for slow connections`);
    else if (!/^\/media\/[a-z0-9/-]+-360p\.mp4$/.test(lite) || !worker.includes(`["${lite}", "public/`)) {
      fail(`index.html: the data-film-lite of "${id}" must be a /media/…-360p.mp4 address registered in LITE_FILMS in src/worker.js`);
    }
    const next = /\bdata-film-next="([^"]*)"/.exec(tag)?.[1];
    if (next && !filmIds.has(next)) fail(`index.html: film "${id}" names a next film that is not registered: ${next}`);
    for (const exit of (/\bdata-film-exits="([^"]*)"/.exec(tag)?.[1] || "").split(/\s+/).filter(Boolean)) {
      if (!html.includes(`data-go="${exit}"`)) fail(`index.html: film "${id}" names an exit that is not registered: ${exit}`);
    }
  }
  /* 宣传片的流畅版登记在首页那个 <video> 上。 */
  const promoLite = /<video\b[^>]*\bdata-film-lite="([^"]*)"/.exec(html)?.[1];
  if (!promoLite || !worker.includes(`["${promoLite}", "public/`)) fail("index.html: the promo <video> needs a data-film-lite address registered in LITE_FILMS in src/worker.js");
  if (!boot.includes("dataset.filmLite") || !boot.includes("function useLite(")) fail("room/boot.js: the projector must fall back to the data-film-lite version when a film is slow to start");
  if (!boot.includes('document.querySelectorAll("main a[data-film]")') || !scene.includes('cinema: "wall"') || !scene.includes("setProjector")) {
    fail("the projector view must read its films from the homepage and be backed by the wall screen in the scene");
  }
  if ((boot.match(/      cinema: \{ name: "/g) || []).length !== 4) fail("room/boot.js: every language needs the projector strings");
  /* 小人：带逛的每一站都要在场景里登记落脚点，并且四种语言都有介绍；它能替访客做的事要在启动器里接住。 */
  const avatarSource = await readFile("room/avatar.js", "utf8");
  const tourIds = [...(avatarSource.match(/const TOUR = \[([\s\S]*?)\n\];/)?.[1] ?? "").matchAll(/\["([a-z]+)"/g)].map((match) => match[1]);
  if (tourIds.length < 10) fail("room/avatar.js: the guided tour list could not be read");
  const perchBlock = scene.match(/const perches = \{([\s\S]*?)\n  \};/)?.[1] ?? "";
  for (const id of tourIds) {
    if (!new RegExp(`\\n\\s+${id}: \\{ pos:`).test(perchBlock)) fail(`room/scene.js: the tour stop "${id}" has no perch for the avatar`);
    if ((avatarSource.match(new RegExp(`\\n      ${id}: "`, "g")) || []).length !== 4) fail(`room/avatar.js: the tour stop "${id}" needs its line in all four languages`);
  }
  for (const [, , action] of (avatarSource.match(/const STOP_ACTIONS = \{([^}]*)\}/)?.[1] ?? "").matchAll(/(\w+): \["\w+", "(\w+)"\]/g)) {
    if (!boot.includes(`id === "${action}"`)) fail(`room/boot.js: guideAct does not handle the avatar action "${action}"`);
  }
  /* 助理胡以沫（坐小飞机的第二个小人）：四种语言的台词要齐、句数一致；她是个小朋友，台词里不能有脏话；
     她停飞机的地方要是场景里登记过的落脚点；她和飞机都不能带灯（房间里灯的数量不能变）；悬停提示四种语言都要有。 */
  const aideBlock = avatarSource.match(/const AIDE_LINES = \{([\s\S]*?)\n\};/)?.[1] ?? "";
  const aideShape = ["zh", "en", "de", "ko"].map((lang) => {
    const block = aideBlock.match(new RegExp(`\\n  ${lang}: \\{([\\s\\S]*?)\\n  \\},`))?.[1] ?? "";
    return [...block.matchAll(/\n    (\w+): (\[[\s\S]*?\n?\s*\]|"[^"\n]*"),/g)]
      .map((entry) => `${entry[1]}:${(entry[2].match(/"(?:[^"\\]|\\.)*"/g) || []).length}`)
      .join(" ");
  });
  if (!aideShape[0] || !/\bchat:\d/.test(aideShape[0])) fail("room/avatar.js: the assistant's lines (AIDE_LINES) could not be read");
  aideShape.forEach((shape, index) => {
    if (shape !== aideShape[0]) fail(`room/avatar.js: AIDE_LINES.${["zh", "en", "de", "ko"][index]} must have the same lines as AIDE_LINES.zh (${shape || "missing"} vs ${aideShape[0]})`);
  });
  const rude = aideBlock.match(/卧槽|我靠|妈的|他妈|牛逼|傻逼|操你|\b(?:fuck\w*|shit\w*|crap|damn\w*|hell|bloody|ass|asshole|bitch\w*)\b|scheiß|scheiss|verdammt|zum teufel|\barsch|씨발|젠장|제기랄|망할|지랄/i);
  if (rude) fail(`room/avatar.js: the assistant is a child and never swears; remove "${rude[0]}" from AIDE_LINES`);
  const padIds = [...(avatarSource.match(/const PADS = \[([^\]]*)\];/)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
  if (!padIds.length) fail("room/avatar.js: the assistant's landing spots (PADS) could not be read");
  for (const id of padIds) {
    if (!new RegExp(`\\n\\s+${id}: \\{ pos:[^\\n]*stand: true`).test(perchBlock)) fail(`room/scene.js: the assistant's landing spot "${id}" must be a perch she can stand on`);
  }
  if (/new THREE\.\w*Light\(/.test(avatarSource)) fail("room/avatar.js: the avatars must not add lights (the number of lights in the room is fixed); use emissive materials");
  if (!/\n  aide: \{ label: "/.test(scene)) fail("room/scene.js: ACTIONS needs the hover label for the assistant (aide)");
  if ((boot.match(/ aide: "/g) || []).length !== 3) fail("room/boot.js: the assistant's hover hint (hotspots.aide) is needed in English, German and Korean");
  if (!css.includes(".room-say.is-aide{") || !css.includes(".say-who{")) fail("styles.css: the assistant's speech bubble styles are missing");
  if (!boot.includes("room-skiplink") || !css.includes(".room-skiplink:focus{")) fail("the room needs a keyboard skip link to the static version as its first Tab stop");
  if (!/@media print\{[^}]*\.room\{display:none !important\}/.test(css.replace(/\n\s*/g, ""))
    && !/\.room\{display:none !important\}/.test(css)) {
    fail("styles.css: the room overlay must be hidden when printing");
  }

  /* ---- 热点：要么在房间里打开一个视图，要么离开房间去一个真实存在的地方 */
  const hotspotBlock = scene.match(/export const HOTSPOTS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const hotspotEntries = [...hotspotBlock.matchAll(/\{([^}]*)\}/g)].map((match) => ({
    id: match[1].match(/id:\s*"([^"]+)"/)?.[1],
    view: match[1].match(/view:\s*"([^"]+)"/)?.[1],
    href: match[1].match(/href:\s*"([^"]+)"/)?.[1],
  }));
  if (hotspotEntries.length < 5) fail("room/scene.js: HOTSPOTS list could not be read");
  const workerRoutes = new Set(["/aggie-3a/"]);
  for (const { id, view, href } of hotspotEntries) {
    if (!id || (!view && !href)) fail(`room hotspot ${id ?? "?"}: needs an id and either a view or an href`);
    if (view && !new RegExp(`view: "${view}"`).test(boot)) fail(`room hotspot ${id}: room/boot.js has no NAV entry for view "${view}"`);
    if (view && !new RegExp(`function build${view[0].toUpperCase()}${view.slice(1)}\\(`).test(boot)) fail(`room hotspot ${id}: room/boot.js has no panel builder for view "${view}"`);
    if (!href) continue;
    if (!new RegExp(`${id}: "${href.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"`).test(boot)) {
      fail(`room hotspot ${id}: room/boot.js LEAVE_LINKS must send it to ${href}`);
    }
    if (href.startsWith("#")) {
      if (!new RegExp(`\\bid="${href.slice(1)}"`).test(html)) fail(`room hotspot ${href}: no element with that id in index.html`);
    } else if (!workerRoutes.has(href)) {
      try {
        await stat(`${href.replace(/^\/|\/$/g, "")}/index.html`);
      } catch {
        fail(`room hotspot ${href}: no such page in the repository`);
      }
    }
  }

  /* ---- 房间面板的内容全部取自首页：这些栏目和结构必须还在 */
  for (const [pattern, message] of [
    [/<h1[^>]*>/, "an h1 (ABOUT heading)"],
    [/class="pb-dek"/, ".pb-dek (ABOUT summary)"],
    [/<section class="pb-item" id="aggie-role"/, "#aggie-role (ABOUT current role)"],
    [/class="pb-note"/, ".pb-note (ABOUT AI timeline)"],
    [/<section id="work"/, "#work (WORK notepad)"],
    [/class="pb-lbl pb-grp">Projects</, "the Projects divider inside #work"],
    [/<section id="posts"/, "#posts (POSTS teletext)"],
    [/class="pb-idx"/, ".pb-idx post list"],
    [/<section id="contact"/, "#contact (ONLINE phone)"],
    [/class="on-hd"/, ".on-hd contact rows"],
    [/data-contact-note/, "[data-contact-note] copy status"],
    [/<section id="personal-film"[\s\S]*?<source src="\/media\/promo\/[^"]+"/, "the #personal-film video source (FILM promo tape)"],
    [/<span data-film-title><b>片名<\/b>/, "the data-film-title caption in #personal-film (FILM tape title)"],
    [/<section id="music"[\s\S]*?data-music[\s\S]*?data-music-title[\s\S]*?<source src="\/media\/music\/[^"]+\.mp3"/, "#music [data-music] items with a title and a /media/music/ source (MUSIC cassettes)"],
    [/class="pb-lbl pb-grp"/, "the Projects divider in #work (bookshelf work books)"],
    [/<section id="card"[\s\S]*?data-card-name[\s\S]*?data-card-service[\s\S]*?data-card-contact[\s\S]*?data-card-qr/, "#card front/back fields (desk business card)"],
  ]) {
    if (!pattern.test(html)) fail(`index.html: room panels read ${message}, which is missing`);
  }

  /* ---- 墙上的年份卡片必须与首页 Work 区逐字一致 */
  const timelineBlock = scene.match(/const TIMELINE = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const timeline = [...timelineBlock.matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map((match) => [match[1], match[2]]);
  if (timeline.length === 0) fail("room/scene.js: TIMELINE could not be read");
  const workSection = html.match(/<section id="work"[\s\S]*?<p class="pb-lbl pb-grp">/)?.[0] ?? "";
  const workHeads = [...workSection.matchAll(/<div class="pb-hd">([\s\S]*?)<\/div>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, "\u0000").split("\u0000").map((part) => part.trim()).filter(Boolean));
  for (const [year, caption] of timeline) {
    const found = workHeads.some((parts) => parts.includes(caption) && parts.includes(year));
    if (!found) fail(`room timeline card "${year} / ${caption}" does not match any entry in the homepage Work section`);
  }
}

if (failures.length > 0) {
  console.error("Room validation failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Room validation passed: vendored three.js pin, same-origin loading, static fallback, hotspot targets, and timeline parity.");
