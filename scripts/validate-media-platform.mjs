import { readFile, stat } from "node:fs/promises";
import { webcrypto } from "node:crypto";

import { verifyAccessIdentity } from "../src/auth.js";
import {
  UPLOAD_PART_SIZE,
  mapPublicRow,
  matchesFileSignature,
  validateCreateInput,
} from "../src/media-store.js";
import {
  escapeXml,
  renderArchivePage,
  renderMediaSitemap,
  renderStoryPage,
  safeJsonLd,
} from "../src/render.js";
import { parseByteRange, publicFeedPayload } from "../src/worker.js";

const requiredFiles = [
  "admin/index.html",
  "admin/styles.css",
  "admin/script.js",
  "src/auth.js",
  "src/media-store.js",
  "src/render.js",
  "src/worker.js",
  "migrations/0001_media.sql",
  "migrations/0002_add_video_duration.sql",
  "wrangler.jsonc",
  ".dev.vars.example",
  "docs/cloudflare-media-setup.md",
];

function assert(condition, message) {
  if (!condition) throw new Error(`Media platform validation failed: ${message}`);
}

async function expectMediaError(action, status, message) {
  try {
    await action();
  } catch (error) {
    assert(error?.status === status, `${message} returned ${error?.status ?? "no status"}, expected ${status}`);
    return;
  }
  throw new Error(`Media platform validation failed: ${message} was accepted`);
}

for (const file of requiredFiles) {
  const info = await stat(file);
  assert(info.isFile() && info.size > 0, `${file} is missing or empty`);
}

const [adminHtml, adminScript, workerSource, authSource, migrationOne, migrationTwo, wrangler, releasePreflight, productionSmoke] = await Promise.all([
  readFile("admin/index.html", "utf8"),
  readFile("admin/script.js", "utf8"),
  readFile("src/worker.js", "utf8"),
  readFile("src/auth.js", "utf8"),
  readFile("migrations/0001_media.sql", "utf8"),
  readFile("migrations/0002_add_video_duration.sql", "utf8"),
  readFile("wrangler.jsonc", "utf8"),
  readFile("scripts/release-preflight.mjs", "utf8"),
  readFile("scripts/smoke-production.mjs", "utf8"),
]);

for (const expected of [
  '"workers_dev": false',
  '"preview_urls": false',
  '"directory": "./dist"',
  '"binding": "MEDIA_DB"',
  '"binding": "MEDIA_BUCKET"',
  '"pattern": "hepengyuan.top"',
  '"/api/*"',
  '"/admin/*"',
]) {
  assert(wrangler.includes(expected), `wrangler.jsonc is missing ${expected}`);
}
assert(!wrangler.includes('"directory": "."'), "Static Assets must never publish the repository root");

for (const expected of ["noindex,nofollow,noarchive", "type=\"file\"", "privacyConfirmed", "默认草稿"]) {
  assert(adminHtml.includes(expected), `admin interface is missing ${expected}`);
}
for (const expected of ["sanitizeImage", "createVideoPoster", "补封面", "mediaSavedWithoutPoster"]) {
  assert(adminScript.includes(expected), `admin upload behavior is missing ${expected}`);
}
for (const expected of ["Cf-Access-Jwt-Assertion", "crypto.subtle.verify", "payload.iss", "payload.aud", "ADMIN_EMAILS"]) {
  assert(authSource.includes(expected), `Access verification is missing ${expected}`);
}
for (const expected of ["status IN ('draft', 'published')", "upload_state", "thumbnail_key", "created_by_email"]) {
  assert(migrationOne.includes(expected), `D1 base migration is missing ${expected}`);
}
assert(migrationTwo.includes("duration_seconds"), "D1 duration migration is missing duration_seconds");
assert(workerSource.includes("Accept-Ranges"), "public video response is missing Range support");
assert(workerSource.includes("findPublishedMedia"), "public file routes must verify the published D1 record");
assert(!workerSource.includes("max-age=31536000, immutable"), "revocable media must not use immutable browser caching");
assert(workerSource.includes("REVOCABLE_PUBLIC_CACHE"), "revocable public responses must share one revalidation policy");
assert(!workerSource.includes("stale-while-revalidate"), "withdrawn media metadata must not be served stale");
assert(releasePreflight.includes("PRODUCTION_COMMIT_SHA is required"), "release must require the deployed production commit");
assert(releasePreflight.includes("ALLOW_FIRST_DEPLOY=true"), "first deployment must require an explicit opt-in");
assert(releasePreflight.includes("ADMIN_DEV_BYPASS must never"), "release must reject a production development bypass");
assert(releasePreflight.includes("No origin remote exists"), "release must require origin/main synchronization");
assert(releasePreflight.includes("PAGES_TO_WORKER_CUTOVER_CONFIRMED=true"), "Pages to Worker cutover must require explicit confirmation");
assert(releasePreflight.includes("PAGES_ROLLBACK_URL"), "Pages to Worker cutover must require a rollback snapshot");
assert(releasePreflight.includes("does not contain the expected 何鹏远 site identity"), "Pages rollback snapshot must verify the expected site content");
assert(productionSmoke.includes("did not redirect to Cloudflare Access"), "production smoke must reject a Worker-only 401/403 response");
assert(productionSmoke.includes('.cloudflareaccess.com'), "production smoke must verify the Access login host");

const validVideo = validateCreateInput({
  category: "learning",
  slug: "ai-learning-notes",
  title: "学习记录",
  mimeType: "video/mp4",
  fileSize: UPLOAD_PART_SIZE + 10,
  durationSeconds: 62.5,
});
assert(validVideo.totalParts === 2, "multipart part count is incorrect");
assert(validVideo.durationSeconds === 62.5, "video duration was not preserved");

const validImage = validateCreateInput({
  category: "travel",
  slug: "verified-travel-photo",
  title: "旅行照片",
  alt: "本人确认公开的一张旅行照片",
  mimeType: "image/webp",
  fileSize: 1024,
});
assert(validImage.mediaType === "image", "valid public image was rejected");

await expectMediaError(
  () => validateCreateInput({ ...validImage, category: "learning", mimeType: "image/webp", fileSize: 1024 }),
  400,
  "learning image",
);
await expectMediaError(
  () => validateCreateInput({ ...validVideo, mimeType: "image/svg+xml", fileSize: 1024 }),
  415,
  "SVG upload",
);
await expectMediaError(
  () => validateCreateInput({ ...validVideo, durationSeconds: null }),
  400,
  "video without a readable duration",
);

const webpHeader = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
assert(matchesFileSignature(webpHeader, "image/webp"), "valid WebP signature was rejected");
assert(!matchesFileSignature(webpHeader, "video/mp4"), "mismatched WebP signature was accepted as MP4");

assert(JSON.stringify(parseByteRange("bytes=0-99", 1000)) === JSON.stringify({ offset: 0, length: 100, start: 0, end: 99 }), "explicit byte range is incorrect");
assert(JSON.stringify(parseByteRange("bytes=-50", 1000)) === JSON.stringify({ offset: 950, length: 50, start: 950, end: 999 }), "suffix byte range is incorrect");
await expectMediaError(() => parseByteRange("bytes=1000-1001", 1000), 416, "out-of-bounds byte range");

const publicItem = mapPublicRow(
  {
    slug: "verified-video",
    category: "learning",
    media_type: "video",
    mime_type: "video/mp4",
    title: "公开学习视频",
    description: "本人确认公开的学习记录。",
    alt_text: null,
    country: null,
    city: null,
    captured_on: "2026-08-23",
    duration_seconds: 62.5,
    published_at: "2026-08-23T00:00:00.000Z",
    thumbnail_key: "private/poster.webp",
    object_key: "private/video.mp4",
    created_by_email: "must-not-leak@example.com",
  },
  "https://hepengyuan.top",
);
assert(publicItem.thumbnailUrl === "https://hepengyuan.top/media/poster/verified-video", "public poster URL is incorrect");
assert(publicItem.durationSeconds === 62.5, "public feed lost video duration");
assert(!("objectKey" in publicItem) && !JSON.stringify(publicItem).includes("must-not-leak"), "public media row leaked private metadata");

const feed = publicFeedPayload([{ ...publicItem, updatedAt: "2026-08-23T01:00:00.000Z" }]);
assert(feed.version === 1 && feed.updatedAt === "2026-08-23T01:00:00.000Z", "public feed envelope is incorrect");
assert(!("updatedAt" in feed.items[0]), "per-item internal updatedAt leaked into public feed");

const malicious = "测试 </script><img src=x onerror=alert(1)>";
assert(!safeJsonLd({ malicious }).includes("</script>"), "JSON-LD escaping permits a closing script tag");
assert(!escapeXml("visible\u0001text").includes("\u0001"), "XML renderer retained an XML 1.0 control character");
const story = renderStoryPage(
  {
    slug: "verified-video",
    category: "learning",
    media_type: "video",
    mime_type: "video/mp4",
    title: malicious,
    description: malicious,
    alt_text: null,
    country: null,
    city: null,
    captured_on: "2026-08-23",
    duration_seconds: 62.5,
    published_at: "2026-08-23T00:00:00.000Z",
    thumbnail_key: "private/poster.webp",
  },
  "https://hepengyuan.top",
);
assert(!story.includes(`${malicious}</h1>`), "story renderer injected unescaped HTML");
assert(story.includes('"duration":"PT1M2.5S"'), "VideoObject is missing ISO 8601 duration");
assert(story.includes('"thumbnailUrl":"https://hepengyuan.top/media/poster/verified-video"'), "VideoObject is missing its real poster URL");

const emptyArchive = renderArchivePage("travel", [], "https://hepengyuan.top");
assert(emptyArchive.includes("当前没有已公开的旅行照片或视频"), "empty archive is missing the factual empty state");
const mediaSitemap = renderMediaSitemap([{ ...publicItem, updatedAt: "2026-08-23T01:00:00.000Z" }], "https://hepengyuan.top");
assert(mediaSitemap.includes("xmlns:video="), "media sitemap is missing the video namespace");
assert(mediaSitemap.includes("<video:duration>63</video:duration>"), "media sitemap is missing video duration");
assert(mediaSitemap.includes("<loc>https://hepengyuan.top/learning/</loc><lastmod>2026-08-23</lastmod>"), "media sitemap directory is missing its latest publication date");

const localIdentity = await verifyAccessIdentity(new Request("http://localhost:8787/api/admin/media"), {
  ADMIN_DEV_BYPASS: "true",
});
assert(localIdentity.source === "local-bypass", "explicit localhost development bypass failed");
const routedLocalIdentity = await verifyAccessIdentity(new Request("https://hepengyuan.top/api/admin/media"), {
  ADMIN_DEV_BYPASS: "true",
  PUBLIC_SITE_URL: "http://127.0.0.1:8787",
});
assert(routedLocalIdentity.source === "local-bypass", "Wrangler local route development bypass failed");
await expectMediaError(
  () => verifyAccessIdentity(new Request("https://hepengyuan.top/api/admin/media"), { ADMIN_DEV_BYPASS: "true" }),
  500,
  "production development bypass",
);
await expectMediaError(
  () =>
    verifyAccessIdentity(
      new Request("https://hepengyuan.top/api/admin/media", { headers: { "CF-Connecting-IP": "127.0.0.1" } }),
      { ADMIN_DEV_BYPASS: "true" },
    ),
  500,
  "spoofed production development bypass",
);

const cryptoApi = globalThis.crypto ?? webcrypto;
const keys = await cryptoApi.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"],
);
const publicJwk = await cryptoApi.subtle.exportKey("jwk", keys.publicKey);
Object.assign(publicJwk, { kid: "validator-key", alg: "RS256", use: "sig" });
const encodePart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const issuer = "https://validator.cloudflareaccess.com";
const audience = "validator-audience";
const email = "owner@example.com";
const encodedHeader = encodePart({ alg: "RS256", kid: publicJwk.kid, typ: "JWT" });
const encodedPayload = encodePart({
  iss: issuer,
  aud: [audience],
  email,
  iat: Math.floor(Date.now() / 1000) - 5,
  exp: Math.floor(Date.now() / 1000) + 300,
});
const signingInput = `${encodedHeader}.${encodedPayload}`;
const signature = await cryptoApi.subtle.sign(
  "RSASSA-PKCS1-v1_5",
  keys.privateKey,
  new TextEncoder().encode(signingInput),
);
const token = `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (target) => {
  assert(String(target) === `${issuer}/cdn-cgi/access/certs`, "Access verifier requested an unexpected JWK endpoint");
  return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { "Content-Type": "application/json" } });
};

try {
  const verified = await verifyAccessIdentity(
    new Request("https://hepengyuan.top/api/admin/media", { headers: { "Cf-Access-Jwt-Assertion": token } }),
    { CF_ACCESS_ISSUER: issuer, CF_ACCESS_AUD: audience, ADMIN_EMAILS: email },
  );
  assert(verified.email === email && verified.source === "cloudflare-access", "valid Access JWT was not accepted");
  const tamperedSignature = Buffer.from(signature);
  tamperedSignature[0] ^= 1;
  const tampered = `${signingInput}.${tamperedSignature.toString("base64url")}`;
  await expectMediaError(
    () => verifyAccessIdentity(
      new Request("https://hepengyuan.top/api/admin/media", { headers: { "Cf-Access-Jwt-Assertion": tampered } }),
      { CF_ACCESS_ISSUER: issuer, CF_ACCESS_AUD: audience, ADMIN_EMAILS: email },
    ),
    401,
    "tampered Access JWT",
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Media platform validation passed: storage policy, draft isolation, GEO rendering, Range, and Access JWT.");
