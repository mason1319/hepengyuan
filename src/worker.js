import { AGGIE_GUARD_TAG, AGGIE_GUARD_VERSION } from "./aggie-guard.js";
import { AuthError, isLocalDevelopmentRequest, isLocalHostname, verifyAccessIdentity } from "./auth.js";
import {
  MediaError,
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteMedia,
  drainMediaCleanupQueue,
  findPublishedMedia,
  listAdminMedia,
  listPublishedMedia,
  mapPublicRow,
  saveVideoThumbnail,
  setMediaStatus,
  uploadMultipartPart,
} from "./media-store.js";
import { ArticleError, createArticle, deleteArticle, findPublishedArticle, listAdminArticles, listPublishedArticles, updateArticle } from "./article-store.js";
import {
  renderAccessDeniedPage,
  renderArchivePage,
  renderMediaSitemap,
  renderNotFoundPage,
  renderStoryPage,
  renderArticlePage,
  renderBlogIndexPage,
  renderBlogSitemap,
} from "./render.js";

const JSON_LIMIT_BYTES = 64 * 1024;
/* 文章正文最多 10 万字（article-store.js），中文按 UTF-8 每字 3 字节，再加 JSON 转义，64KB 远远不够。 */
const ARTICLE_JSON_LIMIT_BYTES = 512 * 1024;
const CANONICAL_SITE = "https://hepengyuan.com";
const REVOCABLE_PUBLIC_CACHE = "public, no-cache, max-age=0, must-revalidate";
/* 宣传片和音乐是固定路由、不会被“转为草稿”，可以让浏览器留一天，重看和拖动进度不必每段都回源确认。
   换文件（同一个 R2 键重传）后，访客最多一天内还会拿到旧文件；handleMediaFile 认 If-Range，不会新旧片段拼在一起。 */
const FIXED_MEDIA_CACHE = "public, max-age=86400";
const PROMO_VIDEO_ROUTE = "/media/promo/pengyuan-personal-promo.mp4";
const PROMO_VIDEO_KEY = "public/promo/pengyuan-personal-promo-1080p.mp4";
/* 手机版宣传片：720p、约 1.3 Mbps（17 MB）。国内手机不开 VPN 直连时，1080p（约 7 Mbps）常常加载不动。
   首页 <source media> 与 3D 房间在手机上选它，电脑仍用 1080p。 */
const PROMO_VIDEO_MOBILE_ROUTE = "/media/promo/pengyuan-personal-promo-720p.mp4";
const PROMO_VIDEO_MOBILE_KEY = "public/promo/pengyuan-personal-promo-720p.mp4";
/* 首页 #music 的原创音乐：固定路由 → R2 固定键。新增一首时在这里加一行，并把文件传到对应的键。 */
const MUSIC_ROUTES = new Map([
  ["/media/music/lai-zi-gao-wei-de-ni.mp3", "public/music/lai-zi-gao-wei-de-ni.mp3"],
]);
/* 3D 房间里小人的本人录音（仓库里的 assets/room/voice/*.mp3）。文件跟着静态资源发布，但静态资源层不理会 Range：
   请求 bytes=0-1 也整份返回 200。苹果的文档要求给 iOS 播的音视频必须支持分段请求，Safari 播音频前也确实先发这个探测。
   所以这些文件在 wrangler.jsonc 里标成先过 Worker，由 handleVoiceClip 从 ASSETS 取出来自己切片应答。 */
const VOICE_CLIP_PATH = /^\/assets\/room\/voice\/[\w-]+\.mp3$/;
const VOICE_CLIP_CACHE = "public, max-age=604800"; /* 七天；换录音时 room/avatar.js 的 VOICE_REV 会改网址 */
/* Aggie 官网上的两部片子，给 3D 房间的放映机用。由本站代取：访客的浏览器只跟本站打交道（CSP 不用为别的域名放开），
   Aggie 那边换了片子这里自动跟着换。上游地址是写死的两条，访客改不了，不会被拿来代取别的东西。 */
const AGGIE_FILMS = new Map([
  ["/media/aggie/learning-15s.mp4", "https://aggieai.me/media/aggie-learning-15s.mp4"],
  ["/media/aggie/brand-film.mp4", "https://aggieai.me/media/aggie-brand-promo.mp4"],
]);
/* 出口登记表：首页上带 data-go 的链接，发布时由 scripts/build.mjs 汇成 /projects.json。
   /go/<id> 按它跳转（外站地址带上来源标记）并记一次数；POST 只记数，给页面上的 sendBeacon 用。 */
const GO_PATH = /^\/go\/([a-z0-9-]{1,64})$/;
const GO_SOURCES = new Set(["page", "room", "link"]);
const GO_REGISTRY_TTL_MS = 60_000;
let goRegistry = { loadedAt: 0, exits: null };
const AGGIE_3A_ROUTE = "/aggie-3a/";
const AGGIE_3A_OBJECT_KEY = "public/experiences/aggie-3a-v6.html";

const PUBLIC_STATIC_FILES = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/profile.json",
  "/favicon.ico",
]);

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function siteBase(env) {
  const configured = String(env.PUBLIC_SITE_URL || CANONICAL_SITE).trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(configured);
    if (parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return parsed.origin;
    }
  } catch {
    // Fall back to the canonical production URL.
  }
  return CANONICAL_SITE;
}

function withHeaders(response, extra = {}) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders,
    ...extraHeaders,
  });
  return new Response(JSON.stringify(payload), { status, headers });
}

function htmlResponse(html, status = 200, { admin = false, head = false } = {}) {
  const csp = admin
    ? "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    : "default-src 'none'; img-src 'self' data:; media-src 'self' https://d8j0ntlcm91z4.cloudfront.net; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
  return new Response(head ? null : html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": admin ? "private, no-store" : REVOCABLE_PUBLIC_CACHE,
      "Content-Security-Policy": csp,
      ...securityHeaders,
    },
  });
}

function textResponse(message, status, extraHeaders = {}) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders, ...extraHeaders },
  });
}

function methodNotAllowed(allowed) {
  return jsonResponse({ error: "请求方法不允许。" }, 405, { Allow: allowed.join(", ") });
}

async function readJson(request, limitBytes = JSON_LIMIT_BYTES) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > limitBytes) {
    throw new MediaError(413, "请求内容过大。");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limitBytes) {
    throw new MediaError(413, "请求内容过大。");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new MediaError(400, "请求必须是有效 JSON。");
  }
}

function assertSameOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const requestOrigin = new URL(request.url).origin;
  let localOrigin = false;
  try {
    localOrigin =
      isLocalHostname(new URL(origin).hostname) &&
      isLocalDevelopmentRequest(request, env);
  } catch {
    localOrigin = false;
  }
  if (!origin || (origin !== requestOrigin && !localOrigin)) {
    throw new AuthError(403, "管理操作必须从本站后台发起。");
  }
}

function pathSegment(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const segment = pathname.slice(prefix.length);
  if (!segment || segment.includes("/")) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function decodeRouteValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new MediaError(400, "请求路径格式无效。");
  }
}

async function handleAdminApi(request, env, identity, baseUrl) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api/admin/articles") {
    if (request.method === "GET") return jsonResponse({ identity: { email: identity.email }, items: await listAdminArticles(env) });
    if (request.method === "POST") { assertSameOrigin(request, env); return jsonResponse({ item: await createArticle(env, await readJson(request, ARTICLE_JSON_LIMIT_BYTES), identity) }, 201); }
    return methodNotAllowed(["GET", "POST"]);
  }
  const articleId = pathSegment(path, "/api/admin/articles/");
  if (articleId) {
    if (request.method === "PATCH") { assertSameOrigin(request, env); return jsonResponse({ item: await updateArticle(env, articleId, await readJson(request, ARTICLE_JSON_LIMIT_BYTES)) }); }
    if (request.method === "DELETE") { assertSameOrigin(request, env); return jsonResponse(await deleteArticle(env, articleId)); }
    return methodNotAllowed(["PATCH", "DELETE"]);
  }

  if (path === "/api/admin/go-stats") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    return jsonResponse({ identity: { email: identity.email }, since: "60d", items: await listGoClicks(env) });
  }

  if (path === "/api/admin/media") {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      await drainMediaCleanupQueue(env);
    } catch (error) {
      console.error("Media cleanup queue drain failed", error);
    }
    const items = await listAdminMedia(env, baseUrl);
    return jsonResponse({ identity: { email: identity.email }, items });
  }

  if (path === "/api/admin/uploads") {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    assertSameOrigin(request, env);
    const payload = await readJson(request);
    const upload = await createMultipartUpload(env, payload, identity);
    return jsonResponse(upload, 201);
  }

  const partMatch = path.match(/^\/api\/admin\/uploads\/([^/]+)\/parts\/(\d+)$/);
  if (partMatch) {
    if (request.method !== "PUT") return methodNotAllowed(["PUT"]);
    assertSameOrigin(request, env);
    const sessionId = decodeRouteValue(partMatch[1]);
    const partNumber = Number(partMatch[2]);
    const uploaded = await uploadMultipartPart(env, sessionId, partNumber, request);
    return jsonResponse(uploaded);
  }

  const completeMatch = path.match(/^\/api\/admin\/uploads\/([^/]+)\/complete$/);
  if (completeMatch) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    assertSameOrigin(request, env);
    const payload = await readJson(request);
    const completed = await completeMultipartUpload(env, decodeRouteValue(completeMatch[1]), payload.parts);
    return jsonResponse(completed);
  }

  const abortMatch = path.match(/^\/api\/admin\/uploads\/([^/]+)\/abort$/);
  if (abortMatch) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    assertSameOrigin(request, env);
    const aborted = await abortMultipartUpload(env, decodeRouteValue(abortMatch[1]));
    return jsonResponse(aborted);
  }

  const posterMatch = path.match(/^\/api\/admin\/media\/([^/]+)\/poster$/);
  if (posterMatch) {
    if (request.method !== "PUT") return methodNotAllowed(["PUT"]);
    assertSameOrigin(request, env);
    const saved = await saveVideoThumbnail(env, decodeRouteValue(posterMatch[1]), request);
    return jsonResponse(saved);
  }

  const mediaId = pathSegment(path, "/api/admin/media/");
  if (mediaId) {
    if (request.method !== "PATCH" && request.method !== "DELETE") {
      return methodNotAllowed(["PATCH", "DELETE"]);
    }
    assertSameOrigin(request, env);
    if (request.method === "DELETE") {
      return jsonResponse(await deleteMedia(env, mediaId, identity));
    }
    const payload = await readJson(request);
    const item = await setMediaStatus(env, mediaId, payload.status, baseUrl);
    return jsonResponse({ item });
  }

  return jsonResponse({ error: "管理接口不存在。" }, 404);
}

async function handleAdminAsset(request, env) {
  if (!env.ASSETS) return textResponse("Static asset binding is missing.", 503);
  const original = new URL(request.url);
  if (original.pathname === "/admin") {
    return new Response(null, { status: 308, headers: { Location: "/admin/", ...securityHeaders } });
  }
  const allowed = new Set(["/admin/", "/admin/index.html", "/admin/styles.css", "/admin/script.js"]);
  const pathname = original.pathname;

  if (!allowed.has(pathname)) return textResponse("Not found", 404);

  const response = await env.ASSETS.fetch(request);
  return withHeaders(response, {
    "Cache-Control": "private, no-store",
    "Content-Security-Policy":
      "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "X-Robots-Tag": "noindex, nofollow",
  });
}

function publicFeedPayload(rows) {
  const updatedAt = rows.reduce((latest, item) => {
    if (!item.updatedAt) return latest;
    return !latest || item.updatedAt > latest ? item.updatedAt : latest;
  }, null);
  const items = rows.map(({ updatedAt: _updatedAt, ...item }) => item);
  return { version: 1, updatedAt, items };
}

function parseByteRange(header, size) {
  if (!header) return null;
  if (!header.startsWith("bytes=") || header.includes(",")) {
    throw new MediaError(416, "只支持单段字节范围请求。");
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) {
    throw new MediaError(416, "字节范围无效。");
  }

  let start;
  let end;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) throw new MediaError(416, "字节范围无效。");
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
      throw new MediaError(416, "字节范围超出文件大小。");
    }
    end = Math.min(end, size - 1);
  }

  return { offset: start, length: end - start + 1, start, end };
}

async function handleMediaFile(request, env, row) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);

  const head = await env.MEDIA_BUCKET.head(row.object_key);
  if (!head) return textResponse("Media file not found", 404);

  const etag = head.httpEtag || head.etag;
  /* If-Range 对不上（同一个键换过文件）就当没有 Range，整份重发，免得浏览器把新文件的片段接到旧片段后面。 */
  const ifRange = request.headers.get("If-Range");
  let range;
  try {
    range = parseByteRange(ifRange && ifRange !== etag ? null : request.headers.get("Range"), head.size);
  } catch (error) {
    if (error instanceof MediaError && error.status === 416) {
      return textResponse(error.message, 416, { "Content-Range": `bytes */${head.size}`, "Accept-Ranges": "bytes" });
    }
    throw error;
  }

  const headers = new Headers({
    "Content-Type": row.mime_type,
    "Accept-Ranges": "bytes",
    "Cache-Control": row.cacheControl || REVOCABLE_PUBLIC_CACHE,
    "Content-Disposition": `inline; filename="${row.slug}.${row.mime_type === "video/quicktime" ? "mov" : row.mime_type === "audio/mpeg" ? "mp3" : row.mime_type.split("/")[1].replace("jpeg", "jpg")}"`,
    ...securityHeaders,
  });
  if (etag) headers.set("ETag", etag);

  if (!range && etag && request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  if (range) {
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${head.size}`);
    headers.set("Content-Length", String(range.length));
  } else {
    headers.set("Content-Length", String(head.size));
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: range ? 206 : 200, headers });
  }

  const object = await env.MEDIA_BUCKET.get(row.object_key, range ? { range: { offset: range.offset, length: range.length } } : undefined);
  if (!object) return textResponse("Media file not found", 404);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}

async function handleVoiceClip(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  if (!env.ASSETS) return textResponse("Static asset binding is missing.", 503);

  /* 不把 Range 和条件请求头转给静态资源层：每次都拿整份，范围和 304 在这里算。每个文件只有几十 KB。 */
  const url = new URL(request.url);
  const asset = await env.ASSETS.fetch(new Request(new URL(url.pathname, url.origin), { method: "GET" }));
  if (asset.status !== 200) return textResponse("Voice clip not found", 404);

  const bytes = await asset.arrayBuffer();
  const size = bytes.byteLength;
  const etag = asset.headers.get("ETag");
  const headers = new Headers({
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": VOICE_CLIP_CACHE,
    ...securityHeaders,
  });
  if (etag) headers.set("ETag", etag);

  /* If-Range 对不上（文件换过了）就当没有 Range，整份重发。 */
  const ifRange = request.headers.get("If-Range");
  let range;
  try {
    range = parseByteRange(ifRange && ifRange !== etag ? null : request.headers.get("Range"), size);
  } catch (error) {
    if (error instanceof MediaError && error.status === 416) {
      return textResponse(error.message, 416, { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" });
    }
    throw error;
  }

  if (!range && etag && request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  if (range) headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(range ? range.length : size));
  const body = request.method === "HEAD" ? null : range ? bytes.slice(range.start, range.end + 1) : bytes;
  return new Response(body, { status: range ? 206 : 200, headers });
}

/* 代取 Aggie 的片子：把 Range / 条件请求头原样带给上游，状态码和长度、范围、ETag 带回来。 */
async function handleRelayedFilm(request, upstream) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  const forward = new Headers();
  for (const name of ["Range", "If-Range", "If-None-Match"]) {
    const value = request.headers.get(name);
    if (value) forward.set(name, value);
  }
  let response;
  try {
    response = await fetch(upstream, { method: request.method, headers: forward });
  } catch (error) {
    console.error("Relayed film fetch failed", error);
    return textResponse("Film is temporarily unavailable", 502);
  }
  if (![200, 206, 304, 416].includes(response.status)) return textResponse("Film is temporarily unavailable", 502);

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": FIXED_MEDIA_CACHE,
    ...securityHeaders,
  });
  for (const name of ["Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  const bodyless = request.method === "HEAD" || response.status === 304;
  return new Response(bodyless ? null : response.body, { status: response.status, headers });
}

async function loadGoExits(env, origin) {
  if (goRegistry.exits && Date.now() - goRegistry.loadedAt < GO_REGISTRY_TTL_MS) return goRegistry.exits;
  if (!env.ASSETS) return goRegistry.exits;
  try {
    const response = await env.ASSETS.fetch(new Request(new URL("/projects.json", origin)));
    if (response.ok) {
      const data = await response.json();
      goRegistry = { loadedAt: Date.now(), exits: data?.exits && typeof data.exits === "object" ? data.exits : {} };
    }
  } catch (error) {
    console.error("Exit registry could not be read", error);
  }
  return goRegistry.exits;
}

async function countGoClick(env, id, source) {
  try {
    await env.MEDIA_DB.prepare(
      `INSERT INTO go_clicks (exit_id, day, source, clicks) VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(exit_id, day, source) DO UPDATE SET clicks = clicks + 1`,
    ).bind(id, new Date().toISOString().slice(0, 10), source).run();
  } catch (error) {
    /* 记数失败不能挡住访客的跳转。 */
    console.error("Exit click was not counted", error);
  }
}

async function handleGo(request, env, ctx, id) {
  if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "POST") return methodNotAllowed(["GET", "HEAD", "POST"]);
  const url = new URL(request.url);
  const exit = (await loadGoExits(env, url.origin))?.[id];
  if (!exit?.url) return textResponse("Unknown exit", 404);

  const from = url.searchParams.get("from");
  const source = GO_SOURCES.has(from) ? from : "link";
  if (request.method !== "HEAD") {
    const counting = countGoClick(env, id, source);
    if (ctx?.waitUntil) ctx.waitUntil(counting);
    else await counting;
  }
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", ...securityHeaders };
  if (request.method === "POST") return new Response(null, { status: 204, headers });

  /* 目标只来自本站发布时生成的登记表，不接受任何来自请求的地址。外站带上来源标记，对方的统计里认得出“来自总部”。 */
  const target = new URL(exit.url, url.origin);
  if (target.origin !== url.origin) {
    target.searchParams.set("utm_source", "hepengyuan.com");
    target.searchParams.set("utm_medium", source);
    target.searchParams.set("utm_campaign", id);
  }
  return new Response(null, { status: 302, headers: { Location: target.href, ...headers } });
}

async function listGoClicks(env) {
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const result = await env.MEDIA_DB.prepare(
    "SELECT exit_id AS id, day, source, clicks FROM go_clicks WHERE day >= ?1 ORDER BY day DESC, clicks DESC LIMIT 2000",
  ).bind(since).all();
  return result.results || [];
}

async function handleMediaPoster(request, env, row) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  if (!row.thumbnail_key) return textResponse("Media poster not found", 404);
  const object = request.method === "HEAD" ? await env.MEDIA_BUCKET.head(row.thumbnail_key) : await env.MEDIA_BUCKET.get(row.thumbnail_key);
  if (!object) return textResponse("Media poster not found", 404);

  const headers = new Headers({
    "Content-Type": "image/webp",
    "Content-Length": String(object.size),
    "Cache-Control": REVOCABLE_PUBLIC_CACHE,
    ...securityHeaders,
  });
  const etag = object.httpEtag || object.etag;
  if (etag) headers.set("ETag", etag);
  if (etag && request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function handleAggie3AExperience(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);

  const object = request.method === "HEAD"
    ? await env.MEDIA_BUCKET.head(AGGIE_3A_OBJECT_KEY)
    : await env.MEDIA_BUCKET.get(AGGIE_3A_OBJECT_KEY);
  if (!object) return textResponse("Aggie 3A experience not found", 404);

  /* 游戏文件原样来自 R2，返回时在 <head> 末尾插入手机保护脚本（src/aggie-guard.js），
     所以长度未知、ETag 带上保护脚本的版本号，免得浏览器拿旧缓存（没有保护脚本）来对 304。 */
  const etag = object.etag ? `W/"${object.etag}-guard${AGGIE_GUARD_VERSION}"` : null;
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": REVOCABLE_PUBLIC_CACHE,
    "Content-Disposition": 'inline; filename="aggie-3a-v6.html"',
    "X-Aggie-Version": "V6",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'self' https://cloudflareinsights.com; worker-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Link": '<https://hepengyuan.com/aggie-3a/>; rel="canonical"',
    "X-Robots-Tag": "index, follow",
    ...securityHeaders,
  });
  if (etag) headers.set("ETag", etag);
  const ifNoneMatch = (request.headers.get("If-None-Match") || "").split(",").map((value) => value.trim());
  if (etag && ifNoneMatch.includes(etag)) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") return new Response(null, { headers });

  return new HTMLRewriter()
    .on("head", {
      element(head) {
        head.append(AGGIE_GUARD_TAG, { html: true });
      },
    })
    .transform(new Response(object.body, { headers }));
}

async function handlePublicDynamic(request, env, baseUrl, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const headOnly = request.method === "HEAD";

  const goId = GO_PATH.exec(path)?.[1];
  if (goId) return handleGo(request, env, ctx, goId);
  if (AGGIE_FILMS.has(path)) return handleRelayedFilm(request, AGGIE_FILMS.get(path));

  if (path === "/aggie-3a" || path === "/aggie-3a/index.html") {
    return new Response(null, { status: 308, headers: { Location: AGGIE_3A_ROUTE, ...securityHeaders } });
  }
  if (path === AGGIE_3A_ROUTE) return handleAggie3AExperience(request, env);

  if (path === "/api/articles.json") {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    const items = await listPublishedArticles(env);
    const response = jsonResponse({ version: 1, items }, 200, { "Cache-Control": REVOCABLE_PUBLIC_CACHE, "Access-Control-Allow-Origin": "*" });
    return headOnly ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
  if (path === "/blog" || path === "/blog/") {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    return htmlResponse(renderBlogIndexPage(await listPublishedArticles(env), baseUrl), 200, { head: headOnly });
  }
  const articleMatch = path.match(/^\/blog\/([^/]+)\/?$/);
  const articleSlug = articleMatch ? decodeRouteValue(articleMatch[1]) : null;
  if (articleSlug) {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    const article = await findPublishedArticle(env, articleSlug);
    return article ? htmlResponse(renderArticlePage(article, baseUrl), 200, { head: headOnly }) : htmlResponse(renderNotFoundPage(baseUrl), 404, { head: headOnly });
  }
  if (path === "/sitemap-blog.xml") {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    const xml = renderBlogSitemap(await listPublishedArticles(env, 50), baseUrl);
    return new Response(headOnly ? null : xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": REVOCABLE_PUBLIC_CACHE, ...securityHeaders } });
  }

  if (path === "/api/media.json") {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    const rows = await listPublishedMedia(env, baseUrl);
    const response = jsonResponse(publicFeedPayload(rows), 200, {
      "Cache-Control": REVOCABLE_PUBLIC_CACHE,
      "Access-Control-Allow-Origin": "*",
    });
    return headOnly ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }

  if (path === "/travel" || path === "/travel/" || path === "/learning" || path === "/learning/") {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    const category = path.startsWith("/travel") ? "travel" : "learning";
    const items = await listPublishedMedia(env, baseUrl, category);
    return htmlResponse(renderArchivePage(category, items, baseUrl), 200, { head: headOnly });
  }

  const storySlug = pathSegment(path, "/stories/");
  if (storySlug) {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    const item = await findPublishedMedia(env, storySlug);
    if (!item) return htmlResponse(renderNotFoundPage(baseUrl), 404, { head: headOnly });
    return htmlResponse(renderStoryPage(item, baseUrl), 200, { head: headOnly });
  }

  const fileSlug = pathSegment(path, "/media/file/");
  if (fileSlug) {
    const item = await findPublishedMedia(env, fileSlug);
    if (!item) return textResponse("Media file not found", 404);
    return handleMediaFile(request, env, item);
  }

  if (path === PROMO_VIDEO_ROUTE) {
    return handleMediaFile(request, env, {
      slug: "pengyuan-personal-promo",
      mime_type: "video/mp4",
      object_key: PROMO_VIDEO_KEY,
      cacheControl: FIXED_MEDIA_CACHE,
    });
  }

  if (path === PROMO_VIDEO_MOBILE_ROUTE) {
    return handleMediaFile(request, env, {
      slug: "pengyuan-personal-promo-720p",
      mime_type: "video/mp4",
      object_key: PROMO_VIDEO_MOBILE_KEY,
      cacheControl: FIXED_MEDIA_CACHE,
    });
  }

  if (MUSIC_ROUTES.has(path)) {
    return handleMediaFile(request, env, {
      slug: path.split("/").pop().replace(/\.mp3$/, ""),
      mime_type: "audio/mpeg",
      object_key: MUSIC_ROUTES.get(path),
      cacheControl: FIXED_MEDIA_CACHE,
    });
  }

  const posterSlug = pathSegment(path, "/media/poster/");
  if (posterSlug) {
    const item = await findPublishedMedia(env, posterSlug);
    if (!item) return textResponse("Media poster not found", 404);
    return handleMediaPoster(request, env, item);
  }

  if (path === "/sitemap-media.xml") {
    if (request.method !== "GET" && !headOnly) return methodNotAllowed(["GET", "HEAD"]);
    const items = await listPublishedMedia(env, baseUrl);
    const xml = renderMediaSitemap(items, baseUrl);
    return new Response(headOnly ? null : xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": REVOCABLE_PUBLIC_CACHE,
        ...securityHeaders,
      },
    });
  }

  return null;
}

function isPublicStaticPath(pathname) {
  return PUBLIC_STATIC_FILES.has(pathname) || pathname.startsWith("/assets/") || pathname.startsWith("/samples/");
}

async function routeRequest(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const baseUrl = siteBase(env);

  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/")) {
    const identity = await verifyAccessIdentity(request, env);
    if (path.startsWith("/api/admin/")) return handleAdminApi(request, env, identity, baseUrl);
    if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    return handleAdminAsset(request, env);
  }

  if (VOICE_CLIP_PATH.test(path)) return handleVoiceClip(request, env);

  const dynamic = await handlePublicDynamic(request, env, baseUrl, ctx);
  if (dynamic) return dynamic;

  if (isPublicStaticPath(path)) {
    if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    if (!env.ASSETS) return textResponse("Static asset binding is missing.", 503);
    return withHeaders(await env.ASSETS.fetch(request));
  }

  return htmlResponse(renderNotFoundPage(baseUrl), 404, { head: request.method === "HEAD" });
}

function errorResponse(request, error) {
  const status = error instanceof AuthError || error instanceof MediaError || error instanceof ArticleError ? error.status : 500;
  const message = error instanceof AuthError || error instanceof MediaError || error instanceof ArticleError ? error.message : "服务器暂时无法处理请求。";
  const path = new URL(request.url).pathname;

  if (!(error instanceof AuthError || error instanceof MediaError || error instanceof ArticleError)) {
    console.error("Unhandled media worker error", error);
  }

  if ((path === "/admin" || path.startsWith("/admin/")) && !path.startsWith("/api/")) {
    return htmlResponse(renderAccessDeniedPage(message), status, { admin: true, head: request.method === "HEAD" });
  }

  return jsonResponse({ error: message }, status);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await routeRequest(request, env, ctx);
    } catch (error) {
      return errorResponse(request, error);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      drainMediaCleanupQueue(env, 100).catch((error) => {
        console.error("Scheduled media cleanup queue drain failed", error);
      }),
    );
  },
};

export { parseByteRange, publicFeedPayload, siteBase };
