-- Zerlegte SUMMARY des Kalender-Feeds (docs/CALENDAR_INTEGRATION.md).
--
-- Der DivvyDiary-Feed presst vier Angaben in eine Zeile:
--   "Verizon Communications Inc 51,37 € Zahltag (Trade Republic)"
-- Bisher stand diese Zeile unzerlegt in `title`. Die Oberflaeche konnte daraus
-- nur Text machen; Betraege liessen sich weder darstellen noch summieren.
--
-- Die Zerlegung geschieht beim Einlesen in der Edge Function
-- (`_shared/summary.ts`), nicht bei jeder Anzeige: Sie ist Teil des Imports,
-- gehoert damit zu den Daten und ist genau einmal je Termin zu leisten.
--
-- `title` bleibt unveraendert erhalten. Erkennt der Parser eine Zeile nicht,
-- bleiben die neuen Spalten leer und die Oberflaeche zeigt weiterhin die
-- vollstaendige Zeile — es wird nie geraten.

alter table dividend_calendar_events
  add column company_name text check (length(company_name) between 1 and 300),
  -- **Erwarteter** Betrag laut Quelle, keine erhaltene Zahlung. Die Skala
  -- entspricht `Money` der Anwendung (numeric(14,2), CALCULATION_RULES.md R-1),
  -- damit beim Lesen nicht nachgerundet werden muss.
  add column expected_amount numeric(14, 2) check (expected_amount >= 0),
  add column expected_currency char(3) check (expected_currency ~ '^[A-Z]{3}$'),
  add column source_portfolio text check (length(source_portfolio) between 1 and 200);

-- Betrag und Waehrung gehoeren zusammen: Ein Betrag ohne Waehrung ist nicht
-- darstellbar, eine Waehrung ohne Betrag sagt nichts.
alter table dividend_calendar_events
  add constraint dividend_calendar_events_amount_currency check (
    (expected_amount is null and expected_currency is null)
    or (expected_amount is not null and expected_currency is not null)
  );

comment on column dividend_calendar_events.expected_amount is
  'Erwarteter Betrag laut Kalenderquelle (Prognose). Niemals eine erhaltene Zahlung — die stehen ausschliesslich in dividend_payments.';

-- Kein Nachtrag fuer bereits gespeicherte Zeilen: Der naechste
-- Synchronisationslauf fuellt sie, weil der Abgleich die geaenderten Felder
-- erkennt und die Zeilen neu schreibt. Eine Datenmigration hier haette die
-- Zerlegung ein zweites Mal — in SQL — nachbauen muessen.
