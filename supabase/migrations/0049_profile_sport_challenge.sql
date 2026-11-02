-- Sport-Challenge (Menüpunkt „Challenge“, CALCULATION_RULES.md §18).
--
-- Ein Objekt je Nutzer: Monat, Zielzahl Sporttage, die Aktivitäten je Tag und
-- wann der Bonus investiert wurde. Bewusst kurzlebig: Es gibt immer nur eine
-- Challenge, eine neue überschreibt die alte. Deshalb am Profil wie
-- Sparpläne (0042) und Positionsgrenzen (0043), keine eigene Tabelle, nicht in
-- der Datensicherung. Die Form prüft der Client (zod); die Datenbank begrenzt
-- Art und Größe (ein voller Monat braucht rund 1,5 KB). Die bestehenden
-- Rechte gelten unverändert: `grant select, update on profiles to
-- authenticated` (0004) und RLS auf die eigene Zeile.

alter table profiles
  add column sport_challenge jsonb
    constraint profiles_sport_challenge_shape check (
      sport_challenge is null
      or (
        jsonb_typeof(sport_challenge) = 'object'
        and pg_column_size(sport_challenge) <= 4096
      )
    );
