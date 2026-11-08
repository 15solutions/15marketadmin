-- Migration 015: durable per-wallet transaction ledger
-- Records deposits, withdrawals and internal transfers (NEVER trade
-- entries) so the Transfer Hub Activity feed and the dashboard
-- Transactions cards are persistent across devices and node restarts.
create table if not exists transactions (
  id text primary key,
  address text not null,
  kind text not null,
  amount numeric(20,6) not null default 0,
  tx_hash text,
  to_addr text,
  network text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_address_created_idx
  on transactions (address, created_at desc);

alter table transactions enable row level security;

-- Backend service writes/reads with the service key. No anon policies:
-- users reach the ledger only through nexus-core routes (/transactions/:x),
-- so wallets can never read each other's rows from the browser.
