ALTER TABLE media
ADD COLUMN duration_seconds REAL
CHECK (duration_seconds IS NULL OR duration_seconds > 0);
