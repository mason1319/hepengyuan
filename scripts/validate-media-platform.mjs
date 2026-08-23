import { readFile, stat } from "node:fs/promises";
import { webcrypto } from "node:crypto";

import { verifyAccessIdentity } from "../src/auth.js";
import {
  UPLOAD_PART_SIZE,
  abortMultipartUpload,
  deleteMedia,
  drainMediaCleanupQueue,
  mapPublicRow,
  matchesFileSignature,
  saveVideoThumbnail,
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
  "migrations/0003_add_media_deletion_tombstone.sql",
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

const [
  adminHtml,
  adminStyles,
  adminScript,
  mediaStoreSource,
  workerSource,
  authSource,
  migrationOne,
  migrationTwo,
  migrationThree,
  wrangler,
  releasePreflight,
  productionSmoke,
] = await Promise.all([
  readFile("admin/index.html", "utf8"),
  readFile("admin/styles.css", "utf8"),
  readFile("admin/script.js", "utf8"),
  readFile("src/media-store.js", "utf8"),
  readFile("src/worker.js", "utf8"),
  readFile("src/auth.js", "utf8"),
  readFile("migrations/0001_media.sql", "utf8"),
  readFile("migrations/0002_add_video_duration.sql", "utf8"),
  readFile("migrations/0003_add_media_deletion_tombstone.sql", "utf8"),
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

for (const expected of ["noindex,nofollow,noarchive", "type=\"file\"", "privacyConfirmed", "默认草稿", "data-delete", "data-delete-dialog", "data-delete-confirm", "永久删除", "data-file-help", "video/quicktime", "MOV"]) {
  assert(adminHtml.includes(expected), `admin interface is missing ${expected}`);
}
for (const expected of ["sanitizeImage", "createVideoPoster", "补封面", "mediaSavedWithoutPoster", "showModal", "confirmPendingDeletion", 'method: "DELETE"', "selectedFileInfo", "showUploadValidation", "正在处理并上传"]) {
  assert(adminScript.includes(expected), `admin upload behavior is missing ${expected}`);
}
for (const expected of ["libraryRequestGeneration", "AbortController", "populateDeleteDialog", "deleteDialogBusy", "deleteDialogTitle.focus", "setRowMutationBusy"]) {
  assert(adminScript.includes(expected), `admin deletion safety is missing ${expected}`);
}
for (const expected of ["[hidden]", "100dvh", "overscroll-behavior"]) {
  assert(adminStyles.includes(expected), `admin responsive deletion UI is missing ${expected}`);
}
for (const expected of ["Cf-Access-Jwt-Assertion", "crypto.subtle.verify", "payload.iss", "payload.aud", "ADMIN_EMAILS"]) {
  assert(authSource.includes(expected), `Access verification is missing ${expected}`);
}
for (const expected of ["status IN ('draft', 'published')", "upload_state", "thumbnail_key", "created_by_email"]) {
  assert(migrationOne.includes(expected), `D1 base migration is missing ${expected}`);
}
assert(migrationTwo.includes("duration_seconds"), "D1 duration migration is missing duration_seconds");
for (const expected of ["deleting_at", "deletion_upload_id", "deletion_error_code", "deletion_requested_by_email", "idx_media_deleting_at", "media_object_cleanup"]) {
  assert(migrationThree.includes(expected), `D1 deletion migration is missing ${expected}`);
}
assert(mediaStoreSource.includes("deleting_at IS NULL"), "public and mutation queries do not guard deletion tombstones");
assert(
  mediaStoreSource.includes("upload_state != 'aborted' OR deleting_at IS NOT NULL"),
  "retryable aborted tombstones are hidden from the admin library",
);
assert(mediaStoreSource.includes("(10024"), "R2 message-only NoSuchUpload failures are not treated idempotently");
assert(mediaStoreSource.includes("MULTIPART_ABORT_FAILED"), "multipart deletion failures are not retryable diagnostics");
assert(mediaStoreSource.includes("R2_DELETE_FAILED"), "R2 deletion failures are not retryable diagnostics");
assert(mediaStoreSource.includes("reserveThumbnailCleanup"), "poster writes do not reserve durable cleanup recovery");
assert(mediaStoreSource.includes("drainMediaCleanupQueue"), "orphaned poster cleanup has no retry worker");
assert(mediaStoreSource.includes("cleanupAbortedUpload"), "aborted upload cleanup has no durable retry path");
assert(mediaStoreSource.includes("m.upload_state = 'aborted'"), "scheduled cleanup does not recover aborted upload sessions");
assert(!mediaStoreSource.includes("const publishable"), "publish status checks retain a deletion-race second lookup");
assert(workerSource.includes("Accept-Ranges"), "public video response is missing Range support");
assert(workerSource.includes("findPublishedMedia"), "public file routes must verify the published D1 record");
assert(!workerSource.includes("max-age=31536000, immutable"), "revocable media must not use immutable browser caching");
assert(workerSource.includes("REVOCABLE_PUBLIC_CACHE"), "revocable public responses must share one revalidation policy");
assert(workerSource.includes("deleteMedia"), "admin media route is missing permanent deletion");
assert(workerSource.includes('request.method !== "DELETE"'), "admin media route is missing the DELETE method gate");
assert(workerSource.includes("scheduled"), "durable media cleanup is missing its scheduled drain");
assert(!workerSource.includes("stale-while-revalidate"), "withdrawn media metadata must not be served stale");
assert(wrangler.includes('"crons"'), "wrangler config is missing the media cleanup schedule");
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

const validMov = validateCreateInput({
  ...validVideo,
  slug: "iphone-travel-video",
  mimeType: "video/quicktime",
});
assert(validMov.extension === "mov" && validMov.mediaType === "video", "MOV video was rejected");

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
const movHeader = new Uint8Array([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]);
assert(matchesFileSignature(webpHeader, "image/webp"), "valid WebP signature was rejected");
assert(!matchesFileSignature(webpHeader, "video/mp4"), "mismatched WebP signature was accepted as MP4");
assert(matchesFileSignature(movHeader, "video/quicktime"), "valid MOV signature was rejected");

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

function deletionTestEnvironment({
  bucketDeleteFailures = 0,
  uploading = false,
  multipartAbortCode = null,
  multipartAbortMessage = null,
  multipartMissingAfterFirstAbort = false,
  finalizeFailures = 0,
} = {}) {
  const events = [];
  let remainingBucketDeleteFailures = bucketDeleteFailures;
  let remainingFinalizeFailures = finalizeFailures;
  let multipartAbortCalls = 0;
  let record = {
    id: "delete-test-id",
    object_key: "media/2026/08/delete-test.mp4",
    thumbnail_key: "posters/2026/08/delete-test.webp",
    upload_state: uploading ? "uploading" : "complete",
    upload_id: uploading ? "multipart-delete-test" : null,
    status: "published",
    deleting_at: null,
    deletion_upload_id: null,
    deletion_error_code: null,
    deletion_requested_by_email: null,
  };

  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            sql,
            values,
            async first() {
              return record ? { ...record } : null;
            },
            async run() {
              if (sql.includes("SET status = 'draft'")) {
                events.push("tombstone");
                if (!record) return { success: true, meta: { changes: 0 } };
                record.status = "draft";
                record.deleting_at ||= values[0];
                record.deletion_upload_id ||= record.upload_id;
                record.deletion_error_code = null;
                record.deletion_requested_by_email ||= values[2];
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes("deletion_error_code = ?1")) {
                events.push(`record-error:${values[0]}`);
                if (record) record.deletion_error_code = values[0];
                return { success: true, meta: { changes: record ? 1 : 0 } };
              }
              events.push("run");
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
    async batch(statements) {
      assert(statements.some((statement) => statement.sql.includes("DELETE FROM upload_sessions")), "delete batch retained an upload session");
      assert(statements.some((statement) => statement.sql.includes("DELETE FROM media")), "delete batch retained the media record");
      if (remainingFinalizeFailures > 0) {
        remainingFinalizeFailures -= 1;
        events.push("finalize-failed");
        throw new Error("temporary D1 failure");
      }
      events.push("delete-row");
      record = null;
      return [];
    },
  };

  const bucket = {
    resumeMultipartUpload(key, uploadId) {
      assert(key === record.object_key && uploadId === record.deletion_upload_id, "multipart deletion used the wrong persisted upload session");
      return {
        async abort() {
          events.push("abort-multipart");
          multipartAbortCalls += 1;
          if (multipartMissingAfterFirstAbort && multipartAbortCalls > 1) {
            throw new Error("The specified multipart upload does not exist. (10024)");
          }
          if (multipartAbortCode || multipartAbortMessage) {
            const error = new Error(multipartAbortMessage || "multipart abort failed");
            if (multipartAbortCode) error.code = multipartAbortCode;
            throw error;
          }
        },
      };
    },
    async delete(keys) {
      events.push("delete-objects");
      if (remainingBucketDeleteFailures > 0) {
        remainingBucketDeleteFailures -= 1;
        throw new Error("temporary R2 failure");
      }
      assert(Array.isArray(keys) && keys.length === 2, "delete did not remove both media and poster objects");
      assert(keys.includes(record.object_key) && keys.includes(record.thumbnail_key), "delete used unexpected R2 object keys");
    },
  };

  return {
    env: { MEDIA_DB: database, MEDIA_BUCKET: bucket },
    events,
    getRecord: () => record,
  };
}

const completedDeletion = deletionTestEnvironment();
const deleted = await deleteMedia(completedDeletion.env, "delete-test-id", { email: "admin@example.com" });
assert(deleted.deleted && deleted.id === "delete-test-id", "delete did not return its success envelope");
assert(completedDeletion.getRecord() === null, "delete retained the D1 media record");
assert(
  completedDeletion.events.join(",") === "tombstone,delete-objects,delete-row",
  "delete did not unpublish before removing R2 objects and D1 metadata",
);
const repeatedDeletion = await deleteMedia(completedDeletion.env, "delete-test-id", { email: "admin@example.com" });
assert(repeatedDeletion.deleted && repeatedDeletion.alreadyDeleted, "repeated deletion was not idempotent");

const uploadingDeletion = deletionTestEnvironment({ uploading: true });
await deleteMedia(uploadingDeletion.env, "delete-test-id");
assert(
  uploadingDeletion.events.join(",") === "tombstone,abort-multipart,delete-objects,delete-row",
  "delete did not abort an active multipart upload before cleanup",
);

const missingMultipartDeletion = deletionTestEnvironment({
  uploading: true,
  multipartAbortMessage: "The specified multipart upload does not exist. (10024)",
});
await deleteMedia(missingMultipartDeletion.env, "delete-test-id");
assert(missingMultipartDeletion.getRecord() === null, "an already-missing multipart upload blocked idempotent deletion");

const interruptedUploadingDeletion = deletionTestEnvironment({
  uploading: true,
  bucketDeleteFailures: 1,
  multipartMissingAfterFirstAbort: true,
});
await expectMediaError(
  () => deleteMedia(interruptedUploadingDeletion.env, "delete-test-id"),
  503,
  "uploading media R2 cleanup interruption",
);
await deleteMedia(interruptedUploadingDeletion.env, "delete-test-id");
assert(interruptedUploadingDeletion.getRecord() === null, "message-only 10024 blocked an interrupted deletion retry");

const failedObjectDeletion = deletionTestEnvironment({ bucketDeleteFailures: 1 });
await expectMediaError(() => deleteMedia(failedObjectDeletion.env, "delete-test-id"), 503, "temporary R2 delete failure");
assert(failedObjectDeletion.getRecord()?.status === "draft", "failed R2 deletion left the item publicly visible");
assert(failedObjectDeletion.getRecord()?.deleting_at, "failed R2 deletion did not retain a retry tombstone");
assert(failedObjectDeletion.getRecord()?.deletion_error_code === "R2_DELETE_FAILED", "failed R2 deletion lost its diagnostic code");
assert(!failedObjectDeletion.events.includes("delete-row"), "failed R2 deletion removed the retryable D1 record");
await deleteMedia(failedObjectDeletion.env, "delete-test-id");
assert(failedObjectDeletion.getRecord() === null, "retry did not finish an interrupted R2 deletion");

const failedFinalize = deletionTestEnvironment({ finalizeFailures: 1 });
await expectMediaError(() => deleteMedia(failedFinalize.env, "delete-test-id"), 503, "temporary D1 finalize failure");
assert(failedFinalize.getRecord()?.deleting_at, "failed D1 finalize did not retain a retry tombstone");
assert(failedFinalize.getRecord()?.deletion_error_code === "D1_FINALIZE_FAILED", "failed D1 finalize lost its diagnostic code");
await deleteMedia(failedFinalize.env, "delete-test-id");
assert(failedFinalize.getRecord() === null, "retry did not finish an interrupted D1 finalize");

function multipartAbortRaceEnvironment({
  completeWins = false,
  initialState = "uploading",
  deleting = false,
  objectDeleteFailures = 0,
  sessionDeleteFailures = 0,
} = {}) {
  const events = [];
  let uploadState = initialState;
  let deletingAt = deleting ? "2026-08-23T00:00:00.000Z" : null;
  let sessionExists = true;
  let objectExists = true;
  let remainingObjectDeleteFailures = objectDeleteFailures;
  let remainingSessionDeleteFailures = sessionDeleteFailures;
  let multipartAbortCalls = 0;

  const sessionRow = () => ({
    session_id: "abort-session-id",
    media_id: "abort-media-id",
    object_key: "media/2026/08/completed-before-d1.mp4",
    upload_id: "already-completed-upload-id",
    upload_state: uploadState,
    deleting_at: deletingAt,
  });
  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            sql,
            values,
            async first() {
              return sessionExists ? sessionRow() : null;
            },
            async all() {
              if (sql.includes("FROM media_object_cleanup")) return { results: [] };
              if (sql.includes("FROM upload_sessions") && uploadState === "aborted" && !deletingAt && sessionExists) {
                return { results: [sessionRow()] };
              }
              return { results: [] };
            },
            async run() {
              if (sql.includes("SET upload_state = 'aborted'")) {
                events.push("claim-abort");
                if (completeWins && uploadState === "uploading") {
                  uploadState = "complete";
                  sessionExists = false;
                  events.push("complete-wins");
                }
                if (uploadState === "uploading" && !deletingAt && sessionExists) {
                  uploadState = "aborted";
                  return { success: true, meta: { changes: 1 } };
                }
                return { success: true, meta: { changes: 0 } };
              }
              if (sql.includes("DELETE FROM upload_sessions")) {
                events.push("delete-session");
                if (remainingSessionDeleteFailures > 0) {
                  remainingSessionDeleteFailures -= 1;
                  throw new Error("temporary D1 session delete failure");
                }
                if (uploadState === "aborted" && !deletingAt) sessionExists = false;
                return { success: true, meta: { changes: sessionExists ? 0 : 1 } };
              }
              return { success: true, meta: { changes: 0 } };
            },
          };
        },
      };
    },
  };
  const bucket = {
    resumeMultipartUpload(key, uploadId) {
      const row = sessionRow();
      assert(key === row.object_key && uploadId === row.upload_id, "abort resumed an unexpected multipart upload");
      return {
        async abort() {
          events.push("abort-multipart");
          multipartAbortCalls += 1;
          throw new Error("The specified multipart upload does not exist. (10024)");
        },
      };
    },
    async delete(key) {
      const row = sessionRow();
      assert(key === row.object_key, "abort cleaned an unexpected completed object");
      events.push("delete-completed-object");
      if (remainingObjectDeleteFailures > 0) {
        remainingObjectDeleteFailures -= 1;
        throw new Error("temporary R2 object delete failure");
      }
      objectExists = false;
    },
  };
  return {
    env: { MEDIA_DB: database, MEDIA_BUCKET: bucket },
    events,
    getState: () => ({ uploadState, deletingAt, sessionExists, objectExists, multipartAbortCalls }),
  };
}

const abortWinsRace = multipartAbortRaceEnvironment();
await abortMultipartUpload(abortWinsRace.env, "abort-session-id");
assert(
  abortWinsRace.events.join(",") === "abort-multipart,claim-abort,delete-completed-object,delete-session",
  "abort did not claim D1 ownership before removing a completed R2 object",
);
assert(abortWinsRace.getState().uploadState === "aborted", "abort winner did not retain the aborted state");
assert(!abortWinsRace.getState().objectExists && !abortWinsRace.getState().sessionExists, "abort winner left storage behind");

const completeWinsRace = multipartAbortRaceEnvironment({ completeWins: true });
await abortMultipartUpload(completeWinsRace.env, "abort-session-id");
assert(completeWinsRace.getState().uploadState === "complete", "complete winner lost its D1 state");
assert(completeWinsRace.getState().objectExists, "abort deleted the object after complete won the D1 race");
assert(!completeWinsRace.events.includes("delete-completed-object"), "abort deleted a successfully completed upload");

const failedCompletedObjectCleanup = multipartAbortRaceEnvironment({ objectDeleteFailures: 1 });
await expectMediaError(
  () => abortMultipartUpload(failedCompletedObjectCleanup.env, "abort-session-id"),
  503,
  "completed multipart object cleanup failure",
);
assert(
  failedCompletedObjectCleanup.getState().uploadState === "aborted" && failedCompletedObjectCleanup.getState().sessionExists,
  "failed object cleanup discarded the durable aborted-session retry state",
);
await abortMultipartUpload(failedCompletedObjectCleanup.env, "abort-session-id");
assert(failedCompletedObjectCleanup.getState().multipartAbortCalls === 1, "aborted cleanup retry tried to abort multipart twice");
assert(!failedCompletedObjectCleanup.getState().objectExists && !failedCompletedObjectCleanup.getState().sessionExists, "aborted cleanup retry left storage behind");

const failedSessionCleanup = multipartAbortRaceEnvironment({ sessionDeleteFailures: 1 });
await expectMediaError(
  () => abortMultipartUpload(failedSessionCleanup.env, "abort-session-id"),
  503,
  "aborted session record cleanup failure",
);
assert(failedSessionCleanup.getState().sessionExists, "failed session cleanup discarded its retry marker");
await abortMultipartUpload(failedSessionCleanup.env, "abort-session-id");
assert(!failedSessionCleanup.getState().sessionExists, "session cleanup retry retained the upload session");

const scheduledAbortedCleanup = multipartAbortRaceEnvironment({ initialState: "aborted" });
const scheduledCleanupResult = await drainMediaCleanupQueue(scheduledAbortedCleanup.env);
assert(scheduledCleanupResult.abortedUploadsCleaned === 1, "scheduled drain did not recover an aborted upload");
assert(!scheduledAbortedCleanup.getState().objectExists && !scheduledAbortedCleanup.getState().sessionExists, "scheduled drain left aborted storage behind");

const scheduledCompleteProtection = multipartAbortRaceEnvironment({ initialState: "complete" });
const completeDrainResult = await drainMediaCleanupQueue(scheduledCompleteProtection.env);
assert(completeDrainResult.abortedUploadsCleaned === 0, "scheduled drain selected a complete upload");
assert(scheduledCompleteProtection.getState().objectExists, "scheduled drain deleted a complete upload");

const scheduledDeletionProtection = multipartAbortRaceEnvironment({ initialState: "aborted", deleting: true });
const deletionDrainResult = await drainMediaCleanupQueue(scheduledDeletionProtection.env);
assert(deletionDrainResult.abortedUploadsCleaned === 0, "scheduled drain selected a deletion tombstone");
assert(scheduledDeletionProtection.getState().objectExists, "scheduled drain raced the permanent deletion owner");

function posterRaceCleanupEnvironment() {
  const queue = new Set();
  const objects = new Set();
  const events = [];
  let failNextObjectDelete = true;
  const media = {
    id: "poster-race-media-id",
    media_type: "video",
    upload_state: "complete",
    thumbnail_key: null,
    deleting_at: null,
  };
  const database = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            sql,
            values,
            async first() {
              if (sql.includes("WHERE thumbnail_key = ?1")) return null;
              return { ...media };
            },
            async all() {
              return { results: [...queue].map((object_key) => ({ object_key })) };
            },
            async run() {
              if (sql.includes("INSERT INTO media_object_cleanup")) {
                queue.add(values[0]);
                events.push("reserve-cleanup");
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.startsWith("UPDATE media SET thumbnail_key")) {
                events.push("poster-update-conflict");
                return { success: true, meta: { changes: 0 } };
              }
              if (sql.startsWith("DELETE FROM media_object_cleanup")) {
                queue.delete(values[0]);
                events.push("remove-cleanup");
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  const bucket = {
    async put(key) {
      objects.add(key);
      events.push("put-poster");
    },
    async delete(key) {
      events.push("delete-poster");
      if (failNextObjectDelete) {
        failNextObjectDelete = false;
        throw new Error("temporary poster cleanup failure");
      }
      objects.delete(key);
    },
  };
  return {
    env: { MEDIA_DB: database, MEDIA_BUCKET: bucket },
    events,
    objectCount: () => objects.size,
    queueCount: () => queue.size,
  };
}

const posterRaceCleanup = posterRaceCleanupEnvironment();
await expectMediaError(
  () =>
    saveVideoThumbnail(
      posterRaceCleanup.env,
      "poster-race-media-id",
      new Request("https://hepengyuan.top/api/admin/media/poster-race-media-id/poster", {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: webpHeader,
      }),
    ),
  503,
  "poster cleanup failure during deletion race",
);
assert(posterRaceCleanup.objectCount() === 1, "poster race fixture did not retain its simulated orphan");
assert(posterRaceCleanup.queueCount() === 1, "poster cleanup failure lost its durable recovery key");
const drainedPosterRace = await drainMediaCleanupQueue(posterRaceCleanup.env);
assert(drainedPosterRace.cleaned === 1, "poster cleanup queue did not report its recovered object");
assert(posterRaceCleanup.objectCount() === 0, "poster cleanup queue left the orphaned R2 object behind");
assert(posterRaceCleanup.queueCount() === 0, "poster cleanup queue retained a completed recovery row");

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
