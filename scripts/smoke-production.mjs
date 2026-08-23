const configuredOrigin = process.env.SMOKE_ORIGIN || "https://hepengyuan.top";
const origin = new URL(configuredOrigin).origin;

const checks = [
  { path: "/", type: "text/html", includes: "何鹏远" },
  { path: "/robots.txt", type: "text/plain", includes: "OAI-SearchBot" },
  { path: "/sitemap.xml", type: "application/xml", includes: "hepengyuan.top" },
  { path: "/profile.json", type: "application/json", includes: "何鹏远" },
  { path: "/llms.txt", type: "text/plain", includes: "Canonical identity" },
  { path: "/api/media.json", type: "application/json", json: true },
  { path: "/travel/", type: "text/html", includes: "旅行影像" },
  { path: "/learning/", type: "text/html", includes: "学习视频" },
  { path: "/sitemap-media.xml", type: "application/xml", includes: "urlset" },
];

for (const check of checks) {
  const target = new URL(check.path, origin);
  const response = await fetch(target, { signal: AbortSignal.timeout(20_000) });
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`${target.href} returned ${response.status}.`);
  }
  if (!contentType.includes(check.type)) {
    throw new Error(`${target.href} returned unexpected Content-Type: ${contentType || "missing"}.`);
  }

  if (check.json) {
    const payload = await response.json();
    if (payload?.version !== 1 || !Array.isArray(payload.items)) {
      throw new Error(`${target.href} does not expose the expected public media feed.`);
    }
  } else {
    const body = await response.text();
    if (!body.includes(check.includes)) {
      throw new Error(`${target.href} is missing the expected public content.`);
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
