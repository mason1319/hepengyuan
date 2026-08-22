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

const html = await readFile(resolve(outputDirectory, "index.html"), "utf8");
if (!html.includes("https://hepengyuan.top/")) {
  throw new Error("Production canonical URL is missing from built HTML.");
}

console.log(`Built ${publicFiles.length + 1} public entries in dist/.`);

