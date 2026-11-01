-- Admin-managed content. The browser never receives direct database access.
create table public.admin_catalog (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('curricula', 'reference', 'knowledge')),
  code text check (code is null or (length(btrim(code)) between 1 and 60 and code = upper(btrim(code)))),
  name text not null check (length(btrim(name)) between 1 and 200),
  year integer,
  category text,
  url text,
  content text not null default '' check (length(content) <= 50000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, code),
  check (
    (kind = 'curricula' and code is not null and year is not null and year between 1900 and 3000 and category is null and url is null)
    or (kind = 'reference' and code is not null and year is null and category is not null and length(btrim(category)) between 1 and 100 and url is null)
    or (kind = 'knowledge' and code is null and year is null and category is null and length(btrim(content)) > 0 and (url is null or (length(url) <= 2000 and url ~* '^https?://')))
  )
);

alter table public.admin_catalog enable row level security;
revoke all on public.admin_catalog from anon, authenticated;
grant all on public.admin_catalog to service_role;
