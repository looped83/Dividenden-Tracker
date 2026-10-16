-- Zahlungsdatum gegen den heutigen Kalendertag in Berlin pruefen, nicht in UTC.
--
-- `current_date` folgt der Zeitzone der Datenbank, bei Supabase UTC. Zwischen
-- Mitternacht und 1 Uhr (Winter) bzw. 2 Uhr (Sommer) deutscher Zeit lag UTC
-- noch im Vortag: Ein Eingang mit dem heutigen Datum wurde abgewiesen, und
-- das Formular zeigte die rohe Meldung der Datenbank. App und Formular
-- rechnen mit dem lokalen Kalendertag (`todayIso`), die Anzeige mit
-- Europe/Berlin (`DISPLAY_TIME_ZONE`, Kalender) — die Datenbank jetzt auch.
--
-- Der Name der Bedingung bleibt unveraendert (Tests pruefen auf ihn).
-- Bestehende Zeilen erfuellen die neue Bedingung zwangslaeufig: Der Berliner
-- Kalendertag liegt nie vor dem UTC-Tag.
alter table dividend_payments
  drop constraint dividend_payments_pay_date_check,
  add constraint dividend_payments_pay_date_check check (
    pay_date between date '1970-01-01' and (now() at time zone 'Europe/Berlin')::date
  );
