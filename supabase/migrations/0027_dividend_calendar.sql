-- Dividendenkalender: angekuendigte Zahltage aus einem persoenlichen
-- DivvyDiary-iCal-Feed (DATA_MODEL.md, Kalenderintegration).
--
-- Strikt getrennt von `dividend_payments` (PRODUCT_SPEC.md Grundsatz 8): hier
-- stehen ausschliesslich **angekuendigte** Termine der Quelle, dort die
-- **tatsaechlich erhaltenen** Zahlungen. Es gibt bewusst keinen Fremdschluessel
-- zwischen beiden und keinen automatischen Abgleich — er waere eine fachliche
-- Behauptung, die diese Phase nicht trifft.
--
-- Geschrieben wird ausschliesslich serverseitig durch die Edge Function
-- `sync-divvydiary-calendar` (service_role). Der Client liest nur; deshalb gibt
-- es fuer `authenticated` weder INSERT- noch UPDATE- noch DELETE-Rechte.

create type calendar_source as enum ('divvydiary');

-- Der Feed liefert derzeit nur Zahltage (`dates=pay`). Ex-Tage sind der
-- naechste absehbare Ereignistyp und stehen deshalb bereits hier, damit ein
-- spaeterer Feed-Parameter keine Schemaaenderung braucht.
create type calendar_event_type as enum ('payment', 'ex_date');

-- Lebenszyklus eines Termins. `removed_from_source` statt DELETE: ein Termin,
-- den die Quelle nicht mehr liefert, verschwindet nachvollziehbar statt
-- spurlos (Auftrag §5). `cancelled` bildet STATUS:CANCELLED des Feeds ab.
create type calendar_event_state as enum ('active', 'cancelled', 'removed_from_source');

-- Zustand des letzten Synchronisationslaufs. `running` ist die Sperre gegen
-- parallele Laeufe (Auftrag §6), `never` der Anfangszustand.
create type calendar_sync_state as enum ('never', 'running', 'success', 'error');

create table dividend_calendar_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,

  source            calendar_source not null default 'divvydiary',
  external_uid      text not null check (length(external_uid) between 1 and 512),
  event_type        calendar_event_type not null default 'payment',
  event_state       calendar_event_state not null default 'active',

  -- SUMMARY ist nach RFC 5545 optional. Fehlt sie, bleibt die Spalte leer statt
  -- einen Titel zu erfinden; die Oberflaeche zeigt dann „Ohne Titel"
  -- (Auftrag §3: keine erfundenen Daten).
  title             text check (length(title) between 1 and 500),
  description       text check (length(description) <= 4000),
  location          text check (length(location) <= 500),
  external_url      text check (length(external_url) <= 2000),
  categories        text[],

  -- Der Kalendertag ist maszgeblich (Auftrag §14). Als `date` gespeichert und
  -- als reiner String zur Oberflaeche durchgereicht, damit kein
  -- Zeitzonenwechsel einen ganztaegigen Termin auf den Vor- oder Folgetag
  -- schieben kann — dieselbe Regel wie bei `dividend_payments.pay_date`.
  event_date        date not null,
  -- Letzter Kalendertag mehrtaegiger Termine, **inklusiv**. Der Feed liefert
  -- DTEND bei ganztaegigen Terminen exklusiv; die Umrechnung passiert einmal
  -- beim Import, nicht bei jeder Anzeige.
  end_date          date check (end_date >= event_date),

  -- Nur bei Terminen mit Uhrzeit gefuellt; bei ganztaegigen Terminen null.
  starts_at         timestamptz,
  ends_at           timestamptz,
  is_all_day        boolean not null default true,

  sequence_number   integer check (sequence_number >= 0),
  recurrence_rule   text check (length(recurrence_rule) <= 1000),
  source_created_at timestamptz,
  source_updated_at timestamptz,

  -- Alle uebrigen Felder des VEVENT, damit spaetere Auswertungen (Betrag,
  -- Waehrung, Ex-Tag) ohne erneuten Vollabgleich moeglich sind. Enthaelt
  -- niemals die Feed-URL oder den Token — die Edge Function speichert
  -- ausschliesslich Eigenschaften des Ereignisses.
  raw_data          jsonb,

  first_synced_at   timestamptz not null default now(),
  last_synced_at    timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint dividend_calendar_events_uid_unique unique (user_id, source, external_uid),
  constraint dividend_calendar_events_time_consistency check (
    (is_all_day and starts_at is null and ends_at is null)
    or (not is_all_day and starts_at is not null)
  ),
  constraint dividend_calendar_events_period check (ends_at is null or ends_at >= starts_at)
);

-- Die Kalenderansicht liest immer einen Zeitraum eines Nutzers in
-- Datumsreihenfolge; genau darauf liegt der Index.
create index dividend_calendar_events_date_idx
  on dividend_calendar_events (user_id, event_date, id);

-- Der Abgleich am Ende eines Laufs sucht die zukuenftigen, aktiven Termine,
-- die der Feed nicht mehr geliefert hat.
create index dividend_calendar_events_active_idx
  on dividend_calendar_events (user_id, source, event_date)
  where event_state = 'active';

alter table dividend_calendar_events enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): der Client liest, geschrieben wird
-- nur serverseitig. Ohne INSERT/UPDATE/DELETE-Policy sind diese Operationen
-- fuer `authenticated` selbst dann gesperrt, wenn spaeter versehentlich ein
-- Grant hinzukaeme.
revoke all on dividend_calendar_events from anon, authenticated;
grant select on dividend_calendar_events to authenticated;
-- Kein DELETE: entfallene Termine werden auf `removed_from_source` gesetzt,
-- nie geloescht. Damit kann ein fehlerhafter Lauf keine Historie vernichten.
grant select, insert, update on dividend_calendar_events to service_role;

create policy dividend_calendar_events_select_own on dividend_calendar_events
  for select
  to authenticated
  using (user_id = auth.uid());

create trigger trg_dividend_calendar_events_updated_at
  before update on dividend_calendar_events
  for each row execute function set_updated_at();

-- Ergebnis des letzten Synchronisationslaufs je Nutzer und Quelle. Enthaelt
-- ausschliesslich Zaehler und eine bereinigte Fehlermeldung — niemals die
-- Feed-URL, den Token oder Rohdaten des Feeds (Auftrag §4).
create table calendar_sync_status (
  user_id         uuid not null references auth.users (id) on delete cascade,
  source          calendar_source not null default 'divvydiary',

  state           calendar_sync_state not null default 'never',
  last_attempt_at timestamptz,
  last_success_at timestamptz,

  events_read     integer not null default 0 check (events_read >= 0),
  events_created  integer not null default 0 check (events_created >= 0),
  events_updated  integer not null default 0 check (events_updated >= 0),
  events_removed  integer not null default 0 check (events_removed >= 0),
  events_skipped  integer not null default 0 check (events_skipped >= 0),

  -- Bereits bereinigte, dem Nutzer zumutbare Meldung (kein Stacktrace, keine
  -- Adresse, kein Token).
  error_message   text check (length(error_message) <= 500),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (user_id, source)
);

alter table calendar_sync_status enable row level security;

revoke all on calendar_sync_status from anon, authenticated;
grant select on calendar_sync_status to authenticated;
grant select, insert, update on calendar_sync_status to service_role;

create policy calendar_sync_status_select_own on calendar_sync_status
  for select
  to authenticated
  using (user_id = auth.uid());

create trigger trg_calendar_sync_status_updated_at
  before update on calendar_sync_status
  for each row execute function set_updated_at();

-- Belegt den Synchronisationslauf eines Nutzers **atomar** (Auftrag §6, Punkt 4).
-- Zwei gleichzeitige Anfragen — etwa die automatische Aktualisierung beim
-- Oeffnen und ein Klick auf „Aktualisieren" — wuerden sonst denselben Feed
-- doppelt abrufen und dieselben Zeilen gegeneinander schreiben.
--
-- Liefert true, wenn der Aufrufer den Lauf belegen konnte, sonst false. Ein
-- abgebrochener Lauf (Absturz, Timeout) blockiert nicht dauerhaft: nach
-- `p_stale_after` gilt die Belegung als verfallen.
--
-- security definer, weil die Edge Function mit service_role arbeitet und die
-- Nutzerkennung aus dem geprueften JWT uebergibt — niemals aus dem Request-Body
-- (SECURITY_MODEL.md §3). Ausfuehrbar ist die Funktion ausschliesslich fuer
-- service_role, nicht fuer angemeldete Clients.
create or replace function claim_calendar_sync(
  p_user_id uuid,
  p_source calendar_source default 'divvydiary',
  p_stale_after interval default interval '5 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into calendar_sync_status (user_id, source, state, last_attempt_at)
  values (p_user_id, p_source, 'running', now())
  on conflict (user_id, source) do update
    set state = 'running',
        last_attempt_at = now()
    where calendar_sync_status.state <> 'running'
       or calendar_sync_status.last_attempt_at is null
       or calendar_sync_status.last_attempt_at < now() - p_stale_after
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function claim_calendar_sync(uuid, calendar_source, interval)
  from public, anon, authenticated;
grant execute on function claim_calendar_sync(uuid, calendar_source, interval)
  to service_role;
