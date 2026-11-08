-- Migration 016: durable user notifications
-- The panels' history used to live inside the profile object, but the
-- profile serializer has no notifications column, so every notification
-- evaporated on restart. This table is the record store now (hydrated at
-- node boot together with the JSON mirror).
create table if not exists user_notifications (
  id text primary key,
  address text not null,
  title text not null,
  message text not null default '',
  type text not null default 'info',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_address_created_idx
  on user_notifications (address, created_at desc);

alter table user_notifications enable row level security;
-- No anon policies: browsers read and clear their history only through
-- nexus-core routes (GET/DELETE /notifications/:address) with the service
-- key, so wallets can never touch each other's rows directly.
