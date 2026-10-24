-- Fixkosten für „Was deine Dividenden bezahlen“ (Fortschritt, CALCULATION_RULES.md §15).
--
-- Eine Liste aus Name und Monatsbetrag, die der Ø-Dividende im Monat
-- gegenübergestellt wird. Wie die Annahmen des Schneeballs (0034) am Profil:
-- eine eigene Tabelle für eine kurze Liste je Nutzer brächte nur zusätzliche
-- Policies. Die Form prüft der Client (zod); die Datenbank begrenzt Art und
-- Größe. Die bestehenden Rechte gelten unverändert:
-- `grant select, update on profiles to authenticated` (0004) und RLS auf die
-- eigene Zeile.

alter table profiles
  add column fixed_costs jsonb
    constraint profiles_fixed_costs_shape check (
      fixed_costs is null
      or (
        jsonb_typeof(fixed_costs) = 'array'
        and pg_column_size(fixed_costs) <= 4096
      )
    );
