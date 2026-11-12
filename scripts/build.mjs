import { cp, mkdir, readFile, rm } from "node:fs/promises";
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
for (const page of ["terms", "policy", "faqs", "services", "room"]) {
  await cp(resolve(projectRoot, page), resolve(outputDirectory, page), { recursive: true });
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
