-- Add SSL monitoring columns to monitors table
ALTER TABLE monitors
ADD COLUMN IF NOT EXISTS ssl_expiry TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ssl_issuer TEXT;
