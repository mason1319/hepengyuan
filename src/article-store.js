const CATEGORIES = new Set(["ai", "product", "learning", "life", "notes"]);

export class ArticleError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function text(value, max, label, required = false) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new ArticleError(400, `${label}不能为空。`);
  if (result.length > max) throw new ArticleError(400, `${label}不能超过 ${max} 个字符。`);
  return result;
}

function normalize(payload = {}) {
  const slug = text(payload.slug, 100, "slug", true).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ArticleError(400, "slug 只能使用小写字母、数字和连字符。");
  const category = text(payload.category || "notes", 20, "分类");
  if (!CATEGORIES.has(category)) throw new ArticleError(400, "文章分类无效。");
  const status = payload.status === "published" ? "published" : "draft";
  return { slug, title: text(payload.title, 120, "标题", true), excerpt: text(payload.excerpt, 300, "摘要"), content: text(payload.content, 100000, "正文", true), category, status, pinned: payload.pinned ? 1 : 0 };
}

function map(row) {
  if (!row) return null;
  return { id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt || "", content: row.content || "", category: row.category, status: row.status, pinned: Boolean(row.pinned), createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at, createdByEmail: row.created_by_email, url: `/blog/${encodeURIComponent(row.slug)}/` };
}

export async function listPublishedArticles(env, limit = 20) {
  const result = await env.MEDIA_DB.prepare("SELECT * FROM articles WHERE status = 'published' ORDER BY pinned DESC, published_at DESC, updated_at DESC LIMIT ?").bind(Math.min(50, Math.max(1, Number(limit) || 20))).all();
  return (result.results || []).map(map);
}

export async function findPublishedArticle(env, slug) {
  const result = await env.MEDIA_DB.prepare("SELECT * FROM articles WHERE slug = ? AND status = 'published' LIMIT 1").bind(slug).first();
  return map(result);
}

export async function listAdminArticles(env) {
  const result = await env.MEDIA_DB.prepare("SELECT * FROM articles ORDER BY CASE status WHEN 'draft' THEN 0 ELSE 1 END, updated_at DESC").all();
  return (result.results || []).map(map);
}

export async function createArticle(env, payload, identity) {
  const value = normalize(payload);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const publishedAt = value.status === "published" ? now : null;
  try {
    await env.MEDIA_DB.prepare("INSERT INTO articles (id, slug, title, excerpt, content, category, status, pinned, created_at, updated_at, published_at, created_by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, value.slug, value.title, value.excerpt, value.content, value.category, value.status, value.pinned, now, now, publishedAt, identity.email).run();
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) throw new ArticleError(409, "这个 slug 已经存在，请换一个。");
    throw error;
  }
  return map(await env.MEDIA_DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first());
}

export async function updateArticle(env, id, payload) {
  const existing = await env.MEDIA_DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first();
  if (!existing) throw new ArticleError(404, "文章不存在。");
  const value = normalize(payload);
  const now = new Date().toISOString();
  const publishedAt = value.status === "published" ? (existing.published_at || now) : null;
  try {
    await env.MEDIA_DB.prepare("UPDATE articles SET slug = ?, title = ?, excerpt = ?, content = ?, category = ?, status = ?, pinned = ?, updated_at = ?, published_at = ? WHERE id = ?").bind(value.slug, value.title, value.excerpt, value.content, value.category, value.status, value.pinned, now, publishedAt, id).run();
  } catch (error) {
    if (String(error.message).toLowerCase().includes("unique")) throw new ArticleError(409, "这个 slug 已经存在，请换一个。");
    throw error;
  }
  return map(await env.MEDIA_DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first());
}

export async function deleteArticle(env, id) {
  const existing = await env.MEDIA_DB.prepare("SELECT id FROM articles WHERE id = ?").bind(id).first();
  if (!existing) throw new ArticleError(404, "文章不存在。");
  await env.MEDIA_DB.prepare("DELETE FROM articles WHERE id = ?").bind(id).run();
  return { id, deleted: true };
}
