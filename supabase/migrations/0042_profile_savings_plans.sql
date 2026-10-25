-- Sparpläne (Planer › Sparpläne, CALCULATION_RULES.md §17).
--
-- Eine kurze Liste je Nutzer — Asset, Rate, Rhythmus, nächste Ausführung,
-- Depot, pausiert —, gepflegt von Hand wie die Fixkosten (0041). Deshalb wie
-- diese am Profil: Eine eigene Tabelle brächte nur zusätzliche Policies und
-- eine Erweiterung der Wiederherstellung. Die Form prüft der Client (zod);
-- die Datenbank begrenzt Art und Größe. Ein Plan zu einem gelöschten Asset
-- bleibt stehen („Unbekanntes Asset") und lässt sich in der Übersicht
-- löschen. Die bestehenden Rechte gelten unverändert:
-- `grant select, update on profiles to authenticated` (0004) und RLS auf die
-- eigene Zeile.

alter table profiles
  add column savings_plans jsonb
    constraint profiles_savings_plans_shape check (
      savings_plans is null
      or (
        jsonb_typeof(savings_plans) = 'array'
        and pg_column_size(savings_plans) <= 8192
      )
    );
