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

const html = await readFile(resolve(outputDirectory, "index.html"), "utf8");
if (!html.includes("https://hepengyuan.top/")) {
  throw new Error("Production canonical URL is missing from built HTML.");
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
