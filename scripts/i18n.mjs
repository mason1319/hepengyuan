/* 多语言首页生成器。

   index.html（简体中文）是唯一的事实来源。/en/、/de/、/ko/ 三个首页由它和
   i18n/<lang>.json 的逐句译文生成：结构、链接、联系方式、年份全部原样保留，只换文字。

   用法：
     node scripts/i18n.mjs          重新生成 en/、de/、ko/index.html
     node scripts/i18n.mjs --check  只检查已提交的文件是否与生成结果一致

   生成时会拒绝两种情况：译文表里有用不上的原文（首页改了但译文没跟上），以及
   生成结果里还残留中文（首页新增了文字但没有翻译）。专有名词白名单见 ALLOWED_HAN。 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://hepengyuan.com";
export const LANGS = ["en", "de", "ko"];

/* 译文里允许保留的中文：本人姓名、TerraSol 明远、品牌「Aggie 速记英语」里的中文部分、语言菜单里的「简体中文」，
   以及原创歌曲的歌名（专有名词，各语言都用原名）。 */
const ALLOWED_HAN = ["何鹏远", "明远", "速记英语", "简体中文", "来自高纬的你"];
const HAN = /[㐀-鿿　-〿＀-￯]/;

function escapeAttr(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function replaceOnce(html, from, to, label) {
  const count = html.split(from).length - 1;
  if (count !== 1) throw new Error(`i18n: expected exactly one ${label} in index.html, found ${count}`);
  return html.replace(from, to);
}

export async function loadDictionary(lang) {
  return JSON.parse(await readFile(resolve(ROOT, "i18n", `${lang}.json`), "utf8"));
}

export function render(zhHtml, dict) {
  const url = `${SITE}${dict.path}`;
  const strings = dict.strings;

  /* 1. 先把脚本块拿出来，翻译只作用于页面文字和属性。JSON-LD 换成译文页自己的 WebPage。 */
  const scripts = [];
  let jsonLdSlot = -1;
  let html = zhHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (block) => {
    if (/type="application\/ld\+json"/.test(block)) {
      if (jsonLdSlot !== -1) throw new Error("i18n: more than one JSON-LD block in index.html");
      jsonLdSlot = scripts.length;
    }
    scripts.push(block);
    return `\u0000SCRIPT${scripts.length - 1}\u0000`;
  });
  if (jsonLdSlot === -1) throw new Error("i18n: JSON-LD block not found in index.html");

  const zhTitle = zhHtml.match(/<title>([^<]+)<\/title>/)?.[1];
  const zhDescription = zhHtml.match(/<meta name="description" content="([^"]+)">/)?.[1];
  if (!strings[zhTitle] || !strings[zhDescription]) throw new Error(`i18n(${dict.lang}): title or description has no translation`);

  /* 2. 语言、地址、语言菜单 */
  html = replaceOnce(html, '<html lang="zh-CN">', `<html lang="${dict.htmlLang}">`, "html lang");
  html = replaceOnce(html, `<link rel="canonical" href="${SITE}/">`, `<link rel="canonical" href="${url}">`, "canonical link");
  html = replaceOnce(html, `<meta property="og:url" content="${SITE}/">`, `<meta property="og:url" content="${url}">`, "og:url");
  html = replaceOnce(html, '<meta property="og:locale" content="zh_CN">', `<meta property="og:locale" content="${dict.ogLocale}">`, "og:locale");
  html = replaceOnce(html, '<a class="name" href="/"', `<a class="name" href="${dict.path}"`, "name link");
  html = html.split('href="/?room=1"').join(`href="${dict.path}?room=1"`);
  html = replaceOnce(html, '<a href="/" hreflang="zh-CN" lang="zh-CN" aria-current="page">', '<a href="/" hreflang="zh-CN" lang="zh-CN">', "current language link");
  html = replaceOnce(html, `<a href="${dict.path}" hreflang="${dict.htmlLang}" lang="${dict.htmlLang}">`,
    `<a href="${dict.path}" hreflang="${dict.htmlLang}" lang="${dict.htmlLang}" aria-current="page">`, `${dict.lang} language link`);
  html = replaceOnce(html, '>简体</summary>', `>${escapeAttr(dict.switchLabel)}</summary>`, "language menu label");

  /* 3. 复制提示与配色按钮的文字（script.js 读取这些 data 属性；没有时用中文默认值） */
  html = replaceOnce(html, '<p class="contact-note" data-contact-note',
    `<p class="contact-note" data-contact-note data-copied="${escapeAttr(dict.copied)}" data-manual="${escapeAttr(dict.manual)}"`, "contact note");
  html = replaceOnce(html, '<button type="button" class="themeb" id="theme"',
    `<button type="button" class="themeb" id="theme" data-theme-auto="${escapeAttr(dict.theme.auto)}" data-theme-light="${escapeAttr(dict.theme.light)}" data-theme-dark="${escapeAttr(dict.theme.dark)}" data-theme-template="${escapeAttr(dict.theme.template)}"`, "theme button");
  html = replaceOnce(html, '      <p class="rights">', `      <p class="i18n-note">${escapeAttr(dict.note)}</p>\n      <p class="rights">`, "footer rights line");

  /* 4. 逐句替换：长句优先，避免短词先吃掉长句里的一部分 */
  const keys = Object.keys(strings).sort((a, b) => b.length - a.length);
  const unused = [];
  for (const key of keys) {
    const parts = html.split(key);
    if (parts.length === 1) {
      unused.push(key);
      continue;
    }
    html = parts.join(strings[key]);
  }
  if (unused.length) throw new Error(`i18n(${dict.lang}): ${unused.length} source string(s) no longer appear in index.html:\n  ${unused.join("\n  ")}`);

  /* 5. 不能残留中文（白名单里的专有名词除外） */
  let probe = html;
  for (const allowed of ALLOWED_HAN) probe = probe.split(allowed).join("");
  const leftover = [...probe.matchAll(new RegExp(`.{0,24}${HAN.source}.{0,24}`, "g"))].map((match) => match[0].trim());
  if (leftover.length) throw new Error(`i18n(${dict.lang}): untranslated Chinese left in the page:\n  ${leftover.slice(0, 12).join("\n  ")}`);

  /* 6. 放回脚本；人物事实只留在中文首页，译文页用 WebPage 指回同一个 Person。 */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: strings[zhTitle],
    description: strings[zhDescription],
    inLanguage: dict.htmlLang,
    isPartOf: { "@id": `${SITE}/#website` },
    about: { "@id": `${SITE}/#person` },
    translationOfWork: { "@id": `${SITE}/#webpage` },
  };
  html = html.replace(/\u0000SCRIPT(\d+)\u0000/g, (_, index) => (
    Number(index) === jsonLdSlot
      ? `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2).replace(/^/gm, "      ")}\n    </script>`
      : scripts[Number(index)]
  ));

  return html.replace("<!doctype html>\n", `<!doctype html>\n<!-- Generated by scripts/i18n.mjs from index.html and i18n/${dict.lang}.json. Edit those, then run: npm run i18n -->\n`);
}

export async function renderAll() {
  const zhHtml = await readFile(resolve(ROOT, "index.html"), "utf8");
  const pages = {};
  for (const lang of LANGS) pages[lang] = render(zhHtml, await loadDictionary(lang));
  return pages;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const pages = await renderAll();
  let stale = 0;
  for (const [lang, html] of Object.entries(pages)) {
    const file = resolve(ROOT, lang, "index.html");
    if (check) {
      const current = await readFile(file, "utf8").catch(() => "");
      if (current !== html) {
        stale += 1;
        console.error(`${lang}/index.html is out of date — run: npm run i18n`);
      }
    } else {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, html, "utf8");
      console.log(`wrote ${lang}/index.html`);
    }
  }
  if (stale) process.exit(1);
}
