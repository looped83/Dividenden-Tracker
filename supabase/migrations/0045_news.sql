-- News zu den Assets im Bestand (DATA_MODEL.md „News“, SECURITY_MODEL.md
-- „News“).
--
-- Ein Zwischenspeicher, keine Stammdaten: Die Edge Function `sync-news` holt
-- Meldungen von Marketaux und Google News, schreibt sie hierher und löscht
-- nach 30 Tagen. Deshalb nicht in der Datensicherung. Gespeichert werden nur
-- Titel, Auszug, Quelle und Link — kein Volltext, keine Bilder.
--
-- Rechte wie beim Kalender (0027): Der Client liest nur, geschrieben wird
-- allein von der Edge Function mit service_role. Neue Tabellen brauchen seit
-- 30.10.2026 ausdrückliche Grants; hier stehen sie vollständig.

create type news_provider as enum ('marketaux', 'google_news');

create table news_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  security_id   uuid not null references securities (id) on delete cascade,
  provider      news_provider not null,
  -- Kennung beim Anbieter (Marketaux: uuid, Google News: guid des Eintrags).
  external_id   text not null check (length(external_id) between 1 and 512),
  title         text not null check (length(title) between 1 and 500),
  snippet       text check (length(snippet) <= 500),
  url           text not null check (url ~ '^https://' and length(url) <= 2048),
  source        text check (length(source) <= 200),
  language      char(2) check (language ~ '^[a-z]{2}$'),
  -- Stimmung zum Asset laut Anbieter, -1 bis 1. Nur Marketaux liefert sie.
  sentiment     numeric(4, 3) check (sentiment between -1 and 1),
  published_at  timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (user_id, security_id, provider, external_id)
);

-- Die Ansicht liest die neuesten Meldungen eines Nutzers; das Aufräumen
-- löscht nach Datum.
create index news_items_user_published_idx on news_items (user_id, published_at desc);
-- Fremdschlüssel-Index: Postgres prüft beim Löschen eines Assets die Meldungen.
create index news_items_security_idx on news_items (security_id);

alter table news_items enable row level security;

revoke all on news_items from anon, authenticated;
grant select on news_items to authenticated;
grant select, insert, delete on news_items to service_role;

create policy news_items_select_own on news_items
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Letzter Abruf je Nutzer. Nur Zeitpunkte und eine bereinigte Meldung —
-- niemals der API-Key oder Rohdaten der Anbieter.
create table news_sync_status (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  error_message    text check (length(error_message) <= 500),
  updated_at       timestamptz not null default now()
);

alter table news_sync_status enable row level security;

revoke all on news_sync_status from anon, authenticated;
grant select on news_sync_status to authenticated;
grant select, insert, update on news_sync_status to service_role;

create policy news_sync_status_select_own on news_sync_status
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create trigger trg_news_sync_status_updated_at
  before update on news_sync_status
  for each row execute function set_updated_at();

-- Belegt einen Abruf atomar und hält das Kontingent ein: Marketaux erlaubt
-- im kostenlosen Plan 100 Anfragen am Tag, ein Lauf braucht eine je Aktie.
-- Ein Lauf ist nur möglich, wenn der letzte Erfolg länger als
-- `p_min_interval` zurückliegt und kein anderer Lauf gerade belegt ist
-- (verfällt nach 5 Minuten, falls ein Lauf abbricht).
--
-- security definer wie `claim_calendar_sync` (0027): nur für service_role
-- ausführbar, die Nutzerkennung stammt aus dem geprüften JWT.
create or replace function claim_news_sync(
  p_user_id uuid,
  p_min_interval interval default interval '12 hours'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into news_sync_status (user_id, last_attempt_at)
  values (p_user_id, now())
  on conflict (user_id) do update
    set last_attempt_at = now()
    where (news_sync_status.last_attempt_at is null
           or news_sync_status.last_attempt_at < now() - interval '5 minutes')
      and (news_sync_status.last_success_at is null
           or news_sync_status.last_success_at < now() - p_min_interval)
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function claim_news_sync(uuid, interval) from public, anon, authenticated;
grant execute on function claim_news_sync(uuid, interval) to service_role;
