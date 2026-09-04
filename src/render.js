const SITE_NAME = "何鹏远官方网站";
const PERSON_NAME = "何鹏远";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeXml(value) {
  const xmlSafe = String(value ?? "").replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "");
  return escapeHtml(xmlSafe);
}

export function safeJsonLd(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function pageStyles() {
  return `<style>
    :root{color-scheme:light;--ink:#08162b;--muted:#536479;--paper:#f4f7fb;--line:#cbd7e6;--blue:#1767d2;--blue-soft:#dcecff;--white:#fff}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif;line-height:1.65}
    a{color:inherit}.skip{position:absolute;left:1rem;top:-5rem;background:var(--ink);color:#fff;padding:.65rem 1rem;z-index:10}.skip:focus{top:1rem}
    .topbar{position:sticky;top:0;z-index:5;border-bottom:1px solid rgba(8,22,43,.12);background:rgba(244,247,251,.94);backdrop-filter:blur(12px)}
    .topbar-inner,.wrap{width:min(1120px,calc(100% - 2rem));margin-inline:auto}.topbar-inner{height:4.4rem;display:flex;align-items:center;justify-content:space-between;gap:1rem}
    .brand{text-decoration:none;font-weight:800;letter-spacing:.03em}.brand small{display:block;color:var(--muted);font:600 .65rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.18em}
    .nav{display:flex;gap:.35rem;flex-wrap:wrap}.nav a{padding:.45rem .75rem;border-radius:999px;text-decoration:none;color:var(--muted);font-weight:650;font-size:.9rem}.nav a:hover,.nav a:focus-visible{background:var(--blue-soft);color:var(--blue);outline:none}
    main{min-height:70vh}.hero{padding:clamp(4rem,8vw,7rem) 0 2.5rem}.kicker{margin:0 0 1rem;color:var(--blue);font:800 .75rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.18em;text-transform:uppercase}
    h1{max-width:860px;margin:0;font-size:clamp(2.35rem,6vw,5.3rem);line-height:.98;letter-spacing:-.055em}h1 span{display:block;color:var(--blue)}
    .lead{max-width:720px;margin:1.5rem 0 0;color:var(--muted);font-size:clamp(1rem,2vw,1.18rem)}
    .archive{padding:1rem 0 6rem}.count{margin:0 0 1.25rem;font:700 .78rem/1.2 ui-monospace,SFMono-Regular,monospace;color:var(--muted);letter-spacing:.1em;text-transform:uppercase}
    .grid{display:grid;grid-template-columns:repeat(12,1fr);gap:1rem}.card{grid-column:span 6;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(220px,.9fr);min-height:300px;overflow:hidden;border:1px solid var(--line);border-radius:1.1rem;background:var(--white);box-shadow:0 18px 55px rgba(8,22,43,.07)}
    .media{min-height:250px;background:#dce6f2;overflow:hidden}.media img,.media video{display:block;width:100%;height:100%;min-height:250px;object-fit:cover}.copy{padding:1.5rem;align-self:end}.type{margin:0 0 .65rem;color:var(--blue);font:800 .7rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.14em;text-transform:uppercase}
    h2{margin:0;font-size:clamp(1.35rem,2.2vw,2rem);line-height:1.12;letter-spacing:-.025em}.meta{margin:.8rem 0 0;color:var(--muted);font-size:.88rem}.desc{margin:.8rem 0 0;color:#33465d}.more{display:inline-flex;margin-top:1.15rem;color:var(--blue);font-weight:800;text-underline-offset:.25em}
    .empty{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:1.25rem;background:var(--white);padding:clamp(2rem,6vw,4.5rem);box-shadow:0 18px 55px rgba(8,22,43,.06)}.empty:after{content:"ARCHIVE / PENDING";position:absolute;right:-1.2rem;bottom:1rem;color:rgba(23,103,210,.08);font:900 clamp(2.2rem,7vw,6rem)/.8 ui-monospace,SFMono-Regular,monospace;transform:rotate(-4deg);pointer-events:none}.empty h2{max-width:700px}.empty p{position:relative;z-index:1;max-width:680px;color:var(--muted)}
    .story{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.6fr);gap:clamp(1.5rem,4vw,4rem);align-items:start;padding:clamp(2rem,6vw,5rem) 0 6rem}.story-media{overflow:hidden;border-radius:1.2rem;background:#dce6f2;box-shadow:0 24px 70px rgba(8,22,43,.12)}.story-media img,.story-media video{display:block;width:100%;max-height:78vh;object-fit:contain;background:#dce6f2}.story-copy{position:sticky;top:6rem}.story-copy h1{font-size:clamp(2rem,4.8vw,4rem)}.story-copy .desc{font-size:1.05rem}.back{display:inline-block;margin-top:1.5rem;color:var(--blue);font-weight:800;text-underline-offset:.25em}
    .article-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.article-card{border:1px solid var(--line);border-radius:1.1rem;background:var(--white);padding:1.5rem;box-shadow:0 18px 55px rgba(8,22,43,.06)}.article-card-top{display:flex;justify-content:space-between;color:var(--blue);font:800 .72rem/1.2 ui-monospace,SFMono-Regular,monospace;letter-spacing:.12em;text-transform:uppercase}.article-card-top b{color:#ad6500}.article-card h2{margin:1.4rem 0 .6rem}.article-card h2 a{text-decoration:none}.article-card h2 a:hover{color:var(--blue)}.article-card p{color:var(--muted);min-height:3.2em}.article-card time,.article-date{color:var(--muted);font-size:.85rem}.article-page{max-width:820px;padding:clamp(3rem,8vw,7rem) 0 6rem}.article-page h1{max-width:800px;font-size:clamp(2.4rem,6vw,5rem);margin-top:.8rem}.article-lead{color:var(--muted);font-size:1.2rem;max-width:700px}.article-content{margin-top:3rem;font-size:1.08rem}.article-content p{margin:0 0 1.4rem}.article-content a{color:var(--blue);text-underline-offset:.2em}
    footer{border-top:1px solid var(--line);padding:2rem 0;color:var(--muted);font-size:.88rem}.footer-inner{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
    :focus-visible{outline:3px solid #ffb000;outline-offset:3px}@media(max-width:900px){.card{grid-column:1/-1}.story{grid-template-columns:1fr}.story-copy{position:static}}@media(max-width:620px){.topbar-inner{height:auto;padding:.8rem 0;align-items:flex-start}.nav{justify-content:flex-end}.nav a{padding:.35rem .5rem}.hero{padding-top:3rem}.card{display:block}.media{min-height:220px}.story-media img,.story-media video{max-height:none}}
    @media(max-width:620px){.article-grid{grid-template-columns:1fr}.article-page{padding-top:3rem}}
    .blog-page{background:#f3efe7}.blog-page .topbar{background:rgba(13,14,16,.96);border-bottom-color:#2a2c30}.blog-page .brand,.blog-page .nav a{color:#f6f1e8}.blog-page .brand small{color:#ff5a1f}.blog-page .nav a:hover,.blog-page .nav a:focus-visible{background:#ff5a1f;color:#111}.blog-hero{min-height:clamp(520px,78vh,760px);display:grid;align-items:end;padding:clamp(5rem,12vw,10rem) 0 4rem;background:#111;color:#f6f1e8;position:relative;overflow:hidden}.blog-hero:before{content:"PERSONAL\A LOG";white-space:pre;position:absolute;right:-.04em;top:9%;font:900 clamp(8rem,25vw,24rem)/.72 Impact,"Arial Narrow",sans-serif;letter-spacing:-.06em;color:#ff5a1f;opacity:.95;pointer-events:none}.blog-hero .wrap{position:relative;z-index:1}.blog-hero .kicker{color:#ffb21a}.blog-hero h1{max-width:850px;font-family:Georgia,"Songti SC",serif;font-size:clamp(3.2rem,8vw,8.2rem);letter-spacing:-.07em;line-height:.9}.blog-hero h1 span{color:#ff5a1f}.blog-hero .lead{max-width:640px;color:#c8c3ba;font-size:1.08rem}.blog-index-content{padding:4rem 0 7rem}.blog-index-content .count{color:#777064}.article-grid{grid-template-columns:repeat(12,1fr)}.article-card{grid-column:span 6;border:0;border-radius:0;border-top:3px solid #111;background:#f8f5ee;box-shadow:none;padding:1.7rem 1.5rem 1.5rem;transition:transform .2s,box-shadow .2s}.article-card:hover{transform:translateY(-5px);box-shadow:8px 8px 0 #ff5a1f}.article-card:nth-child(1){grid-column:span 8;background:#fff}.article-card:nth-child(1) h2{font-size:clamp(1.8rem,3.5vw,3.2rem)}.article-card:nth-child(2){grid-column:span 4}.article-card-top{color:#e44e17}.article-card h2 a{font-family:Georgia,"Songti SC",serif}.article-card p{color:#625d53}.blog-page .empty{border:3px solid #111;border-radius:0;box-shadow:8px 8px 0 #ff5a1f}.article-page-shell{background:#f3efe7}.article-page{max-width:980px;padding-top:clamp(4rem,10vw,8rem)}.article-page .kicker{color:#e44e17}.article-page h1{max-width:900px;font-family:Georgia,"Songti SC",serif;font-size:clamp(3rem,7vw,7rem);line-height:.94}.article-page .article-date{border-top:1px solid #c9c1b4;padding-top:1rem;margin-top:2rem}.article-page .article-lead{max-width:760px;font-size:1.35rem;color:#625d53}.article-content{max-width:720px;margin-top:4rem;font-size:1.12rem;line-height:1.95}.article-content p:first-child:first-letter{float:left;font:700 4.4rem/.8 Georgia,serif;padding:.2rem .5rem 0 0;color:#ff5a1f}.article-page .back{color:#e44e17}
    @media(max-width:620px){.blog-hero{min-height:600px;padding-bottom:3rem}.blog-hero:before{font-size:7rem;top:22%;right:-.08em}.article-card,.article-card:nth-child(1),.article-card:nth-child(2){grid-column:1/-1}.article-page h1{font-size:clamp(2.7rem,14vw,4.5rem)}.article-content{margin-top:2.5rem;font-size:1.04rem}}
    .blog-document{background:#0a0a0a;color:#fff}.blog-document .topbar{background:rgba(10,10,10,.72);border-bottom-color:rgba(255,255,255,.15)}.blog-document .brand,.blog-document .nav a{color:#fff}.blog-document .brand small{color:rgba(255,255,255,.6)}.blog-document .nav a:hover,.blog-document .nav a:focus-visible{background:rgba(255,255,255,.15);color:#fff}.blog-document footer{border-color:rgba(255,255,255,.15);color:rgba(255,255,255,.65);background:#0a0a0a}.blog-document .blog-page,.blog-document .article-page-shell{background:transparent;position:relative;z-index:1}.blog-video-bg{position:fixed;inset:0;z-index:0;overflow:hidden;background:#0a0a0a;pointer-events:none}.blog-video-bg video{width:100%;height:100%;object-fit:cover;opacity:.68;filter:saturate(.72) contrast(1.08)}.blog-video-bg:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.62) 62%,#0a0a0a 100%)}.blog-document .blog-hero{background:transparent;color:#fff;min-height:clamp(620px,88vh,900px)}.blog-document .blog-hero:before{color:#fff;opacity:.1}.blog-document .blog-hero h1,.blog-document .article-page h1{font-family:Inter,Arial,sans-serif;font-weight:500;text-shadow:0 4px 24px rgba(0,0,0,.35)}.blog-document .blog-hero h1 span{color:#fff}.blog-document .blog-hero .kicker,.blog-document .article-page .kicker{color:#fff}.blog-document .blog-hero .lead,.blog-document .article-page .article-lead{color:rgba(255,255,255,.8)}.blog-document .blog-index-content{padding-top:4rem}.blog-document .blog-index-content .count{color:rgba(255,255,255,.65)}.blog-document .article-card{border:1px solid rgba(255,255,255,.2);border-radius:1rem;background:rgba(255,255,255,.1);box-shadow:none;backdrop-filter:blur(16px)}.blog-document .article-card:hover{background:rgba(255,255,255,.17);box-shadow:none}.blog-document .article-card:nth-child(1),.blog-document .article-card:nth-child(2){background:rgba(255,255,255,.13)}.blog-document .article-card-top,.blog-document .article-card h2 a{color:#fff}.blog-document .article-card p,.blog-document .article-page .article-content{color:rgba(255,255,255,.78)}.blog-document .article-card time,.blog-document .article-page .article-date{color:rgba(255,255,255,.62)}.blog-document .empty{border:1px solid rgba(255,255,255,.2);border-radius:1rem;background:rgba(255,255,255,.1);box-shadow:none;color:#fff}.blog-document .article-page .back,.blog-document .article-page .article-content a{color:#fff}
    .blog-video-spacer{height:80vh}
    .blog-document .brand:before{content:"";display:inline-block;width:10px;height:10px;margin-right:.55rem;border-radius:50%;background:#5E0ED7;vertical-align:middle}.nova-blog{font-family:Inter,system-ui,sans-serif;color:#000;background:#fff}.nova-hero{min-height:100svh;padding:6.5rem 1.25rem 2rem;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden;background:rgba(255,255,255,.68);color:#000}.nova-hero:after{content:"";position:absolute;inset:0;background:rgba(255,255,255,.62);z-index:-1}.nova-topline{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start;text-transform:uppercase;letter-spacing:.16em;font-weight:600}.nova-services{font:600 10px/1.8 Inter, sans-serif;margin:0}.nova-intro{max-width:300px;margin:0;text-align:right;font-size:1rem;line-height:1.65;letter-spacing:.08em}.nova-stats{display:flex;justify-content:flex-end;gap:1.25rem;align-items:flex-end;text-align:right;padding:3rem 0}.nova-stats>div{min-width:82px}.nova-stats strong{display:block;font-size:clamp(1.8rem,6vw,4.3rem);line-height:.9;font-weight:600;letter-spacing:-.06em}.nova-stats strong i{font-style:normal}.nova-stats span{display:block;margin-top:.6rem;font-size:10px;line-height:1.3;letter-spacing:.13em;text-transform:uppercase}.nova-bottom{display:grid;grid-template-columns:120px 1fr auto;gap:1rem;align-items:end;position:relative;z-index:1}.nova-tagline,.nova-description{margin:0;font-size:10px;line-height:1.6;letter-spacing:.14em;text-transform:uppercase;font-weight:600}.nova-description{max-width:280px;text-align:right;grid-column:1/3;grid-row:2}.nova-cta{justify-self:end;color:#5E0ED7;font-size:1rem;letter-spacing:.12em;text-decoration:none;font-weight:600;white-space:nowrap}.nova-cta span{font-size:1.4em}.nova-bottom h1{grid-column:2/4;grid-row:1/3;margin:0;text-align:right;font-size:clamp(3.2rem,11vw,10rem);line-height:.84;letter-spacing:-.08em;font-weight:600;text-transform:uppercase}.nova-bottom h1 span{display:block;overflow:hidden}.nova-blog .blog-index-content{background:#fff;color:#000}.nova-blog .blog-index-content .count{color:#000}.nova-blog .article-card{background:#fff;color:#000;border-color:#111}.nova-blog .article-card h2 a,.nova-blog .article-card-top,.nova-blog .article-card p,.nova-blog .article-card time{color:#000}.nova-blog .article-card:hover{background:#f5f2ff;box-shadow:6px 6px 0 #5E0ED7}.blog-document .blog-video-bg video{opacity:.38;filter:saturate(.55) contrast(1.05)}.blog-document .blog-video-bg:after{background:rgba(255,255,255,.4)}.blog-document.nova-blog{}
    @media(min-width:640px){.nova-hero{padding-left:2rem;padding-right:2rem}.nova-stats{gap:2rem}.nova-bottom{grid-template-columns:180px 1fr auto}.nova-intro{font-size:1.15rem}.nova-cta{font-size:1.25rem}.nova-description{font-size:12px}}
    @media(min-width:768px){.nova-hero{padding:7rem 3rem 3rem}.nova-topline{font-size:14px}.nova-bottom{grid-template-columns:280px 1fr auto;gap:1.5rem}.nova-description{grid-column:1;grid-row:2;text-align:right;font-size:13px}.nova-bottom h1{grid-column:2/4}.nova-cta{font-size:1.5rem}.nova-stats{gap:2.5rem}}
    @media(max-width:639px){.nova-topline{flex-direction:column;gap:1.5rem}.nova-intro{text-align:left}.nova-bottom{grid-template-columns:120px 1fr;gap:.8rem}.nova-cta{grid-column:2;grid-row:1}.nova-description{grid-column:1/3;grid-row:2;text-align:left}.nova-bottom h1{grid-column:1/3;grid-row:3;font-size:clamp(3rem,15vw,5.5rem)}}
    .nova-blog .article-grid{counter-reset:board}.nova-blog .article-card{position:relative;counter-increment:board;border-radius:0;border-width:1px;border-top:3px solid #000;padding:2.2rem 1.5rem 1.5rem;min-height:285px}.nova-blog .article-card:before{content:counter(board,decimal-leading-zero);position:absolute;top:.8rem;right:1rem;color:#5E0ED7;font-size:1.4rem;font-weight:600;letter-spacing:-.08em}.nova-blog .article-card-top{font-size:10px;letter-spacing:.15em}.nova-blog .article-card h2{margin-top:2rem}.nova-blog .article-card h2 a{display:block}.nova-blog .article-card-read{display:inline-block;margin-top:1.2rem;color:#5E0ED7!important;font-size:10px;font-weight:600;letter-spacing:.14em;text-decoration:none;text-transform:uppercase}.nova-blog .article-content h2{margin:3rem 0 1rem;padding-top:1.2rem;border-top:2px solid #fff;font-size:1.65rem;line-height:1.2;letter-spacing:-.03em;color:#fff}.nova-blog .article-content ol{padding-left:1.4rem}.nova-blog .article-content li{margin:.65rem 0;padding-left:.35rem}.nova-blog .article-content li::marker{color:#5E0ED7;font-weight:700}
    .nova-blog .article-card{border-radius:0;border-top:3px solid #000;min-height:260px}.nova-blog .article-card:before{display:none}.blog-document .article-page h1{font-size:clamp(2rem,3.2vw,3.4rem);line-height:1.25}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
    .nova-hero{overflow:hidden}.nova-bottom h1{max-width:900px;font-size:clamp(3rem,6vw,7rem);line-height:.92;word-break:keep-all}.nova-blog .blog-video-bg video{opacity:.14}.nova-blog .blog-video-bg:after{background:rgba(255,255,255,.74)}.blog-document .article-page-shell{background:#fff!important;color:#111}.blog-document .article-page{color:#111;padding-top:clamp(3.5rem,8vw,6rem);padding-bottom:6rem}.blog-document .article-page h1{max-width:860px;color:#111;font-size:clamp(2.2rem,4.8vw,4.5rem);line-height:1.18;letter-spacing:-.04em;text-shadow:none;word-break:keep-all}.blog-document .article-page .kicker{color:#5E0ED7}.blog-document .article-page .article-date{border-color:#dedede;color:#777}.blog-document .article-page .article-lead{max-width:760px;color:#555;font-size:1.15rem;line-height:1.8}.blog-document .article-page .article-content{max-width:720px;margin-top:3rem;color:#222;font-size:1.08rem;line-height:2}.blog-document .article-page .article-content h2{margin:3.2rem 0 1rem;padding-top:1.2rem;border-top:1px solid #ddd;color:#111;font-size:1.55rem;line-height:1.35}.blog-document .article-page .article-content p:first-child:first-letter{color:#5E0ED7}.blog-document .article-page .article-content a{color:#5E0ED7}.blog-document .article-page .back{color:#5E0ED7}.blog-document .article-page-shell~footer{background:#fff;color:#777;border-color:#ddd}
    @media(max-width:639px){.nova-hero{padding-top:5.5rem}.nova-bottom h1{font-size:clamp(2.8rem,13vw,5rem);line-height:.94}.nova-intro{max-width:270px}.blog-document .article-page h1{font-size:clamp(2.1rem,9vw,3.3rem);line-height:1.22;word-break:break-word}.blog-document .article-page .article-content{font-size:1rem;line-height:1.9}}
  </style>`;
}

function documentShell({ title, description, canonical, jsonLd, body, bodyClass = "" }) {
  const structuredData = jsonLd
    ? `<script type="application/ld+json">${safeJsonLd(jsonLd)}</script>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-video-preview:-1">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  ${structuredData}
  ${pageStyles()}
</head>
<body class="${escapeHtml(bodyClass)}">
  <a class="skip" href="#content">跳到主要内容</a>
  <header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="/"><span>${PERSON_NAME}</span><small>OFFICIAL ARCHIVE</small></a>
      <nav class="nav" aria-label="影像导航">
        <a href="/travel/">旅行影像</a><a href="/learning/">学习视频</a><a href="/#contact">联系</a>
      </nav>
    </div>
  </header>
  ${body}
  <footer><div class="wrap footer-inner"><span>© ${new Date().getUTCFullYear()} ${PERSON_NAME}</span><a href="/">返回官方网站</a></div></footer>
</body>
</html>`;
}

function articleContent(value) {
  return String(value || "").replaceAll("\\n", "\n").split(/\n\s*\n/).map((paragraph) => {
    const heading = paragraph.match(/^##\s+(.+)$/);
    if (heading) return `<h2>${escapeHtml(heading[1])}</h2>`;
    const lines = paragraph.split("\n");
    if (lines.length > 1 && lines.every((line) => /^\d+\.\s+/.test(line.trim()))) {
      return `<ol>${lines.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s+/, ""))}</li>`).join("")}</ol>`;
    }
    const safe = escapeHtml(paragraph).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="nofollow noopener">$1</a>').replace(/\n/g, "<br>");
    return `<p>${safe}</p>`;
  }).join("");
}

const articleCategoryLabels = { ai: "AI 实践", product: "产品开发", learning: "学习笔记", life: "个人记录", notes: "随笔" };
const BLOG_VIDEO_URL = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260517_222138_3e3205be-3364-417b-a64a-bfe087acbec4.mp4";

function blogVideoLayer() {
  return `<div class="blog-video-bg" aria-hidden="true"><video src="${BLOG_VIDEO_URL}" muted playsinline preload="auto"></video></div><script>(function(){const v=document.querySelector('.blog-video-bg video');if(!v)return;let raf=0,target=0,current=0;const tick=()=>{current+=(target-current)*.12;if(v.readyState>=1&&!v.seeking&&Math.abs(v.currentTime-(current*Math.max(0,v.duration-.05)))>.04)v.currentTime=current*Math.max(0,v.duration-.05);raf=requestAnimationFrame(tick)};const update=()=>{const max=document.documentElement.scrollHeight-innerHeight;target=max>0?Math.min(1,Math.max(0,scrollY/max)):0;if(!raf)raf=requestAnimationFrame(tick)};addEventListener('scroll',update,{passive:true});addEventListener('resize',update);v.addEventListener('loadedmetadata',update);update()})();</script>`;
}

function articleCard(article) {
  return `<article class="article-card"><div class="article-card-top"><span>${escapeHtml(articleCategoryLabels[article.category] || article.category)}</span>${article.pinned ? "<b>置顶</b>" : ""}</div><h2><a href="${escapeHtml(article.url)}">${escapeHtml(article.title)}</a></h2>${article.excerpt ? `<p>${escapeHtml(article.excerpt)}</p>` : ""}<time datetime="${escapeHtml(article.publishedAt || article.updatedAt)}">${escapeHtml((article.publishedAt || article.updatedAt || "").slice(0, 10))}</time><a class="article-card-read" href="${escapeHtml(article.url)}">阅读文章 ↗</a></article>`;
}

export function renderBlogIndexPage(articles, baseUrl) {
  const title = `个人微博与文章｜${PERSON_NAME}`;
  const description = `${PERSON_NAME}的个人微博，记录 AI 工具、产品开发、学习与生活实践。`;
  const canonical = `${baseUrl}/blog/`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Blog", name: title, url: canonical, description, author: { "@type": "Person", name: PERSON_NAME, url: `${baseUrl}/#person` } };
  const list = articles.length ? `<div class="article-grid">${articles.map(articleCard).join("")}</div>` : `<div class="empty"><p class="kicker">PERSONAL LOG / FIRST POST</p><h2>这里会发布何鹏远的第一篇文章。</h2><p>AI 实践、产品开发、学习记录和个人观察，都会以公开文章的方式持续更新。</p></div>`;
  const stats = `<div class="nova-stats"><div><strong><i>2009</i></strong><span>互联网金融</span></div><div><strong><i>2025</i></strong><span>进入 AI 赛道</span></div><div><strong><i>2026</i></strong><span>独立部署</span></div></div>`;
  return documentShell({ title, description, canonical, jsonLd, bodyClass: "blog-document", body: `${blogVideoLayer()}<main id="content" class="blog-page nova-blog"><section class="nova-hero"><div class="nova-topline"><p class="nova-services">/ AI WORKFLOW<br>/ PRODUCT BUILDING<br>/ INDEPENDENT DEPLOYMENT</p><p class="nova-intro">把 AI 工具、工作流和真实经验，整理成任何人都能读懂的公开文章。</p></div>${stats}<div class="nova-bottom"><p class="nova-tagline">BUILDING SYSTEMS<br>FROM REAL WORK<br>FOR REAL PEOPLE</p><a href="#articles" class="nova-cta">READ THE LOG <span>↗</span></a><p class="nova-description">何鹏远的个人微博，记录从第一条工作流到成熟产品、网站和上线部署的过程。</p><h1><span>真实</span><span>实践</span><span>持续发生</span></h1></div></section><div class="blog-video-spacer" aria-hidden="true"></div><section class="archive blog-index-content" id="articles"><div class="wrap"><p class="count">${articles.length ? `已发布 ${articles.length} 篇` : "暂无已发布文章"}</p>${list}</div></section></main>` });
}

export function renderArticlePage(article, baseUrl) {
  const canonical = `${baseUrl}/blog/${encodeURIComponent(article.slug)}/`;
  const description = article.excerpt || `${PERSON_NAME}发布的文章：${article.title}。`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: article.title, description, datePublished: article.publishedAt, dateModified: article.updatedAt, mainEntityOfPage: canonical, author: { "@type": "Person", name: PERSON_NAME, url: `${baseUrl}/#person` }, publisher: { "@type": "Person", name: PERSON_NAME } };
  return documentShell({ title: `${article.title}｜${PERSON_NAME}`, description, canonical, jsonLd, bodyClass: "blog-document", body: `${blogVideoLayer()}<main id="content" class="article-page-shell"><article class="wrap article-page"><p class="kicker">${escapeHtml(articleCategoryLabels[article.category] || article.category)} / PERSONAL LOG</p><h1>${escapeHtml(article.title)}</h1><p class="article-date">何鹏远 · ${escapeHtml((article.publishedAt || article.updatedAt || "").slice(0, 10))}</p>${article.excerpt ? `<p class="article-lead">${escapeHtml(article.excerpt)}</p>` : ""}<div class="article-content">${articleContent(article.content)}</div><a class="back" href="/blog/">← 返回个人微博</a></article></main>` });
}

export function renderBlogSitemap(articles, baseUrl) {
  const rows = [`<url><loc>${escapeXml(`${baseUrl}/blog/`)}</loc></url>`, ...articles.map((article) => `<url><loc>${escapeXml(`${baseUrl}/blog/${encodeURIComponent(article.slug)}/`)}</loc>${article.updatedAt ? `<lastmod>${escapeXml(article.updatedAt.slice(0, 10))}</lastmod>` : ""}</url>`)].join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>`;
}

function locationLabel(item) {
  return [item.city, item.country].filter(Boolean).join(" · ");
}

function durationLabel(value) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function schemaDuration(value) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return null;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.round((total % 60) * 1000) / 1000;
  return `PT${hours ? `${hours}H` : ""}${minutes ? `${minutes}M` : ""}${seconds || (!hours && !minutes) ? `${seconds}S` : ""}`;
}

function itemMedia(item) {
  if (item.mediaType === "image") {
    return `<img src="${escapeHtml(item.contentUrl)}" alt="${escapeHtml(item.alt || item.title)}" loading="lazy" decoding="async">`;
  }

  return `<video src="${escapeHtml(item.contentUrl)}"${item.thumbnailUrl ? ` poster="${escapeHtml(item.thumbnailUrl)}"` : ""} controls preload="metadata" playsinline aria-label="${escapeHtml(item.title)}"></video>`;
}

function itemCard(item) {
  const place = locationLabel(item);
  const meta = [place, item.capturedOn, durationLabel(item.durationSeconds)].filter(Boolean).join(" · ");

  return `<article class="card">
    <div class="media">${itemMedia(item)}</div>
    <div class="copy">
      <p class="type">${item.mediaType === "image" ? "Photo" : "Video"} / ${item.category === "travel" ? "Travel" : "Learning"}</p>
      <h2>${escapeHtml(item.title)}</h2>
      ${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}
      ${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ""}
      <a class="more" href="${escapeHtml(item.storyUrl)}">查看完整记录 →</a>
    </div>
  </article>`;
}

export function renderArchivePage(category, items, baseUrl) {
  const isTravel = category === "travel";
  const label = isTravel ? "旅行影像" : "学习视频";
  const title = `${label}｜${PERSON_NAME}`;
  const description = isTravel
    ? "何鹏远亲自拍摄并确认公开的旅行照片与视频档案。"
    : "何鹏远确认公开的学习过程、教程与实践视频档案。";
  const canonical = `${baseUrl}/${category}/`;
  const emptyCopy = isTravel
    ? "当前没有已公开的旅行照片或视频；新内容仅在地点、时间、隐私与公开授权确认后发布。"
    : "当前没有已公开的学习视频；新内容仅在标题、时间、隐私与公开授权确认后发布。";
  const itemList = items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: item.storyUrl,
    name: item.title,
  }));
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonical,
    description,
    inLanguage: "zh-CN",
    mainEntity: { "@type": "ItemList", itemListElement: itemList },
  };

  const archiveContent = items.length
    ? `<p class="count">已公开 ${items.length} 条确认记录</p><div class="grid">${items.map(itemCard).join("")}</div>`
    : `<div class="empty"><p class="kicker">Archive status / 暂无公开条目</p><h2>${escapeHtml(emptyCopy)}</h2><p>只发布本人确认的地点与素材；不推断旅行经历，不公开敏感精确位置。</p></div>`;

  return documentShell({
    title,
    description,
    canonical,
    jsonLd,
    body: `<main id="content"><section class="hero"><div class="wrap"><p class="kicker">He Pengyuan / Media archive</p><h1>${isTravel ? "走过的地方，<span>拍下的画面。</span>" : "正在学习的事，<span>留下过程。</span>"}</h1><p class="lead">${escapeHtml(description)}</p></div></section><section class="archive"><div class="wrap">${archiveContent}</div></section></main>`,
  });
}

export function renderStoryPage(item, baseUrl) {
  const storyUrl = `${baseUrl}/stories/${item.slug}`;
  const contentUrl = `${baseUrl}/media/file/${item.slug}`;
  const place = locationLabel(item);
  const meta = [place, item.captured_on, durationLabel(item.duration_seconds)].filter(Boolean).join(" · ");
  const mediaObject = {
    "@context": "https://schema.org",
    "@type": item.media_type === "image" ? "ImageObject" : "VideoObject",
    name: item.title,
    contentUrl,
    url: storyUrl,
    uploadDate: item.published_at,
    inLanguage: "zh-CN",
    creator: {
      "@type": "Person",
      "@id": `${baseUrl}/#person`,
      name: PERSON_NAME,
    },
  };
  mediaObject.description = item.description || `${PERSON_NAME}公开发布的影像记录：${item.title}。`;
  if (item.media_type === "image" && item.alt_text) mediaObject.caption = item.alt_text;
  if (item.media_type === "video" && item.thumbnail_key) mediaObject.thumbnailUrl = `${baseUrl}/media/poster/${item.slug}`;
  if (item.media_type === "video" && schemaDuration(item.duration_seconds)) {
    mediaObject.duration = schemaDuration(item.duration_seconds);
  }
  if (item.captured_on) mediaObject.dateCreated = item.captured_on;
  if (item.country || item.city) {
    mediaObject.contentLocation = {
      "@type": "Place",
      name: [item.city, item.country].filter(Boolean).join(", "),
    };
  }

  const media =
    item.media_type === "image"
      ? `<img src="${escapeHtml(contentUrl)}" alt="${escapeHtml(item.alt_text || item.title)}">`
      : `<video src="${escapeHtml(contentUrl)}"${item.thumbnail_key ? ` poster="${escapeHtml(`${baseUrl}/media/poster/${item.slug}`)}"` : ""} controls preload="metadata" playsinline aria-label="${escapeHtml(item.title)}"></video>`;
  const archiveUrl = item.category === "travel" ? "/travel/" : "/learning/";
  const archiveLabel = item.category === "travel" ? "旅行影像" : "学习视频";

  return documentShell({
    title: `${item.title}｜${PERSON_NAME}`,
    description: item.description || `${PERSON_NAME}公开发布的${archiveLabel}记录：${item.title}。`,
    canonical: storyUrl,
    jsonLd: mediaObject,
    body: `<main id="content"><article class="wrap story"><div class="story-media">${media}</div><div class="story-copy"><p class="kicker">${escapeHtml(archiveLabel)} / ${item.media_type === "image" ? "Photo" : "Video"}</p><h1>${escapeHtml(item.title)}</h1>${meta ? `<p class="meta">${escapeHtml(meta)}</p>` : ""}${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ""}<a class="back" href="${archiveUrl}">← 返回${escapeHtml(archiveLabel)}</a></div></article></main>`,
  });
}

export function renderNotFoundPage(baseUrl) {
  return documentShell({
    title: `没有找到这条记录｜${SITE_NAME}`,
    description: "请求的公开影像记录不存在或尚未发布。",
    canonical: `${baseUrl}/`,
    body: `<main id="content"><section class="hero"><div class="wrap"><p class="kicker">404 / Not found</p><h1>这条记录不存在，<span>或仍是草稿。</span></h1><p class="lead">只有本人确认并公开发布的内容才会出现在网站中。</p><p><a class="back" href="/">返回首页</a></p></div></section></main>`,
  });
}

export function renderAccessDeniedPage(message) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>媒体后台登录</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08162b;color:#fff;font-family:"PingFang SC",sans-serif}.box{width:min(560px,calc(100% - 2rem));padding:2.5rem;border:1px solid #375273;border-radius:1rem;background:#102541}p{color:#b8c7da}code{color:#8fc0ff}</style></head><body><main class="box"><p>ADMIN / CLOUDFLARE ACCESS</p><h1>需要管理员身份</h1><p>${escapeHtml(message)}</p><p>线上请先通过 Cloudflare Access 登录；本地开发仅可在 <code>localhost</code> 且显式设置 <code>ADMIN_DEV_BYPASS=true</code> 时绕过。</p></main></body></html>`;
}

export function renderMediaSitemap(items, baseUrl) {
  const directoryLastmod = (category) => {
    const latest = items
      .filter((item) => item.category === category)
      .map((item) => item.updatedAt || item.publishedAt)
      .filter(Boolean)
      .sort()
      .at(-1);
    return latest ? `<lastmod>${escapeXml(latest.slice(0, 10))}</lastmod>` : "";
  };
  const rows = items
    .map((item) => {
      const lastmod = item.updatedAt || item.publishedAt;
      const image =
        item.mediaType === "image"
          ? `<image:image><image:loc>${escapeXml(item.contentUrl)}</image:loc><image:title>${escapeXml(item.title)}</image:title>${item.description ? `<image:caption>${escapeXml(item.description)}</image:caption>` : ""}</image:image>`
          : "";
      const video =
        item.mediaType === "video" && item.thumbnailUrl
          ? `<video:video><video:thumbnail_loc>${escapeXml(item.thumbnailUrl)}</video:thumbnail_loc><video:title>${escapeXml(item.title)}</video:title><video:description>${escapeXml(item.description || item.title)}</video:description><video:content_loc>${escapeXml(item.contentUrl)}</video:content_loc>${item.durationSeconds ? `<video:duration>${Math.max(1, Math.round(item.durationSeconds))}</video:duration>` : ""}</video:video>`
          : "";
      return `<url><loc>${escapeXml(item.storyUrl)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod.slice(0, 10))}</lastmod>` : ""}${image}${video}</url>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"><url><loc>${escapeXml(`${baseUrl}/travel/`)}</loc>${directoryLastmod("travel")}</url><url><loc>${escapeXml(`${baseUrl}/learning/`)}</loc>${directoryLastmod("learning")}</url>${rows}</urlset>\n`;
}
