import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const outputDirectory = resolve(projectRoot, "dist");

if (outputDirectory !== `${projectRoot}/dist`) {
  throw new Error("Refusing to build outside the project dist directory.");
}

const publicFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "profile.json",
  "policy.css",
  "_headers",
  "_redirects",
];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of publicFiles) {
  await cp(resolve(projectRoot, file), resolve(outputDirectory, file));
}

await cp(resolve(projectRoot, "assets"), resolve(outputDirectory, "assets"), { recursive: true });
await cp(resolve(projectRoot, "samples"), resolve(outputDirectory, "samples"), { recursive: true });
await cp(resolve(projectRoot, "admin"), resolve(outputDirectory, "admin"), { recursive: true });
for (const page of ["terms", "policy", "faqs", "services", "room", "en", "de", "ko"]) {
  await cp(resolve(projectRoot, page), resolve(outputDirectory, page), { recursive: true });
}

/* 样式表和脚本的网址带内容指纹：内容不变网址不变，内容一变网址就变。
   所以 _headers 才敢让浏览器把它们缓存一周——回访时不用再为这两个文件各等一个来回（样式表还会挡住首屏）。
   源文件里的 ?v=… 只是给人看的；发布出去的页面一律换成指纹，忘了改版本号也不会让访客拿到旧样式。 */
const fingerprinted = ["styles.css", "script.js", "policy.css"];
const fingerprints = new Map();
for (const file of fingerprinted) {
  const digest = createHash("sha256").update(await readFile(resolve(outputDirectory, file))).digest("hex");
  fingerprints.set(file, digest.slice(0, 10));
}
const fingerprintedPages = ["index.html", "en/index.html", "de/index.html", "ko/index.html", "services/index.html", "policy/index.html", "terms/index.html", "faqs/index.html"];
const assetReference = /((?:href|src)=")\/(styles\.css|script\.js|policy\.css)(?:\?v=[^"]*)?"/g;
for (const page of fingerprintedPages) {
  const pagePath = resolve(outputDirectory, page);
  const source = await readFile(pagePath, "utf8");
  const rewritten = source.replace(assetReference, (_match, attribute, file) => `${attribute}/${file}?v=${fingerprints.get(file)}"`);
  if (!rewritten.includes(`/styles.css?v=${fingerprints.get("styles.css")}"`)) {
    throw new Error(`${page} does not reference the fingerprinted stylesheet.`);
  }
  await writeFile(pagePath, rewritten);
}

const html = await readFile(resolve(outputDirectory, "index.html"), "utf8");
if (!html.includes("https://hepengyuan.com/")) {
  throw new Error("Production canonical URL is missing from built HTML.");
}

/* hi-fi 房间：scene.js 里的 import 路径必须能在 dist 里找到，否则线上只会静默降级。 */
const roomScene = await readFile(resolve(outputDirectory, "room/scene.js"), "utf8");
const roomImport = roomScene.match(/from "(\/assets\/vendor\/[^"]+)"/)?.[1];
if (!roomImport) {
  throw new Error("Room scene does not import the self-hosted three.js build.");
}
await readFile(resolve(outputDirectory, `.${roomImport}`));
if (!html.includes('src="/room/boot.js')) {
  throw new Error("Room boot script is missing from built HTML.");
}

const s1Html = await readFile(resolve(outputDirectory, "samples/s1/index.html"), "utf8");
if (!s1Html.includes("把 AI 工具真正装进你的")) {
  throw new Error("S1 service sample content is missing from built HTML.");
}

const adminHtml = await readFile(resolve(outputDirectory, "admin/index.html"), "utf8");
if (!adminHtml.includes("上传并保存草稿") || !adminHtml.includes("noindex,nofollow")) {
  throw new Error("Protected media admin interface is missing from built assets.");
}

console.log(`Built ${publicFiles.length + 3} site entries in dist/.`);
