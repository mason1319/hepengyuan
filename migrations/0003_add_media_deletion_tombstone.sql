ALTER TABLE media
ADD COLUMN deleting_at TEXT;

ALTER TABLE media
ADD COLUMN deletion_upload_id TEXT;

ALTER TABLE media
ADD COLUMN deletion_error_code TEXT;

ALTER TABLE media
ADD COLUMN deletion_requested_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_media_deleting_at
  ON media(deleting_at)
  WHERE deleting_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS media_object_cleanup (
  object_key TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('video-poster')),
  created_at TEXT NOT NULL,
  last_error_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_object_cleanup_created_at
  ON media_object_cleanup(created_at);
