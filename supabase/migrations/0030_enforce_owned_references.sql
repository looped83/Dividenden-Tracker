-- Eigentum der referenzierten Stammdaten erzwingen (SECURITY_MODEL.md §3).
--
-- Ein Fremdschluessel prueft, dass die Zeile **existiert** — nicht, wem sie
-- gehoert. `dividend_payments.security_id` und `.depot_id` standen damit jedem
-- offen, der eine fremde Kennung kennt.
--
-- Der tatsaechliche Stand vor dieser Migration, gemessen statt vermutet:
--
--   * `security_id`: faktisch geschuetzt, aber nur als **Nebenwirkung**.
--     `recompute_business_fingerprint` schlaegt die Kennung unter RLS nach und
--     scheitert mit „security_id … nicht gefunden". Ein Schutz, der an einer
--     Funktion haengt, die es aus einem ganz anderen Grund gibt, kann bei der
--     naechsten Umstellung unbemerkt verschwinden — und die Meldung erklaert
--     dem Nutzer nichts.
--   * `depot_id`: **ungeschuetzt**. Eine Zahlung liess sich an das Depot eines
--     anderen Nutzers haengen. Sichtbar wurde sie dort nie (RLS), aber sie
--     verwies auf fremde Daten, und ein Loeschen dort haette sie mitgerissen.
--
-- Beide Bedingungen werden deshalb ausdruecklich geprueft.

-- Ersetzt die Fassung aus 0029: Statt sich allein auf die Sichtbarkeit durch
-- RLS zu verlassen, wird das Eigentum **explizit** verglichen. Damit gilt die
-- Regel auch dort, wo RLS nicht greift — in `security definer`-Funktionen und
-- bei service_role.
--
-- `coalesce(new.user_id, auth.uid())`, weil die Reihenfolge der BEFORE-Trigger
-- alphabetisch ist und `enforce_user_id` die Spalte je nach Tabelle erst
-- danach fuellt. Ohne das Coalesce scheiterte jeder Client, der `user_id`
-- (korrekterweise) gar nicht mitschickt.
create or replace function enforce_own_security()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from securities
    where id = new.security_id
      and user_id = coalesce(new.user_id, auth.uid())
  ) then
    raise exception 'security_id % gehoert nicht zum eigenen Bestand', new.security_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function enforce_own_depot()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from depots
    where id = new.depot_id
      and user_id = coalesce(new.user_id, auth.uid())
  ) then
    raise exception 'depot_id % gehoert nicht zum eigenen Bestand', new.depot_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Reihenfolge: BEFORE-Trigger laufen alphabetisch nach Namen. `trg_02x_…` liegt
-- damit **nach** `trg_02_enforce_user_id` (das `user_id` bei einem INSERT ohne
-- Angabe erst setzt) und **vor** `trg_03_recompute_fingerprint`.
--
-- Das zweite ist der Grund fuer das `x` statt einer hoeheren Ziffer: Die
-- Fingerprint-Funktion schlaegt das Unternehmen ebenfalls nach und scheitert
-- sonst zuerst — mit „security_id … nicht gefunden", einer Meldung, die dem
-- Nutzer nichts erklaert. Steht die Eigentumspruefung davor, sagt der Fehler,
-- was tatsaechlich los ist.
--
-- „x" ist gegenueber „_" sortierstabil: Ob die Sortierung Unterstriche
-- mitzaehlt (C) oder auf der ersten Stufe ignoriert (en_US), in beiden Faellen
-- steht `trg_02_e…` vor `trg_02x_e…` vor `trg_03_…`. Geprueft in
-- tests/integration/rls.test.ts.
create trigger trg_02x_enforce_own_security
  before insert or update on dividend_payments
  for each row execute function enforce_own_security();

create trigger trg_02y_enforce_own_depot
  before insert or update on dividend_payments
  for each row execute function enforce_own_depot();

-- Bestandspruefung: Trigger gelten nur fuer kuenftige Schreibvorgaenge. Gaebe
-- es bereits Zeilen, die auf fremde Stammdaten zeigen, blieben sie unentdeckt
-- liegen. Erwartet werden null Treffer (RLS war von Anfang an aktiv); trifft
-- das nicht zu, bricht die Migration ab, statt den Fund zu verschweigen.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from dividend_payments p
  left join securities s on s.id = p.security_id and s.user_id = p.user_id
  left join depots d on d.id = p.depot_id and d.user_id = p.user_id
  where s.id is null or d.id is null;

  if v_bad > 0 then
    raise exception
      'Migration 0030 abgebrochen: % Zahlung(en) verweisen auf Unternehmen oder Depots eines anderen Nutzers. '
      'Zum Pruefen: select p.id, p.user_id, p.security_id, p.depot_id from dividend_payments p '
      'left join securities s on s.id = p.security_id and s.user_id = p.user_id '
      'left join depots d on d.id = p.depot_id and d.user_id = p.user_id '
      'where s.id is null or d.id is null;', v_bad;
  end if;
end;
$$;

comment on function enforce_own_security() is
  'Stellt sicher, dass das referenzierte Unternehmen dem Schreibenden gehoert. Der Fremdschluessel prueft nur die Existenz.';

comment on function enforce_own_depot() is
  'Stellt sicher, dass das referenzierte Depot dem Schreibenden gehoert. Der Fremdschluessel prueft nur die Existenz.';
