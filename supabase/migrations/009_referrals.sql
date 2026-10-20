-- 009 — Referral program
-- Each profile gets a unique referral code (generated server-side).
-- Users may be referred by at most one code, once (referred_by + referred_at).
-- The program itself must be *enrolled into* (referral_enrolled) — enrolling
-- mints the code. Withdrawals of earned commission are MANUAL (= off-chain,
-- no auto payout): every request is a row in referral_withdrawals that an
-- admin processes (status pending → paid / rejected). `available` commission
-- is always derived on read: totalCommission − sum(non-rejected withdrawals).

alter table public.profiles
    add column if not exists referral_code text
        constraint profiles_referral_code_uniq unique;

alter table public.profiles
    add column if not exists referred_by text
        references public.profiles (address) on delete set null;

alter table public.profiles
    add column if not exists referred_at timestamptz;

alter table public.profiles
    add column if not exists referral_enrolled boolean default false;

alter table public.profiles
    add column if not exists referral_enrolled_at timestamptz;

create index if not exists profiles_referred_by_idx
    on public.profiles (referred_by);

create table if not exists public.referral_withdrawals (
    id bigint generated always as identity primary key,
    user_address text not null,
    amount numeric not null,
    status text not null default 'pending'
        constraint referral_withdrawals_status_chk check (status in ('pending', 'paid', 'rejected')),
    requested_at timestamptz default now(),
    processed_at timestamptz
);

create index if not exists referral_withdrawals_user_idx
    on public.referral_withdrawals (user_address);
