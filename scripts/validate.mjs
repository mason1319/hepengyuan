import "./validate-s1.mjs";

import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "index.html",
  "styles.css",
  "script.js",
  "robots.txt",
  "sitemap.xml",
  "llms.txt",
  "profile.json",
  "assets/favicon.svg",
  "assets/og-card.png",
];

const failures = [];

for (const file of requiredFiles) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) failures.push(`${file}: missing or empty`);
  } catch {
    failures.push(`${file}: missing`);
  }
}

const html = await readFile("index.html", "utf8");
const robots = await readFile("robots.txt", "utf8");
const sitemap = await readFile("sitemap.xml", "utf8");
const profile = JSON.parse(await readFile("profile.json", "utf8"));

const htmlChecks = [
  [/<html lang="zh-CN">/, "html lang is missing"],
  [/<link rel="canonical"/, "canonical URL is missing"],
  [/application\/ld\+json/, "JSON-LD is missing"],
  [/"@type": "Person"/, "Person schema is missing"],
  [/"@type": "ProfilePage"/, "ProfilePage schema is missing"],
  [/name="robots" content="index,follow/, "index/follow robots meta is missing"],
  [/<h1[^>]*>/, "visible H1 is missing"],
  [/何鹏远/, "canonical Chinese name is missing"],
  [/He Pengyuan/, "canonical English name is missing"],
];

for (const [pattern, message] of htmlChecks) {
  if (!pattern.test(html)) failures.push(`index.html: ${message}`);
}

for (const bot of ["OAI-SearchBot", "GPTBot", "Claude-SearchBot", "PerplexityBot", "Googlebot"]) {
  if (!robots.includes(`User-agent: ${bot}`)) failures.push(`robots.txt: ${bot} rule is missing`);
}

if (!sitemap.includes("<urlset")) failures.push("sitemap.xml: urlset is missing");
if (profile.name !== "何鹏远") failures.push("profile.json: canonical name is incorrect");

if (failures.length > 0) {
  console.error("Validation failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

const placeholderCount = [html, robots, sitemap, JSON.stringify(profile)].reduce(
  (count, content) => count + (content.match(/hepengyuan\.example/g) || []).length,
  0,
);

console.log(`Validation passed: ${requiredFiles.length} files and ${htmlChecks.length} HTML/GEO checks.`);
if (placeholderCount > 0) {
  console.error(`Validation failed: replace placeholder domain in all public metadata (${placeholderCount} references).`);
  process.exit(1);
}

if (![html, robots, sitemap, JSON.stringify(profile)].every((content) => content.includes("hepengyuan.top"))) {
  console.error("Validation failed: production domain is inconsistent across public metadata.");
  process.exit(1);
}
