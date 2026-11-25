CREATE TABLE google_login_codes (
    code_hash TEXT PRIMARY KEY,
    code_challenge TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX google_login_codes_expiration ON google_login_codes (expires_at);
