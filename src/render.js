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
    footer{border-top:1px solid var(--line);padding:2rem 0;color:var(--muted);font-size:.88rem}.footer-inner{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}
    :focus-visible{outline:3px solid #ffb000;outline-offset:3px}@media(max-width:900px){.card{grid-column:1/-1}.story{grid-template-columns:1fr}.story-copy{position:static}}@media(max-width:620px){.topbar-inner{height:auto;padding:.8rem 0;align-items:flex-start}.nav{justify-content:flex-end}.nav a{padding:.35rem .5rem}.hero{padding-top:3rem}.card{display:block}.media{min-height:220px}.story-media img,.story-media video{max-height:none}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
  </style>`;
}

function documentShell({ title, description, canonical, jsonLd, body }) {
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
<body>
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
