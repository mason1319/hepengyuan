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
const CANONICAL_SITE = "https://hepengyuan.com";
const REVOCABLE_PUBLIC_CACHE = "public, no-cache, max-age=0, must-revalidate";

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

async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > JSON_LIMIT_BYTES) {
    throw new MediaError(413, "请求内容过大。");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > JSON_LIMIT_BYTES) {
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
    if (request.method === "POST") { assertSameOrigin(request, env); return jsonResponse({ item: await createArticle(env, await readJson(request), identity) }, 201); }
    return methodNotAllowed(["GET", "POST"]);
  }
  const articleId = pathSegment(path, "/api/admin/articles/");
  if (articleId) {
    if (request.method === "PATCH") { assertSameOrigin(request, env); return jsonResponse({ item: await updateArticle(env, articleId, await readJson(request)) }); }
    if (request.method === "DELETE") { assertSameOrigin(request, env); return jsonResponse(await deleteArticle(env, articleId)); }
    return methodNotAllowed(["PATCH", "DELETE"]);
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

  let range;
  try {
    range = parseByteRange(request.headers.get("Range"), head.size);
  } catch (error) {
    if (error instanceof MediaError && error.status === 416) {
      return textResponse(error.message, 416, { "Content-Range": `bytes */${head.size}`, "Accept-Ranges": "bytes" });
    }
    throw error;
  }

  const etag = head.httpEtag || head.etag;
  const headers = new Headers({
    "Content-Type": row.mime_type,
    "Accept-Ranges": "bytes",
    "Cache-Control": REVOCABLE_PUBLIC_CACHE,
    "Content-Disposition": `inline; filename="${row.slug}.${row.mime_type === "video/quicktime" ? "mov" : row.mime_type.split("/")[1].replace("jpeg", "jpg")}"`,
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

async function handlePublicDynamic(request, env, baseUrl) {
  const url = new URL(request.url);
  const path = url.pathname;
  const headOnly = request.method === "HEAD";

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

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const baseUrl = siteBase(env);

  if (path === "/admin" || path.startsWith("/admin/") || path.startsWith("/api/admin/")) {
    const identity = await verifyAccessIdentity(request, env);
    if (path.startsWith("/api/admin/")) return handleAdminApi(request, env, identity, baseUrl);
    if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
    return handleAdminAsset(request, env);
  }

  const dynamic = await handlePublicDynamic(request, env, baseUrl);
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
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
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
