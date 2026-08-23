import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();

const publicFiles = ["index.html", "robots.txt", "sitemap.xml", "profile.json", "llms.txt"];
const projectFiles = await readdir(process.cwd(), { recursive: true });
const wranglerConfig = await readFile("wrangler.jsonc", "utf8");

for (const file of publicFiles) {
  const content = await readFile(file, "utf8");
  if (content.includes(".example")) throw new Error(`${file} still contains a placeholder domain.`);
  if (!content.includes("hepengyuan.top")) throw new Error(`${file} does not reference hepengyuan.top.`);
}

if (
  projectFiles.some(
    (file) =>
      file === ".env" ||
      (file.startsWith(".env.") && file !== ".env.example") ||
      file === ".dev.vars" ||
      (file.startsWith(".dev.vars.") && file !== ".dev.vars.example"),
  )
) {
  throw new Error("Local environment files are present in the project. Remove them before release.");
}

if (/REPLACE_WITH|YOUR_TEAM|00000000-0000-0000-0000-000000000000/.test(wranglerConfig)) {
  throw new Error("wrangler.jsonc still contains a Cloudflare placeholder. Provision D1 and fill the production binding first.");
}

if (/"ADMIN_DEV_BYPASS"\s*:/.test(wranglerConfig)) {
  throw new Error("ADMIN_DEV_BYPASS must never be configured in wrangler.jsonc for production.");
}

for (const requiredConfig of [
  '"directory": "./dist"',
  '"workers_dev": false',
  '"preview_urls": false',
  '"binding": "MEDIA_DB"',
  '"binding": "MEDIA_BUCKET"',
  '"pattern": "hepengyuan.top"',
  '"PUBLIC_SITE_URL": "https://hepengyuan.top"',
]) {
  if (!wranglerConfig.includes(requiredConfig)) {
    throw new Error(`wrangler.jsonc is missing release requirement: ${requiredConfig}`);
  }
}

const status = run("git", ["status", "--porcelain"]);
if (status) {
  throw new Error("Git working tree is not clean. Review and commit the exact release files first.");
}

const head = run("git", ["rev-parse", "HEAD"]);
const remotes = run("git", ["remote"]);
const allowFirstDeploy = process.env.ALLOW_FIRST_DEPLOY === "true";
const currentProductionPlatform = String(process.env.CURRENT_PRODUCTION_PLATFORM || "").toLowerCase();

if (remotes.split("\n").includes("origin")) {
  execFileSync("git", ["fetch", "origin"], { stdio: "inherit" });
  const originMain = run("git", ["rev-parse", "--verify", "origin/main"]);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", originMain, head], { stdio: "ignore" });
  } catch {
    throw new Error("HEAD does not contain the latest origin/main.");
  }
} else {
  throw new Error("No origin remote exists. Add origin before any production deployment so origin/main can be verified.");
}

if (!["none", "pages", "worker"].includes(currentProductionPlatform)) {
  throw new Error("CURRENT_PRODUCTION_PLATFORM must be one of: none, pages, worker.");
}

if (currentProductionPlatform === "none" && !allowFirstDeploy) {
  throw new Error("A confirmed first deployment requires CURRENT_PRODUCTION_PLATFORM=none and ALLOW_FIRST_DEPLOY=true.");
}

if (currentProductionPlatform !== "none" && allowFirstDeploy) {
  throw new Error("ALLOW_FIRST_DEPLOY cannot be used when a Pages or Worker production deployment already exists.");
}

if (currentProductionPlatform === "pages") {
  if (process.env.PAGES_TO_WORKER_CUTOVER_CONFIRMED !== "true") {
    throw new Error("Pages → Worker cutover requires PAGES_TO_WORKER_CUTOVER_CONFIRMED=true.");
  }

  let rollbackUrl;
  try {
    rollbackUrl = new URL(process.env.PAGES_ROLLBACK_URL);
  } catch {
    throw new Error("PAGES_ROLLBACK_URL must be the verified HTTPS pages.dev deployment snapshot.");
  }
  if (rollbackUrl.protocol !== "https:" || !rollbackUrl.hostname.endsWith(".pages.dev")) {
    throw new Error("PAGES_ROLLBACK_URL must be the verified HTTPS pages.dev deployment snapshot.");
  }

  const rollbackResponse = await fetch(rollbackUrl, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
  if (!rollbackResponse.ok) {
    throw new Error(`Pages rollback snapshot is unavailable: ${rollbackUrl.href} returned ${rollbackResponse.status}.`);
  }
  const rollbackBody = await rollbackResponse.text();
  if (!rollbackBody.includes("何鹏远") || !rollbackBody.includes("hepengyuan.top")) {
    throw new Error("Pages rollback snapshot does not contain the expected 何鹏远 site identity and canonical domain.");
  }
  console.log(`Cutover guard: verified Pages rollback snapshot ${rollbackUrl.href}.`);
}

const productionCommit = process.env.PRODUCTION_COMMIT_SHA;
if (productionCommit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", productionCommit, head], { stdio: "ignore" });
  } catch {
    throw new Error("HEAD does not contain the currently deployed production commit.");
  }
  console.log(`Production guard: HEAD contains ${productionCommit.slice(0, 12)}.`);
} else if (currentProductionPlatform === "none" && allowFirstDeploy) {
  console.log("Production guard: explicit first-deployment mode confirms that no previous production commit exists.");
} else {
  throw new Error("PRODUCTION_COMMIT_SHA is required so HEAD can be checked against the currently deployed version.");
}

console.log(`Release preflight passed at ${head.slice(0, 12)} for https://hepengyuan.top/.`);
