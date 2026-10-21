-- 010 — Referral admin controls + withdrawal request detail
-- Withdrawal requests now carry WHERE the payout goes (chain + destination
-- address) and an optional admin note recorded when processed. Admins can
-- suspend/unsuspend users from the program, override a user's commission
-- rate (percent, blank = program default) and slash earned commission.

alter table public.referral_withdrawals
    add column if not exists chain text default 'Arc';

alter table public.referral_withdrawals
    add column if not exists destination_address text;

alter table public.referral_withdrawals
    add column if not exists admin_note text;

alter table public.profiles
    add column if not exists referral_suspended boolean default false not null;

alter table public.profiles
    add column if not exists referral_rate_override numeric;

alter table public.profiles
    add column if not exists referral_slashed numeric default 0 not null;

create index if not exists profiles_referral_suspended_idx
    on public.profiles (referral_suspended);
