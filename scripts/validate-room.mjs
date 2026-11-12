/* hi-fi 版（3D 房间）的发布门禁。
   房间盖在静态首页之上，所以这里守的是三件事：
   1. 降级永远可用：首页仍然自带静态内容、提示条和 HI-FI 入口；
   2. CSP 约束不被破坏：只从本站加载脚本，不靠内联样式或 eval；
   3. 房间里出现的履历与首页逐字一致，不在 3D 场景里新增任何事实。 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

const THREE_PATH = "assets/vendor/three-0.170.0.module.min.js";
/* 来自 npm three@0.170.0 的 build/three.module.min.js，下载时已核对过 tarball 的 sha512。 */
const THREE_SHA256 = "08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7";

const failures = [];
const fail = (message) => failures.push(message);

for (const file of ["room/boot.js", "room/scene.js", THREE_PATH, "assets/vendor/three-LICENSE.txt"]) {
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
  for (const [name, source] of [["room/boot.js", boot], ["room/scene.js", scene]]) {
    if (/https?:\/\//.test(source)) fail(`${name}: must not reference external URLs (CSP is script-src 'self')`);
    if (/\beval\s*\(|new\s+Function\s*\(/.test(source)) fail(`${name}: eval / new Function is blocked by the site CSP`);
    if (/\.innerHTML\b|setAttribute\(\s*["']style["']|\.cssText\b|createElement\(\s*["']style["']/.test(source)) {
      fail(`${name}: inline styles / innerHTML are not allowed (CSP is style-src 'self')`);
    }
  }

  /* ---- 首页接线与版本号 */
  const bootTag = html.match(/<script src="\/room\/boot\.js\?v=([\w-]+)" defer><\/script>/);
  if (!bootTag) fail("index.html: deferred /room/boot.js script tag is missing");
  const sceneVersion = boot.match(/const SCENE_URL = "\/room\/scene\.js\?v=([\w-]+)";/)?.[1];
  if (!sceneVersion) fail("room/boot.js: SCENE_URL must point at /room/scene.js with a ?v= version");
  if (bootTag && sceneVersion && bootTag[1] !== sceneVersion) {
    fail(`room version mismatch: index.html loads boot.js?v=${bootTag[1]} but boot.js loads scene.js?v=${sceneVersion}`);
  }

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
  if (!/@media print\{[^}]*\.room\{display:none !important\}/.test(css.replace(/\n\s*/g, ""))
    && !/\.room\{display:none !important\}/.test(css)) {
    fail("styles.css: the room overlay must be hidden when printing");
  }

  /* ---- 热点必须指向真实存在的栏目 */
  const hotspotBlock = scene.match(/export const HOTSPOTS = \[([\s\S]*?)\n\];/)?.[1] ?? "";
  const hotspotLinks = [...hotspotBlock.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]);
  if (hotspotLinks.length < 5) fail("room/scene.js: HOTSPOTS list could not be read");
  const workerRoutes = new Set(["/aggie-3a/"]);
  for (const href of hotspotLinks) {
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
