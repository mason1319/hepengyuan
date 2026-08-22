import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";

const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();

const publicFiles = ["index.html", "robots.txt", "sitemap.xml", "profile.json", "llms.txt"];
const projectFiles = await readdir(process.cwd(), { recursive: true });

for (const file of publicFiles) {
  const content = await readFile(file, "utf8");
  if (content.includes(".example")) throw new Error(`${file} still contains a placeholder domain.`);
  if (!content.includes("hepengyuan.top")) throw new Error(`${file} does not reference hepengyuan.top.`);
}

if (projectFiles.some((file) => file === ".env" || file.startsWith(".env."))) {
  throw new Error("Environment files are present in the project. Remove them before release.");
}

const status = run("git", ["status", "--porcelain"]);
if (status) {
  throw new Error("Git working tree is not clean. Review and commit the exact release files first.");
}

const head = run("git", ["rev-parse", "HEAD"]);
const remotes = run("git", ["remote"]);

if (remotes.split("\n").includes("origin")) {
  execFileSync("git", ["fetch", "origin"], { stdio: "inherit" });
  const originMain = run("git", ["rev-parse", "--verify", "origin/main"]);
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", originMain, head], { stdio: "ignore" });
  } catch {
    throw new Error("HEAD does not contain the latest origin/main.");
  }
} else {
  console.log("Sync guard: no origin remote exists; treating this as the repository's first deployment.");
}

const productionCommit = process.env.PRODUCTION_COMMIT_SHA;
if (productionCommit) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", productionCommit, head], { stdio: "ignore" });
  } catch {
    throw new Error("HEAD does not contain the currently deployed production commit.");
  }
  console.log(`Production guard: HEAD contains ${productionCommit.slice(0, 12)}.`);
} else {
  console.log("Production guard: no previous production commit supplied; valid for the first deployment only.");
}

console.log(`Release preflight passed at ${head.slice(0, 12)} for https://hepengyuan.top/.`);
