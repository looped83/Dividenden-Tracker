-- Phase 6 (Dividendeneingänge verwalten): zwei Änderungen.
--
-- 1) Endgültiges Löschen aktiver ODER stornierter eigener Eingänge.
--    Bisher (0013, DECISIONS.md D-034) war Hard Delete ausschließlich für
--    bereits archivierte (= stornierte) eigene Zeilen erlaubt; der verpflichtende
--    Stornoschritt sollte eine versehentliche Löschung aus dem aktiven Zustand
--    verhindern. Phase 6 verlangt jedoch ausdrücklich, dass sowohl aktive als
--    auch stornierte Eingänge dauerhaft gelöscht werden können, und ersetzt die
--    „erst stornieren"-Schranke bewusst durch die verpflichtende, eindeutige
--    Löschbestätigung in der Oberfläche (§13.1/§13.2). Die Entscheidung ist in
--    DECISIONS.md D-039 dokumentiert und hebt die Vorbedingung aus D-034 auf.
--    Die Löschung bleibt weiterhin auf eigene Zeilen beschränkt (RLS) und wird
--    über den unveränderten AFTER-DELETE-Trigger atomar im Audit Log
--    protokolliert (Grundsatz 2).

drop policy if exists dividend_payments_delete_archived_own on dividend_payments;

create policy dividend_payments_delete_own on dividend_payments
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 2) Persistente „keine Dublette"-Entscheidungen (§16). Eine mögliche Dublette
--    ist nie automatisch eine echte Dublette; markiert der Nutzer ein Paar
--    bewusst als „keine Dublette", darf dieselbe Warnung nicht dauerhaft erneut
--    erscheinen. Kleinste tragfähige Lösung: eine schmale, nutzerbezogene
--    Tabelle mit einem stabilen, sortierten Paarschlüssel. Es findet KEINE
--    automatische Zusammenführung, Stornierung oder Löschung statt.
create table duplicate_dismissals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id),
  -- Stabiler Schlüssel des als „keine Dublette" markierten Paares:
  -- die beiden Zahlungs-IDs lexikografisch sortiert und mit ':' verbunden.
  pair_key   text not null check (length(pair_key) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint duplicate_dismissals_unique unique (user_id, pair_key)
);

create index duplicate_dismissals_user_idx on duplicate_dismissals (user_id);

alter table duplicate_dismissals enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein Zugriff für anon; ein Nutzer
-- verwaltet ausschließlich eigene Einträge. UPDATE ist nicht nötig (Einträge
-- sind unveränderlich; ein Widerruf erfolgt per DELETE).
revoke all on duplicate_dismissals from anon, authenticated;
grant select, insert, delete on duplicate_dismissals to authenticated;

create policy duplicate_dismissals_select_own on duplicate_dismissals
  for select
  to authenticated
  using (user_id = auth.uid());

create policy duplicate_dismissals_insert_own on duplicate_dismissals
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy duplicate_dismissals_delete_own on duplicate_dismissals
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Eigentümer erzwingen (Defense in Depth, wie bei den übrigen Fachtabellen).
create trigger trg_duplicate_dismissals_enforce_user_id
  before insert or update on duplicate_dismissals
  for each row execute function enforce_user_id();
