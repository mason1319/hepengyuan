export const UPLOAD_PART_SIZE = 32 * 1024 * 1024;
export const MAX_FILE_SIZE = 20 * 1024 * 1024 * 1024;
export const UPLOAD_SESSION_TTL_SECONDS = 24 * 60 * 60;
const CLEANUP_RESERVATION_STALE_MS = 15 * 60 * 1000;

export const MIME_TYPES = Object.freeze({
  "image/jpeg": { mediaType: "image", extension: "jpg" },
  "image/png": { mediaType: "image", extension: "png" },
  "image/webp": { mediaType: "image", extension: "webp" },
  "image/avif": { mediaType: "image", extension: "avif" },
  "video/mp4": { mediaType: "video", extension: "mp4" },
  "video/webm": { mediaType: "video", extension: "webm" },
});

export class MediaError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "MediaError";
    this.status = status;
  }
}

function cleanText(value, name, maximum, { required = false } = {}) {
  const text = String(value ?? "").trim();

  if (required && !text) {
    throw new MediaError(400, `${name}不能为空。`);
  }

  if (text.length > maximum) {
    throw new MediaError(400, `${name}不能超过 ${maximum} 个字符。`);
  }

  return text || null;
}

function isValidCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCreateInput(input) {
  const mimeType = String(input.mimeType || "").trim().toLowerCase();
  const mimeInfo = MIME_TYPES[mimeType];

  if (!mimeInfo) {
    throw new MediaError(415, "只支持 JPEG、PNG、WebP、AVIF、MP4 和 WebM 文件。SVG 与 HTML 不允许上传。");
  }

  const fileSize = Number(input.fileSize);
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
    throw new MediaError(400, "文件大小无效，单个文件最大 20 GiB。");
  }

  const category = String(input.category || "").trim();
  if (category !== "travel" && category !== "learning") {
    throw new MediaError(400, "分类必须是旅行影像或学习视频。");
  }

  if (category === "learning" && mimeInfo.mediaType !== "video") {
    throw new MediaError(400, "学习视频分类只接受 MP4 或 WebM 视频。");
  }

  const slug = String(input.slug || "").trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) {
    throw new MediaError(400, "slug 只能包含小写英文字母、数字和连字符，最长 100 个字符。");
  }

  const capturedOn = cleanText(input.capturedOn, "拍摄日期", 10);
  if (capturedOn && !isValidCalendarDate(capturedOn)) {
    throw new MediaError(400, "拍摄日期必须是有效的 YYYY-MM-DD 日期。");
  }

  const title = cleanText(input.title, "标题", 120, { required: true });
  const altText = cleanText(input.alt, "替代文字", 500);
  if (mimeInfo.mediaType === "image" && !altText) {
    throw new MediaError(400, "图片必须填写替代文字。");
  }

  const durationSeconds = input.durationSeconds === null || input.durationSeconds === undefined || input.durationSeconds === ""
    ? null
    : Number(input.durationSeconds);
  if (
    mimeInfo.mediaType === "video" &&
    (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 7 * 24 * 60 * 60)
  ) {
    throw new MediaError(400, "视频时长无效，请选择浏览器可读取的 MP4 或 WebM 文件。");
  }

  return {
    slug,
    category,
    title,
    description: cleanText(input.description, "描述", 2000),
    altText,
    country: cleanText(input.country, "国家或地区", 80),
    city: cleanText(input.city, "城市", 100),
    capturedOn,
    mimeType,
    mediaType: mimeInfo.mediaType,
    durationSeconds: mimeInfo.mediaType === "video" ? durationSeconds : null,
    extension: mimeInfo.extension,
    fileSize,
    totalParts: Math.ceil(fileSize / UPLOAD_PART_SIZE),
  };
}

function startsWith(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function matchesFileSignature(bytes, mimeType) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) {
    return false;
  }

  switch (mimeType) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
    case "image/avif": {
      if (ascii(bytes, 4, 4) !== "ftyp") return false;
      const brands = ascii(bytes, 8, Math.min(bytes.length - 8, 32));
      return brands.includes("avif") || brands.includes("avis");
    }
    case "video/mp4":
      return ascii(bytes, 4, 4) === "ftyp";
    case "video/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    default:
      return false;
  }
}

function randomObjectKey(extension) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `media/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

function randomThumbnailKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `posters/${year}/${month}/${crypto.randomUUID()}.webp`;
}

function isoNow() {
  return new Date().toISOString();
}

function changedRows(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

function isMissingMultipartUpload(error) {
  const errorCode = Number(error?.code ?? error?.cause?.code);
  const message = String(error?.message || "");
  return errorCode === 10024 || /NoSuchUpload/i.test(message) || /\(10024\)\s*$/.test(message);
}

function sessionExpiry() {
  return new Date(Date.now() + UPLOAD_SESSION_TTL_SECONDS * 1000).toISOString();
}

function requireBindings(env) {
  if (!env.MEDIA_DB || !env.MEDIA_BUCKET) {
    throw new MediaError(503, "媒体存储尚未配置。");
  }
}

async function reserveThumbnailCleanup(env, mediaId, objectKey) {
  const reserved = await env.MEDIA_DB.prepare(
    `INSERT INTO media_object_cleanup (object_key, media_id, reason, created_at, last_error_at)
     SELECT ?1, id, 'video-poster', ?2, NULL
       FROM media
      WHERE id = ?3
        AND upload_state = 'complete'
        AND deleting_at IS NULL
        AND thumbnail_key IS NULL
     ON CONFLICT(object_key) DO NOTHING`,
  )
    .bind(objectKey, isoNow(), mediaId)
    .run();
  return changedRows(reserved) === 1;
}

async function removeCleanupEntry(env, objectKey) {
  await env.MEDIA_DB.prepare("DELETE FROM media_object_cleanup WHERE object_key = ?1").bind(objectKey).run();
}

async function markCleanupFailure(env, objectKey) {
  try {
    await env.MEDIA_DB.prepare(
      "UPDATE media_object_cleanup SET last_error_at = ?1 WHERE object_key = ?2",
    )
      .bind(isoNow(), objectKey)
      .run();
  } catch {
    // The durable queue row already exists; a later drain can retry without this timestamp.
  }
}

export async function drainMediaCleanupQueue(env, limit = 50) {
  requireBindings(env);
  const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
  const staleBefore = new Date(Date.now() - CLEANUP_RESERVATION_STALE_MS).toISOString();
  const result = await env.MEDIA_DB.prepare(
    `SELECT object_key
       FROM media_object_cleanup
      WHERE last_error_at IS NOT NULL OR created_at <= ?1
      ORDER BY created_at ASC
      LIMIT ?2`,
  )
    .bind(staleBefore, safeLimit)
    .all();
  let cleaned = 0;

  for (const row of result.results || []) {
    const referenced = await env.MEDIA_DB.prepare(
      "SELECT id FROM media WHERE thumbnail_key = ?1 LIMIT 1",
    )
      .bind(row.object_key)
      .first();

    if (!referenced) {
      try {
        await env.MEDIA_BUCKET.delete(row.object_key);
      } catch {
        await markCleanupFailure(env, row.object_key);
        continue;
      }
    }

    try {
      await removeCleanupEntry(env, row.object_key);
      cleaned += 1;
    } catch {
      await markCleanupFailure(env, row.object_key);
    }
  }

  const abortedResult = await env.MEDIA_DB.prepare(
    `SELECT us.id AS session_id, us.media_id, us.object_key
       FROM upload_sessions us
       JOIN media m ON m.id = us.media_id
      WHERE m.upload_state = 'aborted'
        AND m.deleting_at IS NULL
      ORDER BY us.created_at ASC
      LIMIT ?1`,
  )
    .bind(safeLimit)
    .all();
  let abortedUploadsCleaned = 0;

  for (const row of abortedResult.results || []) {
    try {
      await cleanupAbortedUpload(env, row);
      abortedUploadsCleaned += 1;
    } catch {
      // The upload session remains as the durable retry marker for the next drain.
    }
  }

  return { cleaned, abortedUploadsCleaned };
}

async function cleanupAbortedUpload(env, row) {
  try {
    await env.MEDIA_BUCKET.delete(row.object_key);
  } catch {
    throw new MediaError(503, "上传任务已停止，但残留文件暂时无法清理，请稍后重试。");
  }

  try {
    await env.MEDIA_DB.prepare(
      `DELETE FROM upload_sessions
        WHERE id = ?1
          AND media_id = ?2
          AND EXISTS (
            SELECT 1 FROM media
             WHERE id = ?2
               AND upload_state = 'aborted'
               AND deleting_at IS NULL
          )`,
    )
      .bind(row.session_id, row.media_id)
      .run();
  } catch {
    throw new MediaError(503, "残留文件已清理，但上传任务记录暂时无法移除，请稍后重试。");
  }
}

function assertFreshSession(row) {
  if (!row) {
    throw new MediaError(404, "上传任务不存在或已经完成。");
  }

  if (row.upload_state !== "uploading") {
    throw new MediaError(409, "这个上传任务已经结束。");
  }

  if (row.deleting_at) {
    throw new MediaError(409, "这条媒体记录正在删除，不能继续上传。");
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    throw new MediaError(410, "上传任务已过期，请重新选择文件。");
  }
}

async function findSession(env, sessionId) {
  return env.MEDIA_DB.prepare(
    `SELECT us.id AS session_id, us.upload_id, us.object_key, us.part_size,
            us.total_parts, us.expires_at, us.created_by_email,
            m.id AS media_id, m.mime_type, m.byte_size, m.upload_state, m.deleting_at
       FROM upload_sessions us
       JOIN media m ON m.id = us.media_id
      WHERE us.id = ?1`,
  )
    .bind(sessionId)
    .first();
}

function mapAdminRow(row, baseUrl) {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    title: row.title,
    description: row.description,
    alt: row.alt_text,
    country: row.country,
    city: row.city,
    capturedOn: row.captured_on,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    fileSize: Number(row.byte_size),
    uploadState: row.upload_state,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    thumbnailReady: Boolean(row.thumbnail_key),
    deletionPending: Boolean(row.deleting_at),
    storyUrl: row.status === "published" && row.upload_state === "complete" ? `${baseUrl}/stories/${row.slug}` : null,
    contentUrl:
      row.status === "published" && row.upload_state === "complete" ? `${baseUrl}/media/file/${row.slug}` : null,
  };
}

export function mapPublicRow(row, baseUrl) {
  const item = {
    slug: row.slug,
    category: row.category,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    title: row.title,
    description: row.description,
    alt: row.alt_text,
    country: row.country,
    city: row.city,
    capturedOn: row.captured_on,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    publishedAt: row.published_at,
    storyUrl: `${baseUrl}/stories/${row.slug}`,
    contentUrl: `${baseUrl}/media/file/${row.slug}`,
  };
  if (row.thumbnail_key) item.thumbnailUrl = `${baseUrl}/media/poster/${row.slug}`;
  return item;
}

export async function createMultipartUpload(env, rawInput, identity) {
  requireBindings(env);
  const input = validateCreateInput(rawInput);
  const mediaId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const objectKey = randomObjectKey(input.extension);
  const now = isoNow();
  const expiresAt = sessionExpiry();

  const multipart = await env.MEDIA_BUCKET.createMultipartUpload(objectKey, {
    httpMetadata: { contentType: input.mimeType },
    customMetadata: { mediaId },
  });

  try {
    await env.MEDIA_DB.batch([
      env.MEDIA_DB.prepare(
        `INSERT INTO media (
           id, slug, category, title, description, alt_text, country, city, captured_on,
           duration_seconds, media_type, mime_type, object_key, byte_size, status, upload_state,
           created_at, updated_at, published_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'draft', 'uploading', ?15, ?15, NULL)`,
      ).bind(
        mediaId,
        input.slug,
        input.category,
        input.title,
        input.description,
        input.altText,
        input.country,
        input.city,
        input.capturedOn,
        input.durationSeconds,
        input.mediaType,
        input.mimeType,
        objectKey,
        input.fileSize,
        now,
      ),
      env.MEDIA_DB.prepare(
        `INSERT INTO upload_sessions (
           id, media_id, upload_id, object_key, part_size, total_parts,
           expires_at, created_by_email, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      ).bind(
        sessionId,
        mediaId,
        multipart.uploadId,
        objectKey,
        UPLOAD_PART_SIZE,
        input.totalParts,
        expiresAt,
        identity.email,
        now,
      ),
    ]);
  } catch (error) {
    try {
      await multipart.abort();
    } catch {
      // R2 lifecycle rules also remove abandoned multipart uploads.
    }

    if (String(error?.message || "").toLowerCase().includes("unique")) {
      throw new MediaError(409, "这个 slug 已经存在，请换一个。");
    }
    throw error;
  }

  return {
    mediaId,
    sessionId,
    partSize: UPLOAD_PART_SIZE,
    totalParts: input.totalParts,
    expiresAt,
    status: "draft",
  };
}

export async function uploadMultipartPart(env, sessionId, partNumber, request) {
  requireBindings(env);
  const row = await findSession(env, sessionId);
  assertFreshSession(row);

  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > Number(row.total_parts)) {
    throw new MediaError(400, "分片编号无效。");
  }

  const expectedLength =
    partNumber === Number(row.total_parts)
      ? Number(row.byte_size) - (partNumber - 1) * Number(row.part_size)
      : Number(row.part_size);
  const contentLengthHeader = request.headers.get("Content-Length");
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);

  if (contentLength !== null && Number.isFinite(contentLength) && contentLength !== expectedLength) {
    throw new MediaError(400, "分片大小与上传任务不一致。");
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength !== expectedLength || body.byteLength > UPLOAD_PART_SIZE) {
    throw new MediaError(400, "分片大小与上传任务不一致。");
  }

  if (partNumber === 1 && !matchesFileSignature(body, row.mime_type)) {
    throw new MediaError(415, "文件内容与声明的媒体类型不一致，已拒绝上传。");
  }

  const multipart = env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.upload_id);
  const uploaded = await multipart.uploadPart(partNumber, body);
  return { partNumber: uploaded.partNumber, etag: uploaded.etag };
}

function validateCompletedParts(parts, expectedCount) {
  if (!Array.isArray(parts) || parts.length !== expectedCount) {
    throw new MediaError(400, "分片数量不完整。");
  }

  return [...parts]
    .map((part) => ({
      partNumber: Number(part.partNumber),
      etag: String(part.etag || ""),
    }))
    .sort((left, right) => left.partNumber - right.partNumber)
    .map((part, index) => {
      if (part.partNumber !== index + 1 || !part.etag || part.etag.length > 200) {
        throw new MediaError(400, "分片清单无效。");
      }
      return part;
    });
}

async function markUploadComplete(env, row, actualSize) {
  const now = isoNow();
  const results = await env.MEDIA_DB.batch([
    env.MEDIA_DB.prepare(
      `UPDATE media
          SET upload_state = 'complete', byte_size = ?1, updated_at = ?2
        WHERE id = ?3 AND upload_state = 'uploading' AND deleting_at IS NULL`,
    ).bind(actualSize, now, row.media_id),
    env.MEDIA_DB.prepare(
      `DELETE FROM upload_sessions
        WHERE id = ?1
          AND EXISTS (
            SELECT 1 FROM media
             WHERE id = ?2 AND upload_state = 'complete' AND deleting_at IS NULL
          )`,
    ).bind(row.session_id, row.media_id),
  ]);

  if (changedRows(results?.[0]) !== 1) {
    throw new MediaError(409, "媒体条目状态已变化，无法完成上传。");
  }
}

export async function completeMultipartUpload(env, sessionId, rawParts) {
  requireBindings(env);
  const row = await findSession(env, sessionId);
  assertFreshSession(row);

  const existing = await env.MEDIA_BUCKET.head(row.object_key);
  if (existing) {
    await markUploadComplete(env, row, existing.size);
    return { mediaId: row.media_id, uploadState: "complete", status: "draft" };
  }

  const parts = validateCompletedParts(rawParts, Number(row.total_parts));
  const multipart = env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.upload_id);
  const completed = await multipart.complete(parts);
  await markUploadComplete(env, row, completed.size);

  return { mediaId: row.media_id, uploadState: "complete", status: "draft" };
}

export async function abortMultipartUpload(env, sessionId) {
  requireBindings(env);
  let row = await findSession(env, sessionId);
  if (!row) {
    return { aborted: true };
  }

  if (row.deleting_at) {
    return { aborted: true };
  }

  if (row.upload_state === "complete") {
    return { aborted: false, uploadState: "complete" };
  }

  if (row.upload_state === "uploading") {
    try {
      await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.upload_id).abort();
    } catch (error) {
      if (!isMissingMultipartUpload(error)) {
        throw new MediaError(503, "上传任务暂时无法取消，请稍后重试。");
      }
    }

    const now = isoNow();
    const claimed = await env.MEDIA_DB.prepare(
      `UPDATE media
          SET upload_state = 'aborted', updated_at = ?1
        WHERE id = ?2
          AND upload_state = 'uploading'
          AND deleting_at IS NULL
          AND EXISTS (
            SELECT 1 FROM upload_sessions
             WHERE id = ?3 AND media_id = ?2
          )`,
    )
      .bind(now, row.media_id, sessionId)
      .run();

    if (changedRows(claimed) !== 1) {
      row = await findSession(env, sessionId);
      if (!row || row.deleting_at) return { aborted: true };
      if (row.upload_state === "complete") return { aborted: false, uploadState: "complete" };
      if (row.upload_state !== "aborted") {
        throw new MediaError(503, "上传任务状态正在变化，请稍后重试取消。");
      }
    } else {
      row = { ...row, upload_state: "aborted" };
    }
  }

  if (row.upload_state === "aborted") {
    await cleanupAbortedUpload(env, row);
  }

  return { aborted: true };
}

export async function listAdminMedia(env, baseUrl) {
  requireBindings(env);
  const result = await env.MEDIA_DB.prepare(
    `SELECT id, slug, category, media_type, mime_type, title, description, alt_text, thumbnail_key, deleting_at,
            country, city, captured_on, duration_seconds, byte_size, upload_state, status,
            created_at, updated_at, published_at
       FROM media
      WHERE upload_state != 'aborted' OR deleting_at IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 500`,
  ).all();

  return (result.results || []).map((row) => mapAdminRow(row, baseUrl));
}

async function recordDeletionError(env, mediaId, code) {
  try {
    await env.MEDIA_DB.prepare(
      "UPDATE media SET deletion_error_code = ?1, updated_at = ?2 WHERE id = ?3 AND deleting_at IS NOT NULL",
    )
      .bind(code, isoNow(), mediaId)
      .run();
  } catch {
    // A cleanup failure remains retryable even when recording its diagnostic code also fails.
  }
}

export async function deleteMedia(env, mediaId, identity = null) {
  requireBindings(env);
  const now = isoNow();
  const tombstoned = await env.MEDIA_DB.prepare(
    `UPDATE media
        SET status = 'draft', published_at = NULL,
            deleting_at = COALESCE(deleting_at, ?1),
            deletion_upload_id = COALESCE(
              deletion_upload_id,
              (SELECT upload_id FROM upload_sessions WHERE media_id = ?2)
            ),
            deletion_error_code = NULL,
            deletion_requested_by_email = COALESCE(deletion_requested_by_email, ?3),
            updated_at = ?1
      WHERE id = ?2`,
  )
    .bind(now, mediaId, identity?.email || null)
    .run();

  if (changedRows(tombstoned) === 0) {
    return { deleted: true, id: mediaId, alreadyDeleted: true };
  }

  const row = await env.MEDIA_DB.prepare(
    `SELECT id, object_key, thumbnail_key, upload_state, deleting_at, deletion_upload_id
       FROM media
      WHERE id = ?1`,
  )
    .bind(mediaId)
    .first();

  if (!row) {
    return { deleted: true, id: mediaId, alreadyDeleted: true };
  }

  if (row.upload_state === "uploading" && row.deletion_upload_id) {
    try {
      await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key, row.deletion_upload_id).abort();
    } catch (error) {
      if (!isMissingMultipartUpload(error)) {
        await recordDeletionError(env, mediaId, "MULTIPART_ABORT_FAILED");
        throw new MediaError(503, "上传任务暂时无法终止，内容已撤回，请稍后重试删除。");
      }
    }
  }

  const objectKeys = [row.object_key, row.thumbnail_key].filter(Boolean);
  try {
    if (objectKeys.length > 0) await env.MEDIA_BUCKET.delete(objectKeys);
  } catch {
    await recordDeletionError(env, mediaId, "R2_DELETE_FAILED");
    throw new MediaError(503, "媒体文件暂时无法删除，内容已撤回，请稍后重试。");
  }

  try {
    await env.MEDIA_DB.batch([
      env.MEDIA_DB.prepare("DELETE FROM upload_sessions WHERE media_id = ?1").bind(mediaId),
      env.MEDIA_DB.prepare("DELETE FROM media WHERE id = ?1").bind(mediaId),
    ]);
  } catch {
    await recordDeletionError(env, mediaId, "D1_FINALIZE_FAILED");
    throw new MediaError(503, "媒体文件已删除，但记录清理暂时失败，请重试删除。");
  }

  return { deleted: true, id: mediaId };
}

export async function setMediaStatus(env, mediaId, status, baseUrl) {
  requireBindings(env);
  if (status !== "draft" && status !== "published") {
    throw new MediaError(400, "状态只能是 draft 或 published。");
  }

  const existing = await env.MEDIA_DB.prepare(
    `SELECT id, upload_state, deleting_at, media_type, thumbnail_key, duration_seconds
       FROM media
      WHERE id = ?1 AND upload_state != 'aborted'`,
  )
    .bind(mediaId)
    .first();

  if (!existing) {
    throw new MediaError(404, "媒体条目不存在。");
  }

  if (existing.deleting_at) {
    throw new MediaError(409, "媒体条目正在删除，只能重试删除操作。");
  }

  if (status === "published" && existing.upload_state !== "complete") {
    throw new MediaError(409, "文件上传完成后才能公开发布。");
  }

  if (status === "published" && existing.media_type === "video" && !existing.thumbnail_key) {
    throw new MediaError(409, "视频生成封面后才能公开发布。");
  }
  if (status === "published" && existing.media_type === "video" && !existing.duration_seconds) {
    throw new MediaError(409, "读取到有效视频时长后才能公开发布。");
  }

  const now = isoNow();
  const updated = await env.MEDIA_DB.prepare(
    `UPDATE media
        SET status = ?1,
            published_at = CASE WHEN ?1 = 'published' THEN COALESCE(published_at, ?2) ELSE NULL END,
            updated_at = ?2
      WHERE id = ?3 AND deleting_at IS NULL`,
  )
    .bind(status, now, mediaId)
    .run();

  if (changedRows(updated) !== 1) {
    throw new MediaError(409, "媒体条目状态已变化，请刷新列表后重试。");
  }

  const row = await env.MEDIA_DB.prepare(
    `SELECT id, slug, category, media_type, mime_type, title, description, alt_text, thumbnail_key, deleting_at,
            country, city, captured_on, duration_seconds, byte_size, upload_state, status,
            created_at, updated_at, published_at
       FROM media WHERE id = ?1`,
  )
    .bind(mediaId)
    .first();

  if (!row) {
    throw new MediaError(404, "媒体条目不存在。");
  }

  return mapAdminRow(row, baseUrl);
}

export async function listPublishedMedia(env, baseUrl, category = null) {
  requireBindings(env);
  const statement = category
    ? env.MEDIA_DB.prepare(
        `SELECT slug, category, media_type, mime_type, title, description, alt_text, thumbnail_key,
                country, city, captured_on, duration_seconds, published_at, updated_at
           FROM media
          WHERE status = 'published' AND upload_state = 'complete' AND deleting_at IS NULL AND category = ?1
          ORDER BY COALESCE(captured_on, published_at) DESC, created_at DESC
          LIMIT 500`,
      ).bind(category)
    : env.MEDIA_DB.prepare(
        `SELECT slug, category, media_type, mime_type, title, description, alt_text, thumbnail_key,
                country, city, captured_on, duration_seconds, published_at, updated_at
           FROM media
          WHERE status = 'published' AND upload_state = 'complete' AND deleting_at IS NULL
          ORDER BY COALESCE(captured_on, published_at) DESC, created_at DESC
          LIMIT 500`,
      );

  const result = await statement.all();
  return (result.results || []).map((row) => ({ ...mapPublicRow(row, baseUrl), updatedAt: row.updated_at }));
}

export async function findPublishedMedia(env, slug) {
  requireBindings(env);
  return env.MEDIA_DB.prepare(
    `SELECT slug, category, media_type, mime_type, title, description, alt_text,
            country, city, captured_on, duration_seconds, published_at, updated_at, object_key, thumbnail_key, byte_size
       FROM media
      WHERE slug = ?1 AND status = 'published' AND upload_state = 'complete' AND deleting_at IS NULL`,
  )
    .bind(slug)
    .first();
}

export async function saveVideoThumbnail(env, mediaId, request) {
  requireBindings(env);
  const row = await env.MEDIA_DB.prepare(
    "SELECT id, media_type, upload_state, thumbnail_key, deleting_at FROM media WHERE id = ?1 AND upload_state != 'aborted'",
  )
    .bind(mediaId)
    .first();

  if (!row) throw new MediaError(404, "媒体条目不存在。");
  if (row.deleting_at) throw new MediaError(409, "媒体条目正在删除，不能保存封面。");
  if (row.media_type !== "video") throw new MediaError(400, "只有视频需要上传封面。");
  if (row.upload_state !== "complete") throw new MediaError(409, "视频上传完成后才能保存封面。");
  if (row.thumbnail_key) return { thumbnailReady: true };

  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null && Number(declaredLength) > 5 * 1024 * 1024) {
    throw new MediaError(413, "视频封面不能超过 5 MiB。");
  }
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "image/webp") {
    throw new MediaError(415, "视频封面必须是 WebP 图片。");
  }

  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > 5 * 1024 * 1024 || !matchesFileSignature(body, "image/webp")) {
    throw new MediaError(415, "视频封面内容无效。");
  }

  const thumbnailKey = randomThumbnailKey();
  if (!(await reserveThumbnailCleanup(env, mediaId, thumbnailKey))) {
    throw new MediaError(409, "媒体条目状态已变化，封面未保存。");
  }

  try {
    await env.MEDIA_BUCKET.put(thumbnailKey, body, {
      httpMetadata: { contentType: "image/webp" },
      customMetadata: { mediaId },
    });
  } catch {
    await markCleanupFailure(env, thumbnailKey);
    throw new MediaError(503, "封面文件暂时无法保存，请稍后重试。");
  }

  const now = isoNow();
  let updated;
  try {
    updated = await env.MEDIA_DB.prepare(
      "UPDATE media SET thumbnail_key = ?1, updated_at = ?2 WHERE id = ?3 AND thumbnail_key IS NULL AND deleting_at IS NULL",
    )
      .bind(thumbnailKey, now, mediaId)
      .run();
  } catch {
    await markCleanupFailure(env, thumbnailKey);
    throw new MediaError(503, "封面资料暂时无法保存，残留文件将自动重试清理。");
  }

  if (changedRows(updated) !== 1) {
    try {
      await env.MEDIA_BUCKET.delete(thumbnailKey);
      await removeCleanupEntry(env, thumbnailKey);
    } catch {
      await markCleanupFailure(env, thumbnailKey);
      throw new MediaError(503, "封面未保存，残留文件将自动重试清理。");
    }
    throw new MediaError(409, "媒体条目状态已变化，封面未保存。");
  }

  try {
    await removeCleanupEntry(env, thumbnailKey);
  } catch {
    await markCleanupFailure(env, thumbnailKey);
  }

  return { thumbnailReady: true };
}
