PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('travel', 'learning')),
  title TEXT NOT NULL,
  description TEXT,
  alt_text TEXT,
  country TEXT,
  city TEXT,
  captured_on TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  mime_type TEXT NOT NULL CHECK (
    mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'video/mp4',
      'video/webm'
    )
  ),
  object_key TEXT NOT NULL UNIQUE,
  thumbnail_key TEXT UNIQUE,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  upload_state TEXT NOT NULL DEFAULT 'uploading' CHECK (upload_state IN ('uploading', 'complete', 'aborted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  CHECK (media_type = 'image' OR mime_type IN ('video/mp4', 'video/webm')),
  CHECK (media_type = 'video' OR mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  CHECK (media_type = 'video' OR alt_text IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL UNIQUE REFERENCES media(id) ON DELETE CASCADE,
  upload_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  part_size INTEGER NOT NULL CHECK (part_size = 33554432),
  total_parts INTEGER NOT NULL CHECK (total_parts BETWEEN 1 AND 10000),
  expires_at TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_media_public
  ON media(status, upload_state, category, captured_on, published_at);

CREATE INDEX IF NOT EXISTS idx_media_created_at
  ON media(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires_at
  ON upload_sessions(expires_at);
