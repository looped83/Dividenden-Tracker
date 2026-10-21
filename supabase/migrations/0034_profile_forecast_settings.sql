-- Annahmen des Dividenden-Schneeballs (Bestand › Prognose, CALCULATION_RULES.md §14).
--
-- Gespeichert werden ausschließlich die Eingaben (Sparrate, Wachstum, Ziel …),
-- nie ein Ergebnis: Prognosen sind keine Daten des Systems (PRODUCT_SPEC.md
-- Grundsatz 8). Sie stehen am Profil, damit iPhone, iPad und Mac dieselben
-- Annahmen sehen — eine eigene Tabelle für eine einzige Zeile je Nutzer brächte
-- nur zusätzliche Policies.
--
-- Die Form prüft der Client (zod); die Datenbank begrenzt Art und Größe, damit
-- die Spalte kein Ablageort für Beliebiges wird. Die bestehenden Rechte gelten
-- unverändert: `grant select, update on profiles to authenticated` (0004) und
-- RLS auf die eigene Zeile.

alter table profiles
  add column forecast_settings jsonb
    constraint profiles_forecast_settings_shape check (
      forecast_settings is null
      or (
        jsonb_typeof(forecast_settings) = 'object'
        and pg_column_size(forecast_settings) <= 2048
      )
    );
