import "./validate-media-platform.mjs";
import "./validate-root-interactions.mjs";
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
  "assets/wechat-terrasol-ai-qr.jpg",
  "assets/douyin-hpy131419-code.jpg",
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
const llms = await readFile("llms.txt", "utf8");
const profile = JSON.parse(await readFile("profile.json", "utf8"));

const jsonLdDocuments = [];
for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  try {
    jsonLdDocuments.push(JSON.parse(match[1]));
  } catch (error) {
    failures.push(`index.html: invalid JSON-LD (${error.message})`);
  }
}

const jsonLdNodes = jsonLdDocuments.flatMap((document) => (
  Array.isArray(document?.["@graph"]) ? document["@graph"] : [document]
));
const jsonLdPerson = jsonLdNodes.find((node) => node?.["@type"] === "Person");
if (!jsonLdPerson) failures.push("index.html: parsed JSON-LD Person node is missing");

const contactSectionMatch = html.match(/<section\b[^>]*\bid=["']contact["'][^>]*>([\s\S]*?)<\/section>/i);
const contactSection = contactSectionMatch?.[0] ?? "";
if (!contactSection) failures.push("index.html: visible contact section is missing");
const visibleContactText = contactSection
  .replace(/<[^>]+>/g, " ")
  .replace(/&commat;/g, "@")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const publicCopyControls = [...contactSection.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
  .filter((match) => /\bdata-copy-public(?:\s|=|$)/i.test(match[1]))
  .map((match) => {
    const attributes = match[1];
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const value = attributes.match(/\bdata-copy-value=["']([^"']+)["']/i)?.[1] ?? "";
    const label = attributes.match(/\bdata-copy-label=["']([^"']+)["']/i)?.[1] ?? "";
    return { value, label, text };
  });

const expectedCopyControls = [
  { value: "TerraSol-Ai", label: "微信号" },
  { value: "HPY131419", label: "抖音号" },
];

if (publicCopyControls.length !== expectedCopyControls.length) {
  failures.push("index.html: visible contact directory must expose exactly two public copy controls");
}

for (const expectedControl of expectedCopyControls) {
  const control = publicCopyControls.find(({ label }) => label === expectedControl.label);
  if (!control) {
    failures.push(`index.html: ${expectedControl.label} copy control is missing data-copy-public/data-copy-label`);
    continue;
  }
  if (control.value !== expectedControl.value) {
    failures.push(`index.html: ${expectedControl.label} copy control must use ${expectedControl.value}`);
  }
  if (!control.text.includes(expectedControl.value)) {
    failures.push(`index.html: ${expectedControl.label} copy control must visibly show ${expectedControl.value}`);
  }
}

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

const expectedPublicProfile = {
  alternateName: ["He Pengyuan", "Pengyuan He", "HPY", "TerraSol 明远"],
  email: ["653091hepeng@163.com", "653091hepeng@gmail.com"],
  telephone: "+8613145113319",
  sameAs: ["https://t.me/mason1413", "https://x.com/X_mason13", "https://www.youtube.com/@beimingzi"],
  identifier: [
    { "@type": "PropertyValue", propertyID: "WeChat", value: "TerraSol-Ai" },
    { "@type": "PropertyValue", propertyID: "Douyin", value: "HPY131419" },
  ],
};

for (const field of ["alternateName", "email", "telephone", "sameAs", "identifier"]) {
  const expected = JSON.stringify(expectedPublicProfile[field]);
  if (JSON.stringify(profile[field]) !== expected) {
    failures.push(`profile.json: ${field} does not match the verified public profile`);
  }
  if (jsonLdPerson && JSON.stringify(jsonLdPerson[field]) !== expected) {
    failures.push(`index.html: JSON-LD Person ${field} does not match profile.json`);
  }
}

for (const value of [
  "TerraSol-Ai",
  "HPY131419",
  "653091hepeng@163.com",
  "653091hepeng@gmail.com",
  "@mason1413",
  "@X_mason13",
  "@beimingzi",
]) {
  if (!visibleContactText.includes(value)) failures.push(`index.html: visible contact directory is missing ${value}`);
  if (!llms.includes(value.replace(/^@/, ""))) failures.push(`llms.txt: verified public contact is missing ${value}`);
}

for (const href of [
  "mailto:653091hepeng@163.com",
  "mailto:653091hepeng@gmail.com",
  "tel:+8613145113319",
  "https://t.me/mason1413",
  "https://x.com/X_mason13",
  "https://www.youtube.com/@beimingzi",
  "https://u.wechat.com/EMtqddT4ZiSg6ogvLEtCx1M?s=2",
]) {
  if (!contactSection.includes(`href="${href}"`)) failures.push(`index.html: visible contact href is missing ${href}`);
}

for (const src of ["/assets/wechat-terrasol-ai-qr.jpg", "/assets/douyin-hpy131419-code.jpg"]) {
  if (!contactSection.includes(`src="${src}"`)) failures.push(`index.html: visible QR asset is missing ${src}`);
}

const normalizedPublicSources = [contactSection, JSON.stringify(jsonLdPerson), JSON.stringify(profile), llms]
  .map((content) => content.replace(/\D/g, ""));
if (!normalizedPublicSources.every((content) => content.includes("8613145113319"))) {
  failures.push("public telephone must stay synchronized as +8613145113319");
}

for (const asset of ["assets/wechat-terrasol-ai-qr.jpg", "assets/douyin-hpy131419-code.jpg"]) {
  try {
    const info = await stat(asset);
    if (info.size >= 1_000_000) failures.push(`${asset}: public QR asset must stay below 1 MB`);
  } catch {
    // The required-file check above reports the missing asset.
  }
}

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

if (![html, robots, sitemap, JSON.stringify(profile)].every((content) => content.includes("hepengyuan.com"))) {
  console.error("Validation failed: production domain is inconsistent across public metadata.");
  process.exit(1);
}
