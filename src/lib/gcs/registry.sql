-- PREPARATION ONLY. Apply to the appropriate production Cloud SQL DB on integration.
-- Callback inserts/updates and receipt completion MUST share one SQL transaction.
CREATE TABLE IF NOT EXISTS gcp_asset_uploads (
 id uuid PRIMARY KEY,
 owner text NOT NULL,
 document jsonb NOT NULL,
 result jsonb,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gcp_asset_uploads_expiry ON gcp_asset_uploads(expires_at);
