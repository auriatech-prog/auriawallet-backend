ALTER TABLE users
    ADD COLUMN google_sub TEXT UNIQUE,
    ALTER COLUMN password_hash DROP NOT NULL,
    ADD CONSTRAINT users_auth_method_required
        CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
