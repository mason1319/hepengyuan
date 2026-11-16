const configuredOrigin = process.env.SMOKE_ORIGIN || "https://hepengyuan.com";
const origin = new URL(configuredOrigin).origin;

const checks = [
  { path: "/", type: "text/html", includes: "何鹏远" },
  { path: "/robots.txt", type: "text/plain", includes: "OAI-SearchBot" },
  { path: "/sitemap.xml", type: "application/xml", includes: "hepengyuan.com" },
  { path: "/profile.json", type: "application/json", includes: "何鹏远" },
  { path: "/llms.txt", type: "text/plain", includes: "Canonical identity" },
  { path: "/api/media.json", type: "application/json", json: true },
  { path: "/travel/", type: "text/html", includes: "旅行影像" },
  { path: "/learning/", type: "text/html", includes: "学习视频" },
  { path: "/sitemap-media.xml", type: "application/xml", includes: "urlset" },
  /* 公开的文章接口：不能带后台登录邮箱。 */
  { path: "/api/articles.json", type: "application/json", includes: '"items"', excludes: "createdByEmail" },
  { path: "/aggie-3a/", type: "text/html", includes: "Aggie速记英语3A大作 · V6" },
  { path: "/aggie-3a/", type: "text/html", includes: '<script id="hpy-aggie-guard"' },
  { path: "/media/promo/pengyuan-personal-promo.mp4", type: "video/mp4", method: "HEAD" },
  { path: "/media/promo/pengyuan-personal-promo-720p.mp4", type: "video/mp4", method: "HEAD" },
  /* 流畅版（360p）：慢网络时放映机自动换成它，三部都在 R2，必须支持分段请求。 */
  { path: "/media/promo/pengyuan-personal-promo-360p.mp4", type: "video/mp4", range: true },
  { path: "/media/aggie/learning-15s-360p.mp4", type: "video/mp4", range: true },
  { path: "/media/aggie/brand-film-360p.mp4", type: "video/mp4", range: true },
  { path: "/media/music/lai-zi-gao-wei-de-ni.mp3", type: "audio/mpeg", method: "HEAD" },
  { path: "/en/", type: "text/html", includes: "Hi, I'm He Pengyuan." },
  { path: "/de/", type: "text/html", includes: "Hallo, ich bin He Pengyuan." },
  { path: "/ko/", type: "text/html", includes: "안녕하세요, 허펑위안입니다." },
  { path: "/room/boot.js", type: "javascript", includes: "hpy-room" },
  { path: "/room/scene.js", type: "javascript", includes: "export async function mount" },
  { path: "/room/avatar.js", type: "javascript", includes: "export function start" },
  { path: "/assets/room/voice/hello.mp3", type: "audio/mpeg", minBytes: 10_000 },
  { path: "/assets/room/voice/hello.mp3", type: "audio/mpeg", range: true },
  { path: "/assets/room/voice/stop-tv.mp3", type: "audio/mpeg", minBytes: 10_000 },
  { path: "/assets/vendor/three-0.170.0.module.min.js", type: "javascript", includes: "SPDX-License-Identifier: MIT" },
];

for (const check of checks) {
  const target = new URL(check.path, origin);
  const response = await fetch(target, {
    method: check.method || "GET",
    headers: check.range ? { Range: "bytes=0-1" } : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`${target.href} returned ${response.status}.`);
  }
  if (!contentType.includes(check.type)) {
    throw new Error(`${target.href} returned unexpected Content-Type: ${contentType || "missing"}.`);
  }

  if (check.range) {
    /* iPhone 播音视频前先发 bytes=0-1 探测；苹果要求服务器答 206。静态资源层做不到，这些文件要由 Worker 代答。 */
    const contentRange = response.headers.get("content-range") || "";
    const size = (await response.arrayBuffer()).byteLength;
    if (response.status !== 206 || !/^bytes 0-1\/\d+$/.test(contentRange) || size !== 2) {
      throw new Error(`${target.href} ignored a byte-range request: ${response.status}, Content-Range "${contentRange}", ${size} bytes.`);
    }
  } else if (check.method === "HEAD") {
    const length = Number(response.headers.get("content-length") || "0");
    if (!Number.isFinite(length) || length <= 0) {
      throw new Error(`${target.href} returned an empty or missing Content-Length.`);
    }
  } else if (check.minBytes) {
    /* 静态资源（Workers Static Assets）的 HEAD 响应不带 Content-Length，只有 Worker 从 R2 发的 /media/* 才带。
       所以仓库里的小二进制文件不用 HEAD，直接取回来量大小。 */
    const size = (await response.arrayBuffer()).byteLength;
    if (size < check.minBytes) {
      throw new Error(`${target.href} is only ${size} bytes; expected at least ${check.minBytes}.`);
    }
  } else if (check.json) {
    const payload = await response.json();
    if (payload?.version !== 1 || !Array.isArray(payload.items)) {
      throw new Error(`${target.href} does not expose the expected public media feed.`);
    }
  } else {
    const body = await response.text();
    if (!body.includes(check.includes)) {
      throw new Error(`${target.href} is missing the expected public content.`);
    }
    if (check.excludes && body.includes(check.excludes)) {
      throw new Error(`${target.href} exposes "${check.excludes}", which must not be public.`);
    }
  }

  console.log(`Smoke passed: ${target.href}`);
}

if (process.env.SMOKE_SKIP_ACCESS !== "true") {
  for (const path of ["/admin/", "/api/admin/media"]) {
    const target = new URL(path, origin);
    const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    const redirectStatuses = new Set([301, 302, 303, 307, 308]);

    if (!redirectStatuses.has(response.status)) {
      throw new Error(`${target.href} did not redirect to Cloudflare Access; received ${response.status}.`);
    }

    let loginUrl;
    try {
      loginUrl = new URL(response.headers.get("location"));
    } catch {
      throw new Error(`${target.href} redirected without a valid Cloudflare Access login URL.`);
    }
    if (!loginUrl.hostname.endsWith(".cloudflareaccess.com")) {
      throw new Error(`${target.href} redirected outside Cloudflare Access: ${loginUrl.href}.`);
    }

    console.log(`Access smoke passed: ${target.href}`);
  }
}

console.log(`Production smoke passed for ${origin}.`);
