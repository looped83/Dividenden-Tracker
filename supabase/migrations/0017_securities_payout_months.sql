-- Ausschuettungsmonate je Unternehmen (Phase-5A-Erweiterung).
--
-- Hintergrund: Dividenden treffen manchmal spaeter ein als geplant. Fuer alle
-- Auswertungen soll eine Zahlung dem geplanten Ausschuettungsmonat zugeordnet
-- werden koennen statt dem exakten Zahlungsdatum. `payout_months` haelt die
-- geplanten Monate (1..12) je Unternehmen; die Zuordnungslogik
-- (naechstliegender Monat, inkl. Jahresverschiebung) ist clientseitig in
-- lib/statistics implementiert (CALCULATION_RULES.md §10). Das echte `pay_date`
-- der Zahlungen bleibt unveraendert gespeichert.
alter table securities
  add column payout_months smallint[] not null default '{}'::smallint[]
  check (payout_months <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::smallint[]);

comment on column securities.payout_months is
  'Geplante Ausschuettungsmonate (1..12). Leer = kein Plan, Auswertungen nutzen dann das echte Zahlungsdatum.';
