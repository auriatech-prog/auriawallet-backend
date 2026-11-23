CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (btrim(name) <> ''),
    email TEXT NOT NULL CHECK (email = btrim(email) AND email <> ''),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_balances (
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    currency TEXT NOT NULL CHECK (currency IN ('USD', 'EUR', 'ARS')),
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00
        CHECK (amount >= 0 AND amount <> 'NaN'::numeric),
    PRIMARY KEY (wallet_id, currency)
);
