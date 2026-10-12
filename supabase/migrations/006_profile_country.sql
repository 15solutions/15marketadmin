-- 006: country of residence for gateway-matched fiat on-ramp.
-- Collected at onboarding (ISO 3166-1 alpha-2, uppercase) and used to decide
-- which payment gateways the funding UI offers. Nullable: older profiles and
-- users who skip the step simply get the default gateway set.
alter table public.profiles
  add column if not exists country text;

-- Basic sanity: two-letter codes only. Bad rows stay null rather than
-- breaking downstream gateway matching.
update public.profiles
set country = null
where country is not null
  and country !~ '^[A-Za-z]{2}$';
