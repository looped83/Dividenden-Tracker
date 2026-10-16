-- Emuliert exakt die Teile eines echten Supabase-Postgres-Projekts, auf die
-- unsere Migrationen und RLS-Policies sich verlassen: das auth-Schema
-- (auth.users, auth.uid(), auth.role()) sowie die Rollen anon/authenticated/
-- service_role. Wird AUSSCHLIESSLICH gegen eine lokale, reine PostgreSQL-
-- Instanz fuer automatisierte Tests angewendet (ARCHITECTURE.md/DECISIONS.md
-- D-027) und niemals gegen ein echtes Supabase-Projekt, wo dieses Schema
-- bereits von Supabase selbst bereitgestellt wird. Liegt bewusst ausserhalb
-- von supabase/migrations, damit es niemals versehentlich auf ein echtes
-- Projekt angewendet wird.

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- Identisch zur Implementierung auf echten Supabase-Projekten: liest die
-- vom Request-Layer (PostgREST/GoTrue) gesetzte JWT-Claim-GUC.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'role', '')::text;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;

-- Der lokale Testtreiber verbindet sich als "postgres" und wechselt per
-- SET ROLE in die jeweilige Simulationsrolle (analog zu PostgREST).
grant anon, authenticated, service_role to postgres;
