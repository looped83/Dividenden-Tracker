-- Positionsgrenze je Asset (Planer › Nachkauf, CALCULATION_RULES.md §16).
--
-- Ein Objekt { Asset-Kennung: Prozent } mit den Grenzen, die vom Standard
-- (`forecast_settings.positionCap`) abweichen. Am Profil wie die übrigen
-- Planer-Einstellungen (0034, 0042): eine Annahme für Rechnungen, keine
-- Stammdaten des Assets, und deshalb nicht in der Datensicherung. Die Form
-- prüft der Client (zod); die Datenbank begrenzt Art und Größe. Die
-- bestehenden Rechte gelten unverändert: `grant select, update on profiles to
-- authenticated` (0004) und RLS auf die eigene Zeile.

alter table profiles
  add column position_caps jsonb
    constraint profiles_position_caps_shape check (
      position_caps is null
      or (
        jsonb_typeof(position_caps) = 'object'
        and pg_column_size(position_caps) <= 8192
      )
    );
