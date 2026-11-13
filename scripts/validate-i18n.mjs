/* 多语言首页的发布门禁。

   /en/、/de/、/ko/ 是 index.html 的译文，只能换文字，不能换事实：
   1. 已提交的页面必须和 scripts/i18n.mjs 的生成结果完全一致（生成器本身会拒绝残留中文和失效译文）；
   2. 每个页面的 lang、canonical、hreflang 互相对应；
   3. 正文里的链接、联系方式与 Work 区的年份必须和中文首页逐一相同。 */
import { readFile } from "node:fs/promises";
import { LANGS, renderAll } from "./i18n.mjs";

const SITE = "https://hepengyuan.com";
const PAGES = { "zh-CN": "/", en: "/en/", de: "/de/", ko: "/ko/" };
const failures = [];
const fail = (message) => failures.push(message);

let generated = {};
try {
  generated = await renderAll();
} catch (error) {
  fail(error.message);
}

const zh = await readFile("index.html", "utf8");
const files = { "zh-CN": zh };
for (const lang of LANGS) {
  files[lang] = await readFile(`${lang}/index.html`, "utf8").catch(() => "");
  if (!files[lang]) fail(`${lang}/index.html: missing — run npm run i18n`);
  else if (generated[lang] && generated[lang] !== files[lang]) fail(`${lang}/index.html: out of date with index.html or i18n/${lang}.json — run npm run i18n`);
}

const between = (html, start, end) => {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  return from === -1 || to === -1 ? "" : html.slice(from, to);
};
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]).filter((href) => !href.endsWith("?room=1"));
const copyValues = (html) => [...html.matchAll(/data-copy-value="([^"]+)"/g)].map((match) => match[1]);
const workYears = (html) => [...between(html, '<section id="work"', '<p class="pb-lbl pb-grp">Projects</p>').matchAll(/<span class="y">([^<]*)<\/span>/g)]
  .map((match) => match[1].replace(/\D/g, "")).filter(Boolean);

const zhMain = between(zh, '<main id="top">', "</main>");
const expectedAlternates = Object.entries(PAGES).map(([lang, path]) => `<link rel="alternate" hreflang="${lang}" href="${SITE}${path}">`)
  .concat(`<link rel="alternate" hreflang="x-default" href="${SITE}/">`);

for (const [lang, path] of Object.entries(PAGES)) {
  const html = files[lang];
  if (!html) continue;
  const name = lang === "zh-CN" ? "index.html" : `${lang}/index.html`;
  if (!html.includes(`<html lang="${lang}">`)) fail(`${name}: <html lang="${lang}"> is missing`);
  if (!html.includes(`<link rel="canonical" href="${SITE}${path}">`)) fail(`${name}: canonical must be ${SITE}${path}`);
  for (const alternate of expectedAlternates) {
    if (!html.includes(alternate)) fail(`${name}: hreflang alternate missing: ${alternate}`);
  }
  for (const [other, otherPath] of Object.entries(PAGES)) {
    const current = other === lang ? ' aria-current="page"' : "";
    if (!html.includes(`<a href="${otherPath}" hreflang="${other}" lang="${other}"${current}>`)) fail(`${name}: language menu link to ${otherPath} is missing or has the wrong aria-current`);
  }
  if (lang === "zh-CN") continue;

  const main = between(html, '<main id="top">', "</main>");
  if (JSON.stringify(hrefs(main)) !== JSON.stringify(hrefs(zhMain))) fail(`${name}: links inside <main> differ from the Chinese homepage`);
  if (JSON.stringify(copyValues(html)) !== JSON.stringify(copyValues(zh))) fail(`${name}: copyable contact values differ from the Chinese homepage`);
  if (JSON.stringify(workYears(html)) !== JSON.stringify(workYears(zh))) fail(`${name}: Work years differ from the Chinese homepage`);
  if (!html.includes(`href="${path}?room=1"`)) fail(`${name}: HI-FI links must point at ${path}?room=1`);
  if (/"@type": "Person"/.test(html)) fail(`${name}: Person facts belong only on the Chinese homepage; translations reference ${SITE}/#person`);
  if (!html.includes(`"@id": "${SITE}/#person"`)) fail(`${name}: JSON-LD must reference ${SITE}/#person`);
}

const sitemap = await readFile("sitemap.xml", "utf8");
const llms = await readFile("llms.txt", "utf8");
const build = await readFile("scripts/build.mjs", "utf8");
for (const lang of LANGS) {
  if (!sitemap.includes(`<loc>${SITE}/${lang}/</loc>`)) fail(`sitemap.xml: ${SITE}/${lang}/ is missing`);
  if (!llms.includes(`${SITE}/${lang}/`)) fail(`llms.txt: ${SITE}/${lang}/ is missing`);
  if (!build.includes(`"${lang}"`)) fail(`scripts/build.mjs: the ${lang}/ directory is not copied into dist`);
}

if (failures.length) {
  console.error("Language validation failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}
console.log(`Language validation passed: ${LANGS.length} generated homepages, reciprocal hreflang, and link / contact / year parity.`);
