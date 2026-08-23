const ACCESS_ASSERTION_HEADER = "Cf-Access-Jwt-Assertion";
const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

const jwksCache = new Map();

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  } catch {
    throw new AuthError(401, "访问凭证格式无效。");
  }
}

function normalizeIssuer(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function validateIssuerConfiguration(issuer) {
  let parsed;

  try {
    parsed = new URL(issuer);
  } catch {
    throw new AuthError(500, "CF_ACCESS_ISSUER 配置无效。");
  }

  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".cloudflareaccess.com")) {
    throw new AuthError(500, "CF_ACCESS_ISSUER 必须是 Cloudflare Access HTTPS 域名。");
  }
}

function parseAllowedEmails(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function audienceMatches(claim, expected) {
  if (Array.isArray(claim)) {
    return claim.includes(expected);
  }

  return claim === expected;
}

async function getAccessKeys(issuer, forceRefresh = false) {
  const cached = jwksCache.get(issuer);
  const now = Date.now();

  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.keys;
  }

  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new AuthError(503, "暂时无法验证管理身份。");
  }

  const payload = await response.json();
  const keys = Array.isArray(payload.keys) ? payload.keys : [];

  if (keys.length === 0) {
    throw new AuthError(503, "Cloudflare Access 未返回可用公钥。");
  }

  jwksCache.set(issuer, { keys, expiresAt: now + JWKS_CACHE_TTL_MS });
  return keys;
}

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

export function isLocalDevelopmentRequest(request, env) {
  if (String(env.ADMIN_DEV_BYPASS).toLowerCase() !== "true") return false;

  let configuredHostname = "";
  try {
    configuredHostname = new URL(env.PUBLIC_SITE_URL).hostname;
  } catch {
    configuredHostname = "";
  }

  return isLocalHostname(new URL(request.url).hostname) || isLocalHostname(configuredHostname);
}

export async function verifyAccessIdentity(request, env) {
  if (isLocalDevelopmentRequest(request, env)) {
    return { email: "local-dev@localhost", source: "local-bypass" };
  }

  const issuer = normalizeIssuer(env.CF_ACCESS_ISSUER);
  const expectedAudience = String(env.CF_ACCESS_AUD || "").trim();
  const allowedEmails = parseAllowedEmails(env.ADMIN_EMAILS);

  if (!issuer || !expectedAudience || allowedEmails.size === 0) {
    throw new AuthError(500, "Cloudflare Access 管理员配置不完整。");
  }

  validateIssuerConfiguration(issuer);

  const assertion = request.headers.get(ACCESS_ASSERTION_HEADER);
  if (!assertion) {
    throw new AuthError(401, "需要通过 Cloudflare Access 登录。");
  }

  const parts = assertion.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new AuthError(401, "访问凭证格式无效。");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const payload = decodeJsonPart(encodedPayload);

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new AuthError(401, "访问凭证签名算法无效。");
  }

  let keys = await getAccessKeys(issuer);
  let signingKey = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!signingKey) {
    keys = await getAccessKeys(issuer, true);
    signingKey = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  }
  if (!signingKey) {
    throw new AuthError(401, "访问凭证使用了未知签名密钥。");
  }

  let cryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "jwk",
      signingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    throw new AuthError(503, "Cloudflare Access 公钥无法读取。");
  }

  let validSignature = false;
  try {
    validSignature = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    );
  } catch {
    throw new AuthError(401, "访问凭证签名无效。");
  }

  if (!validSignature) {
    throw new AuthError(401, "访问凭证签名无效。");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now - CLOCK_SKEW_SECONDS) {
    throw new AuthError(401, "访问凭证已过期。");
  }

  if (typeof payload.nbf === "number" && payload.nbf > now + CLOCK_SKEW_SECONDS) {
    throw new AuthError(401, "访问凭证尚未生效。");
  }

  if (typeof payload.iat === "number" && payload.iat > now + CLOCK_SKEW_SECONDS) {
    throw new AuthError(401, "访问凭证签发时间无效。");
  }

  if (normalizeIssuer(payload.iss) !== issuer || !audienceMatches(payload.aud, expectedAudience)) {
    throw new AuthError(401, "访问凭证不属于本站管理后台。");
  }

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || !allowedEmails.has(email)) {
    throw new AuthError(403, "当前账号没有媒体后台权限。");
  }

  return { email, source: "cloudflare-access" };
}
