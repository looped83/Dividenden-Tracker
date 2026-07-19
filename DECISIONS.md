# DECISIONS.md — Dividend Tracker

Stand: 2026-07-19 · Status: Entscheidungsprotokoll (fortlaufend gepflegt)

Format: knappe ADR-Einträge. Jede spätere Abweichung von einer Spezifikation wird hier als
neue Entscheidung dokumentiert, nie stillschweigend umgesetzt.

---

## D-001 · UI-Sprache Deutsch, Formatierung de-DE
**Kontext:** Persönliche Nutzung, deutsche Quelldaten (Numbers, Broker-Exporte).
**Entscheidung:** UI einsprachig Deutsch; Zahlen/Daten `de-DE`; keine i18n-Infrastruktur in v1.
**Konsequenz:** Weniger Komplexität; spätere Mehrsprachigkeit wäre Refactoring.

## D-002 · Basiswährung EUR, fix nach erster Buchung
**Kontext:** Auswertungen brauchen eine gemeinsame Währung; Umrechnungslogik braucht einen Anker.
**Entscheidung:** Profil-Basiswährung, Default EUR; änderbar nur bei leerem Datenbestand
(Trigger-geschützt). Fremdwährungszahlungen speichern Originalwerte + Kurs (R-2).
**Konsequenz:** Keine nachträgliche Gesamtumrechnung nötig; historische Beträge bleiben stabil.

## D-003 · Kein eigenes Backend, Logik in Postgres-RPCs + Client
**Kontext:** Vorgegebener Stack ohne Serverkomponente; Transaktionspflicht für Import/Restore.
**Entscheidung:** Transaktionale Mehrschritt-Operationen als Postgres-Funktionen
(`security invoker`); Parsing/Analyse clientseitig im Web Worker; Importdateien verlassen den
Browser nicht.
**Konsequenz:** Weniger Angriffsfläche und Betriebskosten; SQL-Funktionen brauchen eigene Tests.

## D-004 · Rundung kaufmännisch (ROUND_HALF_UP), keine Bankers-Rundung
**Kontext:** Abgleich mit deutschen Broker-Abrechnungen und der bestehenden Numbers-Tabelle.
**Entscheidung:** Einheitlich HALF_UP an den in CALCULATION_RULES.md §3 definierten Stellen.
**Konsequenz:** Ergebnisse entsprechen Belegen; dokumentierte, testbare Regel.

## D-005 · Rückerstattungen als positiver `refund`-Eingang
**Kontext:** Quellensteuer-Erstattungen passen nicht in die Brutto-Steuer-Netto-Invariante.
**Entscheidung:** `refund` mit brutto = netto, Steuerfelder 0, Details in der Notiz; keine
negativen Steuerfelder.
**Konsequenz:** Invariante bleibt einfach; Steuerstatistiken zeigen Erstattungen als eigene
Kategorie, nicht als negative Steuer.

## D-006 · Portfolio als optionale Depot-Gruppe, nicht am Eingang
**Kontext:** Vorgabe nennt „Portfolio" und „Depot" in der Identifikation eines Eingangs.
**Entscheidung:** Zahlung → Depot (Pflicht); Depot → Portfolio (optional). Kein
Portfolio-Feld am Eingang selbst.
**Konsequenz:** Keine widersprüchlichen Zuordnungen; Portfolio-Auswertung via Join.

## D-007 · Kein Unique-Constraint auf dem fachlichen Fingerprint
**Kontext:** Zwei echte identische Zahlungen am selben Tag sind möglich (Tranchen).
**Entscheidung:** `business_fingerprint` nur indexiert; Duplikate werden im Import-/Restore-
Prozess erkannt und vom Nutzer entschieden. Hartes Unique nur auf `(import_id, source_row_number)`.
**Konsequenz:** Grundsatz „Nutzer entscheidet unsichere Fälle" auch technisch konsequent.

## D-008 · ISIN-Prüfziffer clientseitig, DB prüft nur Format
**Kontext:** Luhn-Prüfung in SQL wäre unverhältnismäßig komplex.
**Entscheidung:** Zod validiert Prüfziffer; Postgres CHECK nur Struktur-Regex.
**Konsequenz:** Direkte API-Schreibzugriffe könnten formal gültige, prüfziffernfalsche ISINs
setzen — akzeptiert (eigene Daten, `data_quality`-Mechanik fängt Auffälligkeiten).

## D-009 · Import-Rollback als Soft-Archivierung, nicht Hard Delete
**Kontext:** Grundsatz 3 (kein stilles Löschen) vs. „Import vollständig rückgängig".
**Entscheidung:** Rollback archiviert alle Import-Zahlungen (audit-protokolliert); erneuter
Import bleibt möglich, Historie bleibt einsehbar.
**Konsequenz:** Speicher wächst minimal; Nachvollziehbarkeit maximal.

## D-010 · `imports.row_report` als JSONB statt eigener Zeilentabelle
**Kontext:** Vollständige Zeilenklassifikation muss dauerhaft gespeichert werden (Bilanz).
**Entscheidung:** Bericht als JSONB am Import (Datei ≤ 50.000 Zeilen, Limits IMPORT_SPEC.md §2).
**Konsequenz:** Einfaches Schema; kein relationales Abfragen einzelner Berichtzeilen nötig
(Anzeige erfolgt importbezogen). Bei Bedarf später extrahierbar.

## D-011 · Keine Offline-Schreibwarteschlange in v1
**Kontext:** PWA-Offline-Schreiben erzeugt Konflikt-/Verlustszenarien, die den
Integritätsgrundsätzen widersprechen.
**Entscheidung:** Offline nur Lesen (Query-Persist-Cache); Schreiben erfordert Verbindung und
wird offline klar deaktiviert.
**Konsequenz:** Einfache, verlustfreie Semantik; mobiles Erfassen braucht Netz (akzeptiert).

## D-012 · Keine Optimistic Updates für Finanzdaten
**Kontext:** UI-Zustand dürfte nie vom bestätigten Serverzustand abweichen.
**Entscheidung:** Mutationen zeigen Ladezustand und rendern erst den Serverstand.
**Konsequenz:** Minimal langsameres UI-Gefühl, maximale Verlässlichkeit der Anzeige.

## D-013 · TypeScript 5.9 gepinnt, 7.x-Upgrade als eigener Schritt
**Kontext:** npm-`latest` ist der neue native Compiler (7.x); Ökosystem-Tooling teils frisch.
**Entscheidung:** 5.9.x für v1; Upgrade-Fenster nach Phase 10 mit voller Testsuite.
**Konsequenz:** Konservative, reproduzierbare Toolchain (ARCHITECTURE.md K-1).

## D-014 · Kein zusätzlicher App-Pin/Biometrie in v1
**Kontext:** Gerätesperre + Supabase-Session decken das persönliche Bedrohungsmodell ab.
**Entscheidung:** Verzicht in v1; Session-Lebensdauer konservativ, Logout löscht Cache.
**Konsequenz:** Weniger Komplexität; als Backlog-Kandidat notiert.

## D-015 · SheetJS 0.20.x aus Hersteller-Registry statt npm
**Kontext:** npm-Paket `xlsx` eingefroren bei 0.18.5 mit bekannten CVEs.
**Entscheidung:** Bezug von cdn.sheetjs.com, Version + Integrität im Lockfile gepinnt; exakte
Patch-Version wird beim Projektsetup dokumentiert (CDN aus Planungsumgebung nicht erreichbar).
**Konsequenz:** Gepflegter Parser inkl. XLS-Altformat; Bezugsquelle im Setup-README erklärt.

## D-016 · Aggregation clientseitig + SQL-Views mit Abgleichtest
**Kontext:** Drill-down-Garantie (Kennzahl == Summe der Liste) und große Historien.
**Entscheidung:** Eine Kennzahl-Codequelle in `lib/statistics` für UI und Drill-down;
`v_stats_*`-Views für Gesamtauswertungen; CI-Test erzwingt Wertgleichheit.
**Konsequenz:** Doppelte Implementierung bewusst in Kauf genommen, aber testgesichert.

## D-017 · Beträge als Strings im Transport, `Money`-Branded-Type im Code
**Kontext:** Grundsatz 9 (keine unkontrollierten Floats); PostgREST liefert `numeric` als JSON.
**Entscheidung:** supabase-js/Typegen so konfiguriert, dass `numeric` als `string` typisiert
ist; Umwandlung ausschließlich über `lib/money`.
**Konsequenz:** Compiler verhindert versehentliche Float-Arithmetik.

## D-018 · Selbstregistrierung bleibt aktiv, App bleibt mandantenfähig
**Kontext:** Persönliches Projekt, aber sauberes Multi-User-Modell ist ohnehin RLS-Pflicht.
**Entscheidung:** Standard-Supabase-Auth mit E-Mail-Bestätigung; optional später per
Konfiguration schließbar.
**Konsequenz:** RLS-Tests mit zwei Nutzern sind ohnehin Kernbestandteil.

## D-019 · Zeitzone: Zahlungsdatum als reines Datum (`date`)
**Kontext:** Dividendengutschriften haben ein Buchungsdatum, keine Uhrzeit; Zeitzonenrechnung
würde Monatssummen verfälschen (31.12. vs. 01.01.).
**Entscheidung:** `pay_date date`, keine TZ-Konvertierung; „heute" = lokales Gerätedatum.
**Konsequenz:** Eindeutige Monats-/Jahreszuordnung identisch zur Numbers-Praxis.

## D-020 · XLS-Altformat „best effort"
**Kontext:** Vorgabe „möglichst XLS"; SheetJS liest BIFF, aber Altdateien sind fehleranfällig.
**Entscheidung:** XLS wird unterstützt; bei Parserproblemen klare Meldung mit Empfehlung
„in Numbers/Excel als XLSX exportieren". Kein eigener BIFF-Sonderweg.
**Konsequenz:** Realistische Zusage ohne Qualitätsrisiko im Kernpfad.

---

## Offene Entscheidungen (bewusst vertagt)

| # | Thema | Vertagt bis |
|---|---|---|
| O-1 | Exakte SheetJS-Patch-Version (CDN-Prüfung beim Setup) | Phase 1 |
| O-2 | Hosting-Anbieter für das statische Frontend (Anforderungen: Custom Header/CSP, EU-Region) | Phase 2 |
| O-3 | Supabase-Projektregion und Backup-Politik des Anbieters (zusätzlich zu eigenen JSON-Backups) | Phase 2 |
| O-4 | Konkrete Wertpapier-Stammdaten-Vorschlagsliste (Branchen-Taxonomie) | Phase 3 |
| O-5 | Umfang der Mapping-Vorlagen (nur letzte vs. benannte Bibliothek) | Phase 4 |
| O-6 | TypeScript-7-Umstieg | nach Phase 10 |
