-- Peculiar Cherubs — Worship Location Type
ALTER TABLE chapels
ADD COLUMN location_type TEXT NOT NULL DEFAULT 'chapel'
CHECK (location_type IN ('hq', 'chapel'));

UPDATE chapels
SET location_type = 'hq'
WHERE id IN ('peculiar-hq', 'mother-church', 'general', 'mother');

INSERT INTO schema_meta (key, value)
VALUES ('worship_location_model', 'peculiar-hq-v1')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
