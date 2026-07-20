# PRODUCT_SPEC.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliche Produktspezifikation (Planungsphase, noch keine Implementierung)

---

## 1. Produktvision

Der Dividend Tracker ist eine persönliche, langfristig genutzte Finanzanwendung, die eine seit
Jahren gepflegte Numbers-/Excel-Tabelle kontrolliert ablöst. Sie dokumentiert **ausschließlich
tatsächlich erhaltene Dividendeneingänge** — zuverlässig, nachvollziehbar, geräteübergreifend und
über Jahrzehnte hinweg auswertbar.

Die Anwendung ist **kein Prototyp** und **kein generisches Portfolio-Tool**. Der Maßstab ist die
Verlässlichkeit eines Buchhaltungssystems: Jede Zahl in jeder Statistik muss sich lückenlos auf
konkrete Einzelzahlungen zurückführen lassen.

### Zielgeräte

| Gerät | Nutzungsschwerpunkt |
|---|---|
| Mac (Desktop-Browser) | Importe, Massenprüfung, Statistiken, Migration |
| iPad | Vollständige Verwaltung, Prüfung, Auswertung |
| iPhone | Schnelle manuelle Erfassung, Nachschlagen, kompakte Statistiken |

Die Anwendung ist als **Progressive Web App** installierbar (Add to Home Screen / Dock).

### Nutzerkontext

- Primär ein einzelner Nutzer (persönliche Finanzen), die Architektur ist aber von Beginn an
  mandantenfähig (Row Level Security pro `user_id`), sodass keine spätere Umstellung nötig ist.
- Basiswährung: **EUR** (siehe DECISIONS.md, D-002). Zahlungen in Fremdwährungen werden mit
  Originalbetrag, Originalwährung und Wechselkurs erfasst und zusätzlich in EUR geführt.
- UI-Sprache: **Deutsch** (Zahlen-, Datums- und Währungsformatierung `de-DE`).

---

## 2. Produktumfang

### 2.1 Im Umfang (Kernfunktionen)

1. Tatsächliche Dividendeneingänge erfassen (manuell und per Import)
2. Langfristige Zahlungshistorie mit Suche, Filter, Sortierung
3. CSV-, XLSX- und (soweit technisch möglich) XLS-Import mit kontrolliertem, mehrstufigem Prozess
4. Vollständige Import-Rückverfolgbarkeit und Import-Rollback
5. Mehrstufige Duplikaterkennung
6. Belastbare Statistiken mit Drill-down auf Einzelzahlungen
7. Unternehmens-/Wertpapier-Stammdaten mit Historie
8. Mehrere Depots mit Auswertungen
9. Persönliche Ziele (getrennt von Ist-Daten)
10. Backups (JSON/CSV/Excel-Export), validierte Wiederherstellung
11. Audit Log für alle relevanten Änderungen
12. Kontrollierte Migration aus Numbers (Golden-Source-Prinzip)
13. PWA mit Offline-Lesecache (Supabase bleibt Source of Truth)

### 2.2 Ausdrücklich NICHT im Umfang

Dividendenkalender · erwartete/prognostizierte Dividenden · Ex-Dividenden-Termine · zukünftige
Zahlungstermine · automatische Dividendenankündigungen · Live-Aktienkurse · Kauf-/Verkaufs-
transaktionen · vollständige Portfolio-Performance · Broker-Synchronisierung · Depot-Login ·
KI-Kaufempfehlungen · Steuerberatung · PDF-Abrechnungserkennung · Nachrichten/Unternehmens-News.

Für erwartete und zukünftige Dividenden wird weiterhin **DivvyDiary** genutzt. Diese Abgrenzung
ist bewusst und dauerhaft; Features aus dieser Liste werden auch nicht „nebenbei" angelegt
(z. B. keine Felder für Ex-Tag oder erwartete Beträge im Datenmodell).

---

## 3. Nicht verhandelbare Produktgrundsätze

Diese 15 Grundsätze sind Abnahmekriterien für jede Phase (siehe IMPLEMENTATION_PLAN.md):

1. Jeder Dividendeneingang stellt ein konkretes Finanzereignis dar.
2. Kein Eingang darf stillschweigend verändert werden → jede Änderung erzeugt einen Audit-Log-Eintrag mit Alt-/Neuwerten.
3. Kein Eingang darf stillschweigend gelöscht werden → es gibt **kein Hard Delete**; nur Storno/Archivierung mit Audit-Eintrag. Einzige, eng begrenzte Ausnahme: ein bereits archivierter Eingang kann vom Eigentümer endgültig entfernt werden (Archivierung ist zwingende Voraussetzung, Löschung wird audit-protokolliert, siehe DECISIONS.md D-034).
4. Kein Eingang darf unbemerkt doppelt importiert werden → vierstufige Duplikaterkennung (IMPORT_SPEC.md §7).
5. Keine Importzeile darf ohne Rückmeldung verworfen werden → Importbilanz muss aufgehen (IMPORT_SPEC.md §8).
6. Jede Statistik muss auf konkrete Einzelzahlungen zurückführbar sein → Drill-down ist Pflicht für jede Kennzahl.
7. Jede relevante Änderung muss nachvollziehbar protokolliert werden → Audit Log (SECURITY_MODEL.md §8).
8. Tatsächliche Eingänge dürfen nicht mit Schätzungen oder Prognosen vermischt werden → es existieren keine Prognosedaten im System.
9. Geldbeträge dürfen nicht unkontrolliert mit JavaScript-Gleitkommazahlen berechnet werden → Decimal.js im Client, `numeric` in Postgres (CALCULATION_RULES.md).
10. Imports müssen vor dem Speichern vollständig geprüft werden → kein Schreibzugriff vor expliziter Bestätigung.
11. Jeder Import muss vollständig rückgängig gemacht werden können → Import-Rollback (IMPORT_SPEC.md §10).
12. Backups und Wiederherstellung sind Kernfunktionen → BACKUP_AND_RESTORE.md.
13. Sämtliche nutzerbezogenen Daten sind durch Row Level Security geschützt → SECURITY_MODEL.md.
14. Secrets liegen niemals im Frontend oder Repository.
15. Keine Werbe-, Tracking- oder externen Analytics-Dienste. Einzige externen Endpunkte: die eigene Supabase-Instanz.

---

## 4. Hauptnavigation

| Bereich | Zweck |
|---|---|
| **Übersicht** | Dashboard mit Kernkennzahlen, Entwicklung, Zielfortschritt |
| **Dividendeneingänge** | Vollständige Zahlungshistorie, Erfassung, Bearbeitung, Detailansicht |
| **Unternehmen** | Wertpapier-Stammdaten und Historie je Unternehmen |
| **Depots** | Depotverwaltung und Auswertung je Depot |
| **Statistiken** | Vertiefte Auswertungen, Vergleiche, Aufteilungen |
| **Importe** | Import-Assistent, Importhistorie, Rollback |
| **Ziele** | Persönliche Jahres- und Langfristziele |
| **Datensicherung** | Export, Backup, Restore, Backup-Status |
| **Einstellungen** | Profil, Basiswährung, Darstellung, Sicherheit |

**Es gibt keinen Kalenderbereich.**

Navigationsmuster je Gerät: Desktop dauerhafte Sidebar, iPad adaptive Sidebar, iPhone Bottom
Navigation mit 5 Slots (Übersicht, Eingänge, ＋ Erfassen, Statistiken, Mehr) — Details in
UX_AND_DESIGN_SYSTEM.md.

---

## 5. Funktionsbereiche im Detail

### 5.1 Übersicht (Dashboard)

Kennzahlen (jede mit Drill-down auf die zugrunde liegenden Zahlungen):

- Nettodividenden im laufenden Jahr (YTD)
- Bruttodividenden im laufenden Jahr (YTD)
- Vergleich mit dem gleichen Zeitraum des Vorjahres (absolut und prozentual)
- Rollierende Zwölfmonatssumme (netto)
- Durchschnittliche monatliche Dividende
- Stärkster Monat / schwächster Monat
- Letzter Dividendeneingang (mit Direktlink)
- Anzahl der Eingänge im laufenden Jahr
- Fortschritt zum Jahresziel (falls Ziel definiert)

Diagramme:

- Monatliche Entwicklung (Balken, aktuelles Jahr vs. Vorjahr überlagerbar)
- Jährliche Entwicklung (Balken über alle Jahre)

Exakte Formeln, Rundung und Randfälle jeder Kennzahl: CALCULATION_RULES.md §6.

**Drill-down-Prinzip:** Klick/Tap auf eine Kennzahl oder ein Diagrammsegment öffnet die
Zahlungsliste mit vorbefüllten Filtern (z. B. „Netto YTD" → Eingänge, Jahresfilter =
laufendes Jahr). Die Summe der gefilterten Liste muss exakt der Kennzahl entsprechen.

### 5.2 Dividendeneingänge

- Vollständige Zahlungshistorie über alle Jahre
- Desktop/iPad: Datentabelle mit Spaltenkonfiguration; iPhone: Kartenansicht
- Volltextsuche (Unternehmen, Ticker, ISIN, Notiz)
- Sortierung nach Datum, Betrag, Unternehmen, Depot
- Filter: Jahr, Monat, Unternehmen, Depot, Währung, Zahlungsart, Herkunft, Status (aktiv/storniert/archiviert)
- Manuelle Erfassung über Formular (optimiert für schnelle iPhone-Eingabe): erfasst nur
  Depot, Unternehmen, Zahlungsdatum und Nettobetrag (Komma als Dezimaltrennzeichen); Brutto,
  Steuern und Fremdwährung sind weiterhin Datenbankfelder, werden im aktuellen Formular aber
  automatisch abgeleitet statt manuell abgefragt (Bruttobetrag = Nettobetrag, Steuern = 0,
  Währung = Depot-Basiswährung; siehe DATA_DICTIONARY.md §9)
- Kontrollierte Bearbeitung: Änderungsdialog mit Begründungsfeld (optional), jede Änderung im Audit Log
- Storno (Korrektur-Gegenbuchung oder Kennzeichnung) und Archivierung — kein Löschen, außer
  endgültiges Entfernen eines **bereits archivierten** Eingangs (enge Ausnahme, DECISIONS.md D-034)
- Detailansicht mit: allen Feldern, Änderungsverlauf, Herkunft (manuell/Import), Link zum ursprünglichen Import inkl. Dateiname und Zeilennummer

### 5.3 Unternehmen

Pro Wertpapier/Unternehmen:

- Stammdaten: Name, Ticker, ISIN, WKN, Land, Branche, Währung, persönliche Notizen
- Optionales Standard-Depot als unverbindlicher Vorschlag: füllt beim Anlegen eines
  Dividendeneingangs das Depot-Feld vor und wird beim Excel-Import per Namensabgleich aus
  einer Depot-/Broker-Spalte übernommen — keine feste Bindung (DECISIONS.md D-035)
- Datenqualitätsstatus (`ok` / `unvollständig` / `prüfen`) — z. B. fehlende ISIN nach Import
- Sämtliche historischen Dividendeneingänge
- Summe pro Jahr und pro Monat, durchschnittliche Zahlung, Anzahl der Zahlungen
- Brutto-/Nettoentwicklung, gezahlte Steuern
- Anteil am gesamten Dividendeneinkommen

Keine zukünftigen Zahlungen, keine erwarteten Dividenden, keine Kurse.

### 5.4 Depots

- Mehrere Depots: Name, Broker, Basiswährung, persönliche Notiz
- Optionale Gruppierung von Depots zu einem Portfolio (siehe DECISIONS.md, D-006)
- Zahlungen je Depot, Jahres- und Monatsstatistiken
- Prozentualer Anteil am Dividendeneinkommen, Depotvergleich
- Keine Depotbestände, keine Livekurse

### 5.5 Statistiken

Vollständige Kennzahlenliste mit verbindlichen Definitionen: CALCULATION_RULES.md §6.
Umfasst mindestens: Netto/Brutto pro Monat und Jahr, Vorjahresvergleich (absolut/prozentual),
rollierende 12-Monats-Summe, monatlicher Durchschnitt (gesamt und je Jahr), bestes Jahr,
stärkster/schwächster Monat, Top-Zahler, Konzentration nach Unternehmen, Aufteilung nach
Land/Branche/Währung/Depot, Quellensteuer, inländische Steuern, effektive Steuerquote,
Sonderdividenden, Korrekturbuchungen, Anzahl der Eingänge, Zielerreichung.

### 5.6 Importe

Import-Assistent (25 kontrollierte Schritte, IMPORT_SPEC.md), Importhistorie mit Status,
Importbericht und vollständigem Rollback je Import.

### 5.7 Ziele

Zieltypen: Nettodividenden pro Kalenderjahr, Bruttodividenden pro Kalenderjahr, rollierende
Zwölfmonatssumme, durchschnittliche monatliche Nettodividende, langfristiges Ziel mit Zieljahr.
Ziele sind reine Vergleichswerte; sie erzeugen keine prognostizierten Einzelzahlungen und werden
vollständig getrennt von den Ist-Daten gespeichert (eigene Tabelle `goals`).

### 5.8 Datensicherung

JSON-Vollexport (Restore-fähig, versioniert), CSV- und Excel-Export, Restore mit Vorschau und
Validierung, Backup-Erinnerung, Anzeige des letzten erfolgreichen Backups. Details:
BACKUP_AND_RESTORE.md.

### 5.9 Einstellungen

Profil (E-Mail, Passwort/Session-Verwaltung), Basiswährung (nur bei leerem Datenbestand änderbar,
siehe DECISIONS.md D-002), Darstellung (Hell/Dunkel/System), Backup-Erinnerungsintervall,
Datenexport-Verknüpfung, App-Version und Schemaversion.

---

## 6. Qualitätsziele (nicht funktional)

| Kategorie | Ziel |
|---|---|
| Datenintegrität | Importbilanz geht immer auf; keine stillen Verluste; Audit Log lückenlos |
| Verfügbarkeit der Daten | Source of Truth in Supabase Postgres; lokaler Speicher nur Cache |
| Performance | Historie mit ≥ 10.000 Zahlungen flüssig filter- und sortierbar; Import von 50.000 Zeilen ohne UI-Blockade (Web Worker) |
| Sicherheit | RLS auf jeder Tabelle; automatisierte RLS-Tests mit 2 Nutzern; CSP; keine Secrets im Client |
| Barrierefreiheit | Tastaturbedienung, Screenreader-Labels, Kontrast ≥ WCAG AA, Touch-Ziele ≥ 44 pt |
| Wartbarkeit | TypeScript strict, dokumentierte Berechnungsregeln, Migrations-basiertes Schema, Testabdeckung der Finanzlogik nahe 100 % |
| Datenschutz | Keine Drittdienste, keine Telemetrie, keine sensiblen Daten in Logs |

---

## 7. Abgrenzung zu verwandten Dokumenten

| Dokument | Inhalt |
|---|---|
| ARCHITECTURE.md | Tech-Stack, Versionen, Systemarchitektur, Datenfluss, PWA |
| DATA_MODEL.md | Tabellen, Constraints, Trigger, Indizes |
| DATA_DICTIONARY.md | Feldliste mit Pflicht/optional/abgeleitet/technisch |
| IMPORT_SPEC.md | Importprozess, Formate, Duplikate, Bilanz, Rollback |
| CALCULATION_RULES.md | Geld-/Rundungskonzept, Kennzahldefinitionen |
| SECURITY_MODEL.md | Auth, RLS, CSP, Audit Log, Bedrohungsmodell |
| BACKUP_AND_RESTORE.md | Backupformat, Restore, Integritätsprüfung |
| TEST_STRATEGY.md | Teststrategie über alle Ebenen |
| MIGRATION_PLAN.md | Kontrollierte Numbers-Migration |
| UX_AND_DESIGN_SYSTEM.md | Designsystem, responsive Layouts |
| IMPLEMENTATION_PLAN.md | Phasenplan mit Abnahmekriterien |
| DECISIONS.md | Getroffene Annahmen und Architekturentscheidungen |

## Phase 6 – Dividendeneingänge verwalten und Datenqualität sichern

Die Verwaltungsansicht (`/eingaenge`) erlaubt Suchen, kombinierbare Filter
(Zeitraum/Jahr/Monat, Unternehmen, Depot, Status, Datenquelle), Sortierung und
Paginierung; Filter/Suche/Sortierung sind URL-Zustand und bleiben nach Reload
sowie über Browser-Zurück/-Vorwärts erhalten.

**Statusmodell.** Ein Eingang ist *aktiv* oder *storniert*. Stornieren und
dauerhaftes Löschen sind zwei klar getrennte Aktionen und werden nie synonym
verwendet:

- **Stornieren** (technisch `archived_at`/`archive_reason`): Der Datensatz bleibt
  erhalten, wird aber aus den Standardauswertungen (Dashboard/Statistik)
  ausgeschlossen und kann später **reaktiviert** werden.
- **Dauerhaft löschen**: Der Datensatz wird vollständig entfernt, aus allen
  Aggregationen genommen und kann innerhalb der Anwendung nicht wiederhergestellt
  werden. Löschbar sind eigene aktive und stornierte Eingänge, manuelle wie
  importierte (D-6-1). Jede Löschung erfordert eine eindeutige Bestätigung
  („Dividendeneingang dauerhaft löschen?" mit Unternehmen, Datum, Depot, Betrag,
  Datenquelle) und wird atomar im Audit Log protokolliert.

**Manuelles Anlegen/Bearbeiten.** Pflichtfelder: Zahlungsdatum, Unternehmen,
Depot, Nettobetrag; optional Notiz. Zukünftige Zahlungsdaten werden abgelehnt.
Bearbeitung importierter Eingänge erhält die Importherkunft (Herkunftsfelder
bleiben unveränderlich). Parallele Änderungen werden über Optimistic Concurrency
erkannt.

**Massenaktionen.** Depot/Unternehmen zuweisen, Stornieren, Reaktivieren,
dauerhaft Löschen — mit sichtbarer Auswahl, klarer Unterscheidung
„Seite/alle gefilterten", Bestätigung und ehrlicher Ergebniszusammenfassung.

**Datenqualität** (`/eingaenge/datenqualitaet`). Mögliche Dubletten (gewichtet:
hohe Wahrscheinlichkeit vs. mögliche Dublette) und regelbasierte Auffälligkeiten
werden nur *angezeigt* — nie automatisch storniert, gelöscht oder zusammengeführt.
Legitime Mehrfachzahlungen mit abweichendem Betrag bleiben erhalten.
