# S1 Comic AI Service Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one standalone, responsive S1 orange-and-black comic landing page for 何鹏远 / HPY / TerraSol 明远 that explains compliant AI consulting, setup assistance, workflow design, and aftercare services.

**Architecture:** Keep the existing root website untouched and add a progressively enhanced static page under `samples/s1/`. Use semantic HTML for all core content, a page-scoped CSS design system for the comic visual language, and dependency-free JavaScript for menu, service selection, copy feedback, and reveal motion. Extend the existing validators and build copier so the sample is checked and emitted to `dist/samples/s1/`.

**Tech Stack:** HTML5, CSS3, browser JavaScript, Node.js validation/build scripts, Image Gen for approved concept and portrait treatment, `cwebp` for image optimization, Browser/IAB for visual QA.

---

## File Map

- Create `samples/s1/index.html`: semantic page structure, exact approved copy, service cards, workflow, FAQ, contact section, disclosure.
- Create `samples/s1/styles.css`: S1 tokens, comic geometry, responsive layout, focus states, reduced-motion behavior.
- Create `samples/s1/script.js`: mobile navigation, anchor movement, service selection, clipboard feedback, reveal enhancement.
- Create `samples/s1/assets/hpy-comic.webp`: optimized, approved portrait cutout; must stay below 1,000,000 bytes.
- Create `scripts/validate-s1.mjs`: structural, content, compliance, CSS, JavaScript, and asset checks for S1.
- Modify `scripts/validate.mjs`: run the S1 validator from the existing validation entry point.
- Modify `scripts/build.mjs`: recursively copy `samples/` into `dist/samples/`.
- Modify `_headers`: add cache policy for `/samples/s1/assets/*`.
- Modify `README.md`: document the local sample URL and clarify that it is not the root production page.

## Task 1: Produce and approve the final visual concept

**Files:**
- Read: `docs/superpowers/specs/2026-08-23-s1-comic-service-page-design.md`
- Read: `/Users/mason/Desktop/白衣湖景国风动漫全身图-清晰脸部版.png`
- Temporary output only: `/tmp/s1-concepts/`

- [ ] **Step 1: Invoke the required visual skills**

Read and follow `imagegen` and `frontend-design`. Keep all concept outputs in `/tmp/s1-concepts/`; do not add concept screenshots to Git.

- [ ] **Step 2: Generate four coordinated concept screenshots**

Use the supplied portrait as the identity reference. Generate these fresh, readable concepts rather than cropping one tall board:

```text
Concept 1 — desktop hero, 1440×900:
Create a production-ready website screenshot for “何鹏远 / HPY / TerraSol 明远”. Orange #FF5312, black #111111, paper white #FFFDF7 and lightning yellow #FFCE19. Bold Chinese comic typography, thick 4–5px black outlines, offset solid shadows, halftone dots and controlled radial burst lines. Header: HPY, TerraSol 明远, 服务方案, 交付流程, 常见问题, 咨询方案. Hero copy verbatim: “把 AI 工具真正装进你的工作流！” and “从工具咨询、环境协助，到工作流搭建和售后支持，复杂问题一次讲清。” Buttons: “查看服务方案” and “认识何鹏远”. Show the referenced man with black short hair, metal-frame glasses and white Chinese-style robe as a clean comic cutout on the right. Do not show prices, sales metrics, official affiliation claims, floating pills or fake customer proof. Practical responsive HTML/CSS composition; all UI text must remain code-native.

Concept 2 — services and workflow, 1440×1000:
Continue the exact same visual system. Show the three service cards “入门咨询 / 环境协助 / 工作流搭建”, each with its approved three bullet items and “按需求评估”. Below, show “协作只需 3 步” with 提交需求 → 确认范围 → 协作交付. Include the disclosure “不代售账号；实际范围、周期与费用以双方确认结果为准。” No prices, checkout, account sales or official channel language.

Concept 3 — FAQ and contact, 1440×900:
Continue the same system with a quieter cream section for three FAQ rows and a black contact finale. Copy: “准备把 AI 用起来？”, “微信搜索：TerraSol 明远”, “复制联系名称”, and “何鹏远 / HPY · 独立服务说明页 · 与 OpenAI、Anthropic 无隶属关系。” Keep the same thick icon style and avoid extra claims.

Concept 4 — mobile page, 390×844:
Show the first mobile viewport and responsive continuation of the accepted S1 page. Order: compact header, headline, portrait, two CTAs, trust strip preview, first service card preview. No horizontal overflow, no clipped copy, minimum 44px touch targets, strong focus-ready controls, and the same palette and comic geometry.
```

- [ ] **Step 3: Inspect every concept at original detail**

Use `view_image` on all four outputs. Record a short fidelity ledger covering headline copy, first-viewport balance, palette, portrait identity, outline weight, service-card anatomy, mobile wrapping, and absence of prohibited claims.

- [ ] **Step 4: Present concepts for user approval**

Show the four concepts and pause. Do not create `samples/s1/` until the user explicitly approves the concept set. If a concept is unreadable or off-spec, regenerate that complete section at the same visual quality.

## Task 2: Add a failing semantic and compliance validator, then create the HTML

**Files:**
- Create: `scripts/validate-s1.mjs`
- Modify: `scripts/validate.mjs:1`
- Create: `samples/s1/index.html`

- [ ] **Step 1: Write the first failing validator**

Create `scripts/validate-s1.mjs`:

```js
import { readFile } from "node:fs/promises";

const failures = [];
const htmlPath = "samples/s1/index.html";
let html = "";

try {
  html = await readFile(htmlPath, "utf8");
} catch {
  failures.push(`${htmlPath}: missing`);
}

const requiredHtml = [
  [/<html lang="zh-CN">/, "zh-CN language declaration is missing"],
  [/<meta name="viewport"/, "viewport meta is missing"],
  [/<h1[^>]*>\s*把 AI 工具真正装进你的\s*<span>工作流！<\/span>/, "approved H1 is missing"],
  [/何鹏远/, "canonical personal name is missing"],
  [/HPY/, "HPY identity is missing"],
  [/TerraSol 明远/, "service identity is missing"],
  [/id="services"/, "services section is missing"],
  [/id="process"/, "process section is missing"],
  [/id="faq"/, "FAQ section is missing"],
  [/data-service-card="consulting"/, "consulting service card is missing"],
  [/data-service-card="setup"/, "setup service card is missing"],
  [/data-service-card="workflow"/, "workflow service card is missing"],
  [/不代售账号；实际范围、周期与费用以双方确认结果为准。/, "service disclosure is missing"],
  [/与 OpenAI、Anthropic 无隶属关系/, "independence disclosure is missing"],
  [/class="skip-link"/, "skip link is missing"],
];

for (const [pattern, message] of requiredHtml) {
  if (!pattern.test(html)) failures.push(`${htmlPath}: ${message}`);
}

for (const prohibited of ["官方充值", "官方渠道", "即时到账", "100% 官方", "OpenAI 官方", "Anthropic 官方"]) {
  if (html.includes(prohibited)) failures.push(`${htmlPath}: prohibited claim “${prohibited}”`);
}

if (failures.length) {
  console.error("S1 validation failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`S1 HTML validation passed: ${requiredHtml.length} content and compliance checks.`);
```

Add this first line to `scripts/validate.mjs`:

```js
import "./validate-s1.mjs";
```

- [ ] **Step 2: Run the validator and verify red**

Run:

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
npm run validate
```

Expected: exit 1 and `samples/s1/index.html: missing`.

- [ ] **Step 3: Create the semantic S1 HTML**

Create `samples/s1/index.html` with this complete structure:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex,nofollow" />
    <meta name="theme-color" content="#ff5312" />
    <title>AI 工具服务方案｜何鹏远 HPY · TerraSol 明远</title>
    <meta name="description" content="何鹏远提供 AI 工具咨询、安装协助、工作流搭建建议与售后支持。" />
    <link rel="stylesheet" href="./styles.css" />
    <script src="./script.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main-content">跳到主要内容</a>

    <header class="site-header" data-header>
      <a class="brand" href="#top" aria-label="返回 S1 样板顶部">
        <span class="brand-mark" aria-hidden="true">HPY</span>
        <span><strong>TerraSol 明远</strong><small>AI TOOL SERVICE</small></span>
      </a>
      <nav class="desktop-nav" aria-label="主要导航">
        <a href="#services">服务方案</a><a href="#process">交付流程</a><a href="#faq">常见问题</a>
      </nav>
      <a class="nav-cta" href="#contact">咨询方案</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" data-menu-toggle>
        <span class="sr-only">打开导航</span><span></span><span></span>
      </button>
      <nav class="mobile-nav" id="mobile-nav" aria-label="移动端导航" hidden data-mobile-nav>
        <a href="#services">服务方案</a><a href="#process">交付流程</a><a href="#faq">常见问题</a><a href="#contact">咨询方案</a>
      </nav>
    </header>

    <main id="main-content">
      <section class="hero" id="top" aria-labelledby="hero-title">
        <div class="burst-lines" aria-hidden="true"></div>
        <div class="hero-copy comic-bubble reveal">
          <h1 id="hero-title">把 AI 工具真正装进你的 <span>工作流！</span></h1>
          <p>从工具咨询、环境协助，到工作流搭建和售后支持，复杂问题一次讲清。</p>
        </div>
        <figure class="hero-portrait reveal">
          <img src="./assets/hpy-comic.webp" alt="身穿白色国风长衫、佩戴金属框眼镜的何鹏远漫画形象" width="960" height="1200" />
          <figcaption>何鹏远 · HPY</figcaption>
          <span class="portrait-sticker" aria-hidden="true">AI × 工作流</span>
        </figure>
        <div class="hero-actions reveal">
          <a class="button button-dark" href="#services">查看服务方案</a>
          <a class="button button-yellow" href="../../index.html">认识何鹏远</a>
        </div>
      </section>

      <section class="trust-strip" aria-label="服务方式">
        <div><strong>清晰说明</strong><span>先讲范围与边界</span></div>
        <div><strong>分步协助</strong><span>按确认步骤推进</span></div>
        <div><strong>售后跟进</strong><span>交付后继续答疑</span></div>
      </section>

      <section class="section services" id="services" aria-labelledby="services-title">
        <header class="section-heading reveal"><h2 id="services-title">选择适合你的 <span>AI 服务方案</span></h2><p>先选择关注方向，再进一步确认范围。</p></header>
        <div class="service-grid">
          <article class="service-card card-blue reveal" data-service-card="consulting" data-service-name="入门咨询" data-selected="false">
            <span class="card-number">01</span><h3>入门咨询</h3><ul><li>需求诊断</li><li>工具建议</li><li>风险提醒</li></ul>
            <button class="service-select" type="button" data-service-select aria-pressed="false" aria-label="选择入门咨询方案">按需求评估</button>
          </article>
          <article class="service-card card-purple reveal" data-service-card="setup" data-service-name="环境协助" data-selected="false">
            <span class="card-number">02</span><h3>环境协助</h3><ul><li>安装配置</li><li>故障排查</li><li>上手指导</li></ul>
            <button class="service-select" type="button" data-service-select aria-pressed="false" aria-label="选择环境协助方案">按需求评估</button>
          </article>
          <article class="service-card card-orange reveal" data-service-card="workflow" data-service-name="工作流搭建" data-selected="false">
            <span class="card-number">03</span><h3>工作流搭建</h3><ul><li>流程梳理</li><li>自动化建议</li><li>交付说明</li></ul>
            <button class="service-select" type="button" data-service-select aria-pressed="false" aria-label="选择工作流搭建方案">按需求评估</button>
          </article>
        </div>
        <p class="disclosure">不代售账号；实际范围、周期与费用以双方确认结果为准。</p>
      </section>

      <section class="section process" id="process" aria-labelledby="process-title">
        <header class="section-heading reveal"><h2 id="process-title">协作只需 <span>3 步</span></h2></header>
        <ol class="process-list">
          <li class="reveal"><b>1</b><span><strong>提交需求</strong><small>说明工具、环境与目标</small></span></li>
          <li class="reveal"><b>2</b><span><strong>确认范围</strong><small>确认内容、周期与边界</small></span></li>
          <li class="reveal"><b>3</b><span><strong>协作交付</strong><small>按步骤推进并完成说明</small></span></li>
        </ol>
      </section>

      <section class="section faq" id="faq" aria-labelledby="faq-title">
        <header class="faq-intro reveal"><h2 id="faq-title">常见问题 <span>一次讲清</span></h2><p>服务范围、准备材料、售后方式与合规边界。</p></header>
        <div class="faq-list reveal">
          <details><summary>你们是否代售账号？</summary><p>不代售账号。本页只介绍工具咨询、环境协助、工作流建议和约定范围内的售后支持。</p></details>
          <details><summary>如何确认服务范围？</summary><p>先说明当前环境、目标和问题，再共同确认具体内容、预计周期、交付形式与费用。</p></details>
          <details><summary>交付后如何获得支持？</summary><p>按双方确认的服务范围提供说明和后续答疑；新增需求会重新确认范围。</p></details>
        </div>
      </section>

      <section class="contact" id="contact" aria-labelledby="contact-title">
        <p class="selected-service" data-selected-service>当前未选择服务方案</p>
        <h2 id="contact-title">准备把 AI 用起来？</h2>
        <p>微信搜索：<strong data-contact-name>TerraSol 明远</strong></p>
        <button class="button button-orange" type="button" data-copy-contact>复制联系名称</button>
        <p class="copy-status" role="status" aria-live="polite" data-copy-status></p>
        <small>何鹏远 / HPY · 独立服务说明页 · 与 OpenAI、Anthropic 无隶属关系。</small>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 4: Run validation and verify green for HTML**

Run `npm run validate`.

Expected: exit 0 with both `S1 HTML validation passed` and the existing GEO validation success line.

- [ ] **Step 5: Commit the semantic slice**

```bash
git add scripts/validate-s1.mjs scripts/validate.mjs samples/s1/index.html
git commit -m "feat: add semantic S1 service page"
```

## Task 3: Extend the validator for CSS, then implement the visual system

**Files:**
- Modify: `scripts/validate-s1.mjs`
- Create: `samples/s1/styles.css`

- [ ] **Step 1: Add failing CSS checks**

After reading `html`, add:

```js
let css = "";
try {
  css = await readFile("samples/s1/styles.css", "utf8");
} catch {
  failures.push("samples/s1/styles.css: missing");
}

const requiredCss = [
  [/--orange:\s*#ff5312/i, "orange token is missing"],
  [/--ink:\s*#111111/i, "ink token is missing"],
  [/\.comic-bubble/, "comic bubble styles are missing"],
  [/\.service-grid/, "service grid styles are missing"],
  [/@media \(max-width: 900px\)/, "tablet/mobile breakpoint is missing"],
  [/@media \(max-width: 640px\)/, "small mobile breakpoint is missing"],
  [/@media \(prefers-reduced-motion: reduce\)/, "reduced-motion support is missing"],
  [/\.js\s+\.reveal/, "no-JavaScript-safe reveal enhancement is missing"],
  [/:focus-visible/, "keyboard focus styles are missing"],
];

for (const [pattern, message] of requiredCss) {
  if (!pattern.test(css)) failures.push(`samples/s1/styles.css: ${message}`);
}
```

- [ ] **Step 2: Run validation and verify red**

Run `npm run validate`.

Expected: exit 1 with `samples/s1/styles.css: missing` and the required CSS messages.

- [ ] **Step 3: Create the CSS foundation, hero, and shared components**

Create `samples/s1/styles.css` with the following first slice:

```css
:root {
  --orange: #ff5312; --orange-dark: #e84208; --ink: #111111; --paper: #fffdf7;
  --cream: #f7f1e7; --yellow: #ffce19; --blue: #2e7eea; --purple: #7239dd;
  --white: #ffffff; --muted: #5e554b; --border: 4px solid var(--ink);
  --display: "Arial Black", "PingFang SC", "Microsoft YaHei", sans-serif;
  --body: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --mono: "SFMono-Regular", "Cascadia Mono", monospace;
  --shell: min(1160px, calc(100vw - 48px));
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 84px; }
body { margin: 0; color: var(--ink); background: var(--cream); font-family: var(--body); }
a { color: inherit; text-decoration: none; }
button { color: inherit; font: inherit; }
img, svg { display: block; max-width: 100%; }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
.skip-link { position: fixed; z-index: 999; top: 8px; left: 8px; padding: 10px 14px; color: #fff; background: #111; transform: translateY(-140%); }
.skip-link:focus { transform: translateY(0); }
:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; box-shadow: 0 0 0 7px var(--yellow) !important; }
.site-header { position: sticky; z-index: 100; top: 0; min-height: 76px; display: flex; align-items: center; gap: 28px; padding: 12px max(24px, calc((100vw - 1160px)/2)); background: var(--paper); border-bottom: var(--border); }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 900; }
.brand > span:last-child { display: grid; }
.brand small { font: 9px/1.2 var(--mono); letter-spacing: .12em; }
.brand-mark { padding: 9px 10px; color: #fff; background: #111; border: 3px solid #111; box-shadow: 4px 4px 0 var(--orange); }
.desktop-nav { display: flex; gap: 24px; margin-left: auto; font-size: 14px; font-weight: 800; line-height: 1.4; }
.desktop-nav a:hover { color: var(--orange-dark); }
.nav-cta { padding: 10px 14px; background: var(--orange); border: 3px solid #111; box-shadow: 4px 4px 0 #111; font-size: 14px; font-weight: 900; line-height: 1.2; }
.menu-toggle, .mobile-nav { display: none; }
.hero { position: relative; min-height: 650px; display: grid; grid-template-columns: minmax(0,1.15fr) minmax(330px,.85fr); grid-template-areas: "copy portrait" "actions portrait"; grid-template-rows: auto auto; gap: 28px; align-items: center; padding: 58px max(24px,calc((100vw - 1160px)/2)); overflow: hidden; background-color: var(--orange); background-image: radial-gradient(#111 1.1px,transparent 1.1px); background-size: 9px 9px; border-bottom: var(--border); }
.burst-lines { position: absolute; inset: -35%; background: repeating-conic-gradient(from 8deg, transparent 0 9deg, rgba(17,17,17,.28) 9deg 10deg); transform: translateX(18%); pointer-events: none; }
.comic-bubble { position: relative; z-index: 1; grid-area: copy; align-self: end; padding: 54px 46px; background: var(--paper); border: 5px solid #111; clip-path: polygon(4% 0,94% 4%,100% 17%,97% 89%,88% 100%,8% 96%,0 83%,3% 13%); filter: drop-shadow(10px 10px 0 #111); }
.comic-bubble h1, .section-heading h2, .faq h2, .contact h2 { margin: 0; font-family: var(--display); font-weight: 950; letter-spacing: -.045em; }
.comic-bubble h1 { max-width: 690px; font-size: clamp(48px,5.2vw,78px); line-height: .98; }
.comic-bubble h1 span, .section-heading span, .faq h2 span { color: var(--orange-dark); }
.comic-bubble p { max-width: 580px; margin: 24px 0 0; font-size: 18px; font-weight: 700; line-height: 1.75; }
.hero-actions { position: relative; z-index: 1; grid-area: actions; align-self: start; display: flex; flex-wrap: wrap; gap: 14px; }
.button { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; padding: 11px 18px; border: 3px solid #111; font-size: 16px; font-weight: 900; line-height: 1.2; box-shadow: 5px 5px 0 #111; cursor: pointer; transition: transform 140ms ease, box-shadow 140ms ease; }
.button:hover { transform: translate(2px,2px); box-shadow: 3px 3px 0 #111; }
.button-dark { color: #fff; background: #111; }
.button-yellow { background: var(--yellow); }
.button-orange { background: var(--orange); }
.hero-portrait { position: relative; z-index: 1; grid-area: portrait; align-self: end; min-height: 520px; margin: 0; display: grid; place-items: end center; background: var(--yellow); border: 5px solid #111; box-shadow: 10px 10px 0 #111; overflow: hidden; }
.hero-portrait img { width: min(100%,520px); max-height: 590px; object-fit: contain; object-position: center bottom; filter: drop-shadow(8px 8px 0 rgba(17,17,17,.9)); }
.hero-portrait figcaption { position: absolute; left: 16px; bottom: 15px; padding: 8px 12px; color: #fff; background: #111; border: 3px solid #fff; font-weight: 900; transform: rotate(-2deg); }
.portrait-sticker { position: absolute; top: 18px; right: 14px; padding: 9px 12px; color: #fff; background: #111; border: 3px solid #fff; font-weight: 900; transform: rotate(4deg); }
.trust-strip { display: grid; grid-template-columns: repeat(3,1fr); color: #fff; background: #111; }
.trust-strip div { min-height: 88px; display: grid; place-content: center; gap: 3px; text-align: center; border-right: 1px solid #444; }
.trust-strip div:last-child { border-right: 0; }
.trust-strip strong { font-size: 18px; }
.trust-strip span { color: #bbb; font-size: 12px; }
.section { padding: 86px max(24px,calc((100vw - 1160px)/2)); border-bottom: var(--border); }
.section-heading { max-width: 760px; margin: 0 auto 38px; text-align: center; }
.section-heading h2, .faq h2, .contact h2 { font-size: clamp(38px,4.5vw,62px); line-height: 1; }
.section-heading p { color: var(--muted); font-weight: 700; }
```

- [ ] **Step 4: Add service, process, FAQ, contact, responsive, and motion CSS**

Append this second slice to the same stylesheet:

```css
.services { background: var(--cream); }
.service-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
.service-card { position: relative; min-height: 360px; padding: 30px; text-align: left; background: var(--paper); border: var(--border); cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease; }
.service-card:hover, .service-card[data-selected="true"] { transform: translate(-3px,-5px); }
.card-blue { box-shadow: 9px 9px 0 var(--blue); }
.card-purple { box-shadow: 9px 9px 0 var(--purple); }
.card-orange { box-shadow: 9px 9px 0 var(--orange); }
.service-card[data-selected="true"] { outline: 6px solid var(--yellow); outline-offset: -10px; }
.card-number { display: inline-grid; width: 46px; height: 46px; place-items: center; color: #fff; background: #111; border-radius: 50%; font: 900 15px/1 var(--mono); }
.service-card h3 { margin: 28px 0 18px; font: 950 30px/1 var(--display); }
.service-card ul { display: grid; gap: 12px; margin: 0 0 30px; padding: 0; list-style: none; }
.service-card li::before { content: "✓"; margin-right: 9px; font-weight: 950; }
.service-select { position: absolute; right: 30px; bottom: 20px; left: 30px; min-height: 52px; padding: 16px 0 0; background: transparent; border: 0; border-top: 2px solid #111; text-align: left; font-size: 18px; font-weight: 900; line-height: 1.2; cursor: pointer; }
.service-select::after { content: "→"; float: right; font: 950 22px/1 var(--display); }
.disclosure { margin: 34px 0 0; text-align: center; font-size: 13px; font-weight: 700; }
.process { background: var(--yellow); }
.process-list { display: grid; grid-template-columns: repeat(3,1fr); gap: 36px; margin: 0; padding: 0; list-style: none; }
.process-list li { position: relative; min-height: 170px; display: flex; align-items: center; gap: 18px; padding: 24px; background: var(--paper); border: var(--border); box-shadow: 7px 7px 0 #111; }
.process-list li:not(:last-child)::after { content: "→"; position: absolute; z-index: 2; right: -33px; font: 950 34px/1 var(--display); }
.process-list b { display: grid; flex: 0 0 52px; height: 52px; place-items: center; color: #fff; background: var(--orange); border: 3px solid #111; border-radius: 50%; font-size: 24px; }
.process-list span { display: grid; gap: 8px; }
.process-list strong { font: 950 22px/1 var(--display); }
.process-list small { color: var(--muted); line-height: 1.5; }
.faq { display: grid; grid-template-columns: .75fr 1.25fr; gap: 64px; background: var(--cream); }
.faq-intro p { color: var(--muted); font-weight: 700; line-height: 1.7; }
.faq-list { display: grid; gap: 12px; }
.faq-list details { background: var(--paper); border: 3px solid #111; box-shadow: 5px 5px 0 #111; }
.faq-list summary { min-height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; font-weight: 900; cursor: pointer; list-style: none; }
.faq-list summary::-webkit-details-marker { display: none; }
.faq-list summary::after { content: "+"; font: 950 24px/1 var(--display); }
.faq-list details[open] summary::after { content: "−"; }
.faq-list p { margin: 0; padding: 0 18px 18px; color: var(--muted); line-height: 1.75; }
.contact { padding: 82px 24px; color: #fff; background: #111; text-align: center; }
.contact > p { font-size: 18px; }
.selected-service { display: inline-block; padding: 7px 12px; color: #111; background: var(--yellow); border: 2px solid #fff; font-weight: 900; transform: rotate(-1deg); }
.copy-status { min-height: 26px; color: var(--yellow); font-weight: 800; }
.contact small { display: block; margin-top: 28px; color: #aaa; }
.reveal { opacity: 1; transform: none; }
.js .reveal { opacity: 0; transform: translateY(18px); transition: opacity 460ms ease, transform 460ms ease; }
.js .reveal.is-visible { opacity: 1; transform: none; }
@media (max-width: 900px) {
  .desktop-nav, .nav-cta { display: none; }
  .menu-toggle { margin-left: auto; width: 48px; height: 44px; display: grid; place-content: center; gap: 7px; background: var(--yellow); border: 3px solid #111; }
  .menu-toggle > span:not(.sr-only) { width: 22px; height: 3px; background: #111; }
  .mobile-nav { position: absolute; inset: 76px 0 auto; padding: 18px 24px 24px; background: var(--paper); border-bottom: var(--border); }
  .mobile-nav:not([hidden]) { display: grid; gap: 10px; }
  .mobile-nav a { padding: 12px; border: 2px solid #111; font-size: 16px; font-weight: 900; line-height: 1.25; }
  .hero { min-height: auto; grid-template-columns: 1fr; grid-template-areas: "copy" "portrait" "actions"; padding-top: 34px; }
  .comic-bubble { padding: 42px 32px; }
  .hero-portrait { min-height: 500px; }
  .service-grid { grid-template-columns: 1fr; max-width: 620px; margin: 0 auto; }
  .process-list { grid-template-columns: 1fr; max-width: 620px; margin: 0 auto; }
  .process-list li:not(:last-child)::after { content: "↓"; right: 50%; bottom: -34px; transform: translateX(50%); }
  .faq { grid-template-columns: 1fr; gap: 28px; }
}
@media (max-width: 640px) {
  :root { --shell: calc(100vw - 28px); }
  .site-header { min-height: 68px; padding-inline: 14px; }
  .brand small { display: none; }
  .mobile-nav { top: 68px; }
  .hero { gap: 18px; padding: 20px 14px 30px; }
  .comic-bubble { padding: 34px 24px 44px; filter: drop-shadow(6px 6px 0 #111); }
  .comic-bubble h1 { font-size: clamp(42px,13.6vw,58px); }
  .comic-bubble p { font-size: 16px; line-height: 1.65; }
  .hero-actions { display: grid; }
  .hero-portrait { min-height: 390px; box-shadow: 6px 6px 0 #111; }
  .trust-strip { grid-template-columns: 1fr; }
  .trust-strip div { min-height: 72px; border-right: 0; border-bottom: 1px solid #444; }
  .section { padding: 64px 14px; }
  .service-card { min-height: 330px; padding: 25px; }
  .faq-list summary { min-height: 64px; }
  .contact { padding: 64px 14px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
  .js .reveal { opacity: 1; transform: none; }
}
```

- [ ] **Step 5: Run validation and verify green for CSS**

Run `npm run validate`.

Expected: exit 0 and no CSS failures.

- [ ] **Step 6: Commit the visual slice**

```bash
git add scripts/validate-s1.mjs samples/s1/styles.css
git commit -m "feat: style S1 comic service page"
```

## Task 4: Extend the validator for JavaScript, then implement interactions

**Files:**
- Modify: `scripts/validate-s1.mjs`
- Create: `samples/s1/script.js`

- [ ] **Step 1: Add failing JavaScript checks**

Add:

```js
let script = "";
try {
  script = await readFile("samples/s1/script.js", "utf8");
} catch {
  failures.push("samples/s1/script.js: missing");
}

const requiredScript = [
  [/document\.documentElement\.classList\.add\("js"\)/, "progressive-enhancement class is missing"],
  [/data-menu-toggle/, "mobile menu hook is missing"],
  [/aria-pressed/, "service selection state is missing"],
  [/navigator\.clipboard\.writeText/, "clipboard action is missing"],
  [/IntersectionObserver/, "reveal enhancement is missing"],
  [/prefers-reduced-motion/, "reduced-motion JavaScript guard is missing"],
];

for (const [pattern, message] of requiredScript) {
  if (!pattern.test(script)) failures.push(`samples/s1/script.js: ${message}`);
}
```

- [ ] **Step 2: Run validation and verify red**

Run `npm run validate`.

Expected: exit 1 with `samples/s1/script.js: missing` and JavaScript requirement failures.

- [ ] **Step 3: Create the complete interaction script**

Create `samples/s1/script.js`:

```js
const menuButton = document.querySelector("[data-menu-toggle]");
const mobileNav = document.querySelector("[data-mobile-nav]");
const serviceCards = [...document.querySelectorAll("[data-service-card]")];
const selectedService = document.querySelector("[data-selected-service]");
const copyButton = document.querySelector("[data-copy-contact]");
const contactName = document.querySelector("[data-contact-name]");
const copyStatus = document.querySelector("[data-copy-status]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const closeMenu = () => {
  if (!menuButton || !mobileNav) return;
  menuButton.setAttribute("aria-expanded", "false");
  mobileNav.hidden = true;
  const label = menuButton.querySelector(".sr-only");
  if (label) label.textContent = "打开导航";
};

menuButton?.addEventListener("click", () => {
  if (!mobileNav) return;
  const opening = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(opening));
  mobileNav.hidden = !opening;
  const label = menuButton.querySelector(".sr-only");
  if (label) label.textContent = opening ? "关闭导航" : "打开导航";
});

mobileNav?.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
window.addEventListener("resize", () => { if (window.innerWidth > 900) closeMenu(); });

serviceCards.forEach((card) => {
  card.addEventListener("click", () => {
    serviceCards.forEach((item) => {
      const isSelected = item === card;
      item.dataset.selected = String(isSelected);
      item.querySelector("[data-service-select]")?.setAttribute("aria-pressed", String(isSelected));
    });
    const name = card.dataset.serviceName;
    if (selectedService) selectedService.textContent = `当前关注：${name}`;
  });
});

copyButton?.addEventListener("click", async () => {
  const value = contactName?.textContent?.trim() || "TerraSol 明远";
  try {
    await navigator.clipboard.writeText(value);
    if (copyStatus) copyStatus.textContent = `已复制：${value}`;
  } catch {
    if (copyStatus) copyStatus.textContent = `请手动复制：${value}`;
  }
});

const revealItems = document.querySelectorAll(".reveal");
if (reducedMotion || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.1 });
  document.documentElement.classList.add("js");
  revealItems.forEach((item) => observer.observe(item));
}
```

- [ ] **Step 4: Run validation and verify green for JavaScript**

Run `npm run validate`.

Expected: exit 0 and no JavaScript failures.

- [ ] **Step 5: Commit the interaction slice**

```bash
git add scripts/validate-s1.mjs samples/s1/script.js
git commit -m "feat: add S1 page interactions"
```

## Task 5: Generate, optimize, validate, and commit the portrait asset

**Files:**
- Modify: `scripts/validate-s1.mjs`
- Create: `samples/s1/assets/hpy-comic.webp`
- Temporary source: `/tmp/s1-assets/hpy-comic.png`

- [ ] **Step 1: Add a failing asset check**

Extend the import and check:

```js
import { readFile, stat } from "node:fs/promises";

try {
  const portrait = await stat("samples/s1/assets/hpy-comic.webp");
  if (!portrait.isFile() || portrait.size === 0) failures.push("samples/s1/assets/hpy-comic.webp: empty");
  if (portrait.size >= 1_000_000) failures.push(`samples/s1/assets/hpy-comic.webp: ${portrait.size} bytes exceeds 1MB limit`);
} catch {
  failures.push("samples/s1/assets/hpy-comic.webp: missing");
}
```

- [ ] **Step 2: Run validation and verify red**

Run `npm run validate`.

Expected: exit 1 with `samples/s1/assets/hpy-comic.webp: missing`.

- [ ] **Step 3: Generate the approved portrait treatment**

Use Image Gen edit with `/Users/mason/Desktop/白衣湖景国风动漫全身图-清晰脸部版.png`:

```text
Preserve the same adult Chinese male identity: black short hair, metal-frame glasses, gentle expression, white traditional Chinese long robe and full-body proportions. Convert the artwork into a crisp modern orange-and-black comic landing-page cutout that matches the approved S1 concept: confident clean ink outlines, restrained halftone shading, warm orange rim light, strong but friendly expression. Remove the lake and sunset completely. Output a clean transparent background, full body intact, no text, no logos, no extra objects, no cropped head, hands or feet, and no changes to glasses or clothing identity.
```

Save the approved source to `/tmp/s1-assets/hpy-comic.png`.

- [ ] **Step 4: Optimize to WebP and enforce the repository limit**

```bash
mkdir -p "/Users/mason/Documents/ChatGPT/何鹏远个人网站/samples/s1/assets"
/opt/homebrew/bin/cwebp -quiet -q 84 -resize 960 0 "/tmp/s1-assets/hpy-comic.png" -o "/Users/mason/Documents/ChatGPT/何鹏远个人网站/samples/s1/assets/hpy-comic.webp"
/usr/bin/stat -f '%z' "/Users/mason/Documents/ChatGPT/何鹏远个人网站/samples/s1/assets/hpy-comic.webp"
```

Expected: a positive size below `1000000`.

- [ ] **Step 5: Inspect the optimized asset**

Run `view_image` on `samples/s1/assets/hpy-comic.webp`. Verify identity, transparent background, intact glasses, full robe, hands and feet, clean outline, and no text.

- [ ] **Step 6: Run validation and verify green**

Run `npm run validate`.

Expected: exit 0 and all S1 checks pass.

- [ ] **Step 7: Commit the asset slice**

```bash
git add scripts/validate-s1.mjs samples/s1/assets/hpy-comic.webp
git commit -m "feat: add optimized HPY comic portrait"
```

## Task 6: Extend the build output and cache policy using a failing smoke check

**Files:**
- Modify: `scripts/build.mjs`
- Modify: `_headers`
- Modify: `README.md`

- [ ] **Step 1: Prove the current build omits S1**

Run:

```bash
npm run build
/bin/test -f dist/samples/s1/index.html
```

Expected: the second command exits 1 because `dist/samples/s1/index.html` does not exist.

- [ ] **Step 2: Copy the sample directory during build**

In `scripts/build.mjs`, add after the existing assets copy:

```js
await cp(resolve(projectRoot, "samples"), resolve(outputDirectory, "samples"), { recursive: true });
```

Add after the canonical check:

```js
const sampleHtml = await readFile(resolve(outputDirectory, "samples/s1/index.html"), "utf8");
if (!sampleHtml.includes("把 AI 工具真正装进你的")) {
  throw new Error("S1 sample content is missing from the build output.");
}
```

Change the final log to:

```js
console.log(`Built ${publicFiles.length + 2} public entries in dist/.`);
```

- [ ] **Step 3: Add a scoped cache policy**

Append to `_headers`:

```text

/samples/s1/assets/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=86400
```

- [ ] **Step 4: Document the sample route**

Append to `README.md`:

```markdown
## S1 漫画服务页样板

本地启动后访问 `http://127.0.0.1:4173/samples/s1/`。该样板用于视觉与交互确认，不会自动替换 `https://hepengyuan.top/` 根主页。
```

- [ ] **Step 5: Run build and verify green**

```bash
npm run build
/bin/test -f dist/samples/s1/index.html
/bin/test -f dist/samples/s1/styles.css
/bin/test -f dist/samples/s1/script.js
/bin/test -f dist/samples/s1/assets/hpy-comic.webp
```

Expected: every command exits 0 and build output reports `11 public entries`.

- [ ] **Step 6: Commit build and documentation changes**

```bash
git add scripts/build.mjs _headers README.md
git commit -m "build: include S1 service sample"
```

## Task 7: Verify functionality and visual fidelity in the real browser

**Files:**
- Inspect: `samples/s1/index.html`
- Inspect: `samples/s1/styles.css`
- Inspect: `samples/s1/script.js`
- Temporary screenshots only: `/tmp/s1-qa/`

- [ ] **Step 1: Start the local server**

```bash
cd "/Users/mason/Documents/ChatGPT/何鹏远个人网站"
npm run dev
```

Expected: server listens on `http://127.0.0.1:4173/`.

- [ ] **Step 2: Open the real sample in Browser/IAB**

Navigate to `http://127.0.0.1:4173/samples/s1/`. Verify the title, H1, portrait, three service cards, three process steps, three FAQ items, contact name and independence disclosure are visible.

- [ ] **Step 3: Verify the core interaction path**

1. Open and close the mobile menu; assert `aria-expanded` changes and the menu becomes visible/hidden.
2. Click “环境协助”; assert its card gets `data-selected="true"`, its selection button gets `aria-pressed="true"`, the other cards/buttons reset, and contact text becomes `当前关注：环境协助`.
3. Open every FAQ row with keyboard activation and verify each answer is readable.
4. Click “复制联系名称”; verify the live region reports either `已复制：TerraSol 明远` or the explicit manual-copy fallback.
5. Navigate each header anchor and verify it reaches the intended section.

- [ ] **Step 4: Capture the three required viewport screenshots**

Capture full-page images at:

```text
1440×900  → /tmp/s1-qa/desktop.png
853×1280  → /tmp/s1-qa/poster-ratio.png
390×844   → /tmp/s1-qa/mobile.png
```

Do not place screenshots in the repository.

- [ ] **Step 5: Run the required concept-to-render visual review**

In one QA pass, use `view_image` on the accepted hero, services, FAQ/contact, and mobile concepts and on all three latest browser screenshots. Write a fidelity ledger with at least these eight rows:

```text
1. Approved first-viewport headline and CTA copy
2. Hero text/portrait balance
3. Orange, black, paper and yellow color lock
4. 4–5px outline and solid shadow treatment
5. Portrait identity and background blending
6. Three service-card hierarchy and selected state
7. Process/FAQ/contact section rhythm
8. Mobile wrapping, touch targets and horizontal overflow
```

For each mismatch, identify concept evidence, render evidence, and the exact CSS/HTML/asset correction. Repeat screenshot and `view_image` comparison until no agency-signoff issue remains.

- [ ] **Step 6: Verify reduced motion and no-JavaScript resilience**

Emulate `prefers-reduced-motion: reduce` and verify every `.reveal` item is visible without transition. Disable JavaScript and reload; verify all core service, process, FAQ, contact and disclosure content remains readable.

- [ ] **Step 7: Run the final automated gates**

```bash
npm run validate
npm run build
git diff --check
git status --short
```

Expected: validation and build exit 0, `git diff --check` prints nothing, and status contains only explicitly reviewed S1 refinements if any remain uncommitted.

- [ ] **Step 8: Commit verified visual refinements**

If the QA pass changed implementation files:

```bash
git add samples/s1/index.html samples/s1/styles.css samples/s1/script.js samples/s1/assets/hpy-comic.webp scripts/validate-s1.mjs scripts/build.mjs _headers README.md
git commit -m "fix: polish S1 responsive fidelity"
```

If QA required no changes, do not create an empty commit.

## Task 8: Handoff without deploying

**Files:**
- Read: `docs/superpowers/specs/2026-08-23-s1-comic-service-page-design.md`
- Read: `docs/superpowers/plans/2026-08-23-s1-comic-service-page.md`

- [ ] **Step 1: Confirm the repository boundary**

Run:

```bash
git status --short --branch
git log --oneline -8
```

Expected: current branch is `codex/personal-ip-site`; no production deploy or root-homepage replacement commit is present.

- [ ] **Step 2: Give the user the local review URL and evidence**

Report:

```text
Local sample: http://127.0.0.1:4173/samples/s1/
Automated gates: npm run validate; npm run build
Browser viewports: 1440×900; 853×1280; 390×844
Core interaction: menu; service selection; FAQ; contact-name copy
Deployment: not performed
Root homepage: unchanged
```

- [ ] **Step 3: Request explicit approval before any production replacement or deployment**

Do not run `npm run release` and do not change `https://hepengyuan.top/` unless the user separately approves the reviewed S1 sample for production.
