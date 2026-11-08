-- Migration 014: durable referral program switch + commissions
-- Stores the admin console's Referral Program master switch so the
-- go-live state survives nexus-core restarts (operational settings like
-- maintenanceMode intentionally stay in-memory).
create table if not exists platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table platform_config enable row level security;

-- Backend service writes with the service key; anon may only read the
-- single referral_program row so the user app can gate the icon/page.
create policy "platform_config_read_referral_program"
  on platform_config for select
  using (key = 'referral_program');
