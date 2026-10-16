# Statusberichte (Archiv)

Momentaufnahmen abgeschlossener Phasen — Fertigstellungs-, Audit- und
Freigabeberichte. Sie beschreiben den Stand zum Zeitpunkt ihrer Entstehung und
werden **nicht** mehr gepflegt.

Der aktuelle Stand steht ausschließlich in den lebenden Dokumenten im
Wurzelverzeichnis (PRODUCT_SPEC, ARCHITECTURE, CALCULATION_RULES,
UX_AND_DESIGN_SYSTEM, DATA_MODEL, SECURITY_MODEL, TEST_STRATEGY, DECISIONS …).
Bei Widersprüchen gilt das lebende Dokument.

## Warnung zu den Phase-8/9-Berichten (2026-07-29)

Die hier abgelegten Berichte zu Sicherung und Wiederherstellung sind
nachweislich **falsch**. Sie melden Fertigstellungsgrade („90 % Complete",
„Ready for deployment", „✅ 354 existing + 39 new passing") für eine Funktion,
die nie funktioniert hat: Es entstand keine Datei, Abfragen kappten still bei
1.000 Zeilen, und `restore_backup()` war gegen das tatsächliche Schema nicht
lauffähig. Die zugehörigen „Integrationstests" bestanden aus 63 Assertions der
Form `expect(true).toBe(true)`.

Sie verweisen zudem auf Dateien und npm-Skripte, die es nicht gibt
(`tests/e2e/backup.spec.ts`, `npm run test:integration:restore`,
`npm run test:integration:rls`).

Belegte Aufarbeitung: `docs/AUDIT_2026-07-29.md`. Behoben in Migration 0023 und
`src/lib/backup/*`.

`RELEASE_PRECONDITIONS.md` bezeichnet die Integrationstests als „BLOCKED
(requires desktop/laptop access)" — sie laufen bei jedem Push im CI-Job
`db-integration`.
