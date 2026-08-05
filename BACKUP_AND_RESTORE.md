# BACKUP_AND_RESTORE.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliche Backup-/Restore-Spezifikation (Planungsphase)

Backups sind Kernfunktion (Grundsatz 12): Sie sind die Absicherung gegen Bedienfehler,
Anbieterausfall und Anbieterwechsel. Ziel: Der komplette Datenbestand ist jederzeit als
menschenlesbare, validierbare Datei exportier- und wiederherstellbar.

---

## 1. Exportarten

| Export | Zweck | Restore-fähig |
|---|---|---|
| **JSON-Vollexport** | Vollbackup inkl. aller Entitäten, Importhistorie, Audit-Informationen | ja (einzig gültiges Restore-Format) |
| **CSV-Export** | Weiterverarbeitung (eine Datei je Entität, ZIP-Bündel; Zahlungen auch einzeln) | nein (nur Daten-Mitnahme) |
| **Excel-Export (XLSX)** | Menschlich lesbare Arbeitsmappe: ein Blatt je Entität + Deckblatt mit Exportdatum/Kontrollsummen | nein |

Alle Exporte werden clientseitig aus RLS-gefilterten Daten erzeugt und als Datei-Download
bereitgestellt (iOS: Share-Sheet/Dateien-App). Formula-Injection-Schutz gemäß
SECURITY_MODEL.md §9. Beträge im JSON als Strings (Skalenerhalt, CALCULATION_RULES.md R-6).

## 2. JSON-Backupformat (versioniert)

```jsonc
{
  "format": "dividend-tracker-backup",
  "format_version": 2,               // Backup-Formatversion (dieses Dokument)
  "schema_version": "0031",           // höchste angewendete DB-Migration
  "app_version": "1.4.0",
  "exported_at": "2026-07-19T10:15:00Z",
  "base_currency": "EUR",
  "data": {
    "profile":          { ... },
    "portfolios":       [ ... ],
    "depots":           [ ... ],
    "securities":       [ ... ],
    "dividend_payments":[ ... ],      // inkl. archivierter Zeilen, Fingerprints, Herkunft
    "goals":            [ ... ],
    "imports":          [ ... ],      // Metadaten, Bilanz, row_report
    "security_aliases": [ ... ],      // beim Import bestätigte Schreibweisen (ab v2)
    "security_snapshot_runs": [ ... ],// Uploads des Portfolio-Exports (ab v2)
    "security_snapshots":     [ ... ],// Depotstände je Unternehmen und Stichtag (ab v2)
    "audit_log":        [ ... ]       // notwendige Auditinformationen
  },
  "integrity": {
    "counts":   { "dividend_payments": 4812, "securities": 63, ... },
    "totals":   { "net_sum": "48123.45", "gross_sum": "61234.56" },  // aktive Zahlungen
    "checksums":{ "dividend_payments": "sha256:…", ... }             // je Entität über kanonisches JSON
  }
}
```

- Kanonisierung für Checksummen: Zeilen nach `id` sortiert, Schlüssel alphabetisch,
  UTF-8, keine Whitespace-Varianz.
- IDs (uuid) bleiben im Backup erhalten → Restore stellt Verknüpfungen (Zahlung → Import →
  Wertpapier → Depot) exakt wieder her.
- `format_version` wird nur bei Strukturbrüchen erhöht; Lesecode unterstützt alle bisherigen
  Versionen (Migrations-Adapter je Version, getestet mit archivierten Beispieldateien).

### 2.1 Version 2 — Depotstände (seit 2026-08-04)

Version 2 ergänzt drei Bereiche. Version 1 bleibt **einspielbar**: Die Bereiche fehlen dort
schlicht und bleiben nach dem Einspielen leer. Eine ältere Sicherung abzuweisen, weil das
Format gewachsen ist, wäre genau der Moment, in dem eine Datensicherung nichts mehr wert ist.

| Bereich | Warum gesichert |
|---|---|
| `security_snapshots` | **Nicht rekonstruierbar.** DivvyDiary exportiert immer nur den heutigen Stand; ein verlorener Stichtag ist endgültig weg. Anders als die Kalendertermine (docs/CALENDAR_INTEGRATION.md), die ein erneuter Feed-Abgleich wieder aufbaut — deshalb bleiben jene weiterhin außen vor. |
| `security_snapshot_runs` | Trägt Stichtag und Bilanz des Uploads. Ohne ihn ließe sich „an diesem Tag kein Upload" nicht von „an diesem Tag keine Positionen" unterscheiden. |
| `security_aliases` | Rekonstruierbar nur, indem der Nutzer jede beim Import bestätigte Schreibweise erneut bestätigt — genau die Arbeit, die eine Sicherung ihm abnehmen soll. |

Alle drei Tabellen kennen **kein UPDATE-Recht** (Migrationen 0016 und 0029): Ein Alias wird
angelegt oder gelöscht, ein Stichtag als Ganzes ersetzt, nie zeilenweise umgeschrieben. Die
Wiederherstellung hält sich daran (§5.2/§5.3).

## 3. Backup-Erinnerung und Status

- `last_backup_at` wird **nur** nach vollständig erzeugtem und heruntergeladenem JSON-Export
  gesetzt (`markBackupCompleted` in `src/lib/backup/backupService.ts`). Eine Wiederherstellung
  setzt den Wert ausdrücklich nicht — sie ist keine Sicherung (ADR-003).
- Der Bereich „Datensicherung" und die Einstellungen zeigen den Stand als Satz
  („Zuletzt gesichert: vor 12 Tagen (17.7.2026)"), abgeleitet in
  `src/features/backup/hooks.ts`.

**Umgesetzt seit 2026-07-29.** Zuvor war `last_backup_at` seit Migration 0004 vorhanden und
wurde nie geschrieben; die Frage „wann habe ich zuletzt gesichert?" war nicht zu beantworten.

**Noch nicht umgesetzt** (bewusst benannt, nicht stillschweigend übergangen):

- Aktive Erinnerung nach Ablauf von `backup_reminder_days` (Standard 30). Das Feld besteht,
  die Auswertung fehlt.
- Anzahl der seit der letzten Sicherung geänderten Datensätze.

## 4. Validierung eines Backups (vor jeder Wiederherstellung)

Reihenfolge, Abbruch beim ersten harten Fehler:

1. JSON parsebar, `format == "dividend-tracker-backup"`
2. `format_version` bekannt (sonst: „Backup stammt aus neuerer App-Version")
3. Pflichtblöcke vorhanden; Zod-Schema je Entität (gleiche Regeln wie Live-Validierung)
4. Referentielle Integrität im Backup (jede Zahlung findet Depot/Wertpapier/Import)
5. `integrity.counts` == tatsächliche Zeilenzahlen
6. `integrity.checksums` stimmen (Manipulation/Beschädigung erkennbar)
7. Warnstufe (kein Abbruch): `schema_version` älter als aktuelle App → Feld-Defaults werden
   ergänzt und im Bericht ausgewiesen; `base_currency` ≠ Profil-Basiswährung → harter Fehler
   (keine stille Umrechnung)

## 5. Wiederherstellung

Zwei Modi, beide über die RPC `restore_backup(payload, mode)` in **einer Transaktion**, beide
mit Pflicht-Vorschau und ausdrücklicher Bestätigung. Verbindlich ist ADR-003.

### 5.1 Vorschau (immer, ohne Schreiben)

Zeigt Zeilenzahlen je Entität, Erstellungsdatum, Basiswährung, Schema- und App-Version
(`BackupContents`). Anschließend wählt der Nutzer den Modus; die Ausführung verlangt eine
Bestätigung im Dialog, die die Folgen benennt.

### 5.2 `mode='replace'` — Zustand der Sicherung herstellen

- Zeilen aus der Datei gewinnen (`on conflict … do update`).
- Alles Übrige wird **storniert**, nie gelöscht (`archive_reason = 'Durch Wiederherstellung
  einer Sicherung ersetzt'`) — Grundsatz 6, D-034.
- Depotstände werden **je Stichtag** ersetzt, nicht pauschal: Gelöscht werden genau die Läufe
  der Stichtage, die die Datei mitbringt (kaskadierend mit ihren Zeilen), danach wird
  eingefügt. Ein Stichtag, über den die Datei nichts sagt, bleibt bestehen — ihn zu löschen
  wäre unwiederbringlich. Ebenso bei den Aliasen: ersetzt werden nur die Schreibweisen, die
  in der Datei stehen.
- Die eigene Sicherung einzuspielen stellt den Bestand vollständig wieder her. Das ist durch
  einen Regressionstest abgesichert: Die ursprüngliche Fassung archivierte zuerst alles und
  fügte anschließend nichts ein, weil die IDs bereits existierten.

### 5.3 `mode='merge'` — ergänzen

- Fügt fehlende Datensätze hinzu; vorhandene bleiben unangetastet (`on conflict … do nothing`).
- Idempotent: dieselbe Datei zweimal einspielen erzeugt keine Duplikate (ID-basiert).
- Liegt für einen Stichtag bereits ein Lauf vor (etwa ein Upload nach der Sicherung), gewinnt
  der Bestand — Lauf **und** seine Zeilen werden gemeinsam übersprungen. Lauf und Zeilen
  gehören zusammen; einzelne Zeilen eines fremden Laufs einzufügen ergäbe einen Stichtag, den
  keine Datei je beschrieben hat.

### 5.4 Was bewusst **nicht** umgesetzt ist

Die ursprüngliche Spezifikation sah eine Konfliktauflösung je Datensatz vor (abweichende
Inhalte bei gleicher `id` einzeln entscheiden, sekundärer Abgleich über
`business_fingerprint`). Das ist **nicht** gebaut. Der Code enthielt eine Konflikterkennung,
deren Ergebnis verworfen wurde, bevor es die RPC erreichte, sowie eine nie eingebundene
Oberfläche dafür; beides wurde entfernt (Audit 2026-07-29).

Die beiden Modi decken die realen Fälle ab — „ich habe etwas verloren" (merge) und „ich will
den Stand von damals" (replace). Eine feldweise Konfliktauflösung bliebe eine Funktion, die
man einmal im Leben braucht und deren Fehlbedienung teuer ist.

### 5.5 Fingerprints beim Einspielen

`business_fingerprint` wird vom Trigger neu berechnet, nie aus der Datei übernommen. Ein
veralteter Wert verfälschte die Dublettenerkennung dauerhaft.

## 6. Fehlerfälle

| Fall | Verhalten |
|---|---|
| Beschädigtes Backup (Checksumme falsch) | Abbruch vor jedem Schreiben, genaue Angabe der betroffenen Entität |
| Unvollständiges Backup (Block fehlt) | Abbruch mit Liste fehlender Blöcke |
| Ältere Formatversion | Adapter migriert in aktuelles Format, Bericht listet ergänzte Defaults |
| Neuere Formatversion | Abbruch mit Hinweis auf App-Update |
| Abbruch mitten im Restore | Transaktion rollt vollständig zurück; kein Teilzustand |
| Speicher-/Netzfehler beim Export | Export gilt als fehlgeschlagen; `last_backup_at` bleibt unverändert |
| Weniger Zeilen geladen als die Datenbank führt | Sicherung bricht ab, es entsteht **keine** Datei (`assertComplete`, ADR-002) |
| Unlesbarer Betrag in den Daten | Sicherung bricht ab, statt den Wert als `null` in die Datei zu schreiben |
| Depotstand ohne sein Unternehmen oder ohne seinen Lauf | Abbruch vor jedem Schreiben mit `missing_security_reference` bzw. `missing_run_reference` (`validate_snapshot_references`, Migration 0031) — sonst schlüge dieselbe Datei eine Anweisung später mit einer Fremdschlüsselverletzung fehl, deren Text den Grund verschweigt |

## 7. Tests (Verweis)

Backup-Roundtrip (Export → Wipe → Restore → byte-/wertgleicher Vergleich), beschädigte und
unvollständige Backups, ältere Formatversionen, mehrfacher Restore, Merge-Konflikte:
TEST_STRATEGY.md §7.

---

## Phase 4 — Rollback als Wiederherstellungspfad

Jeder abgeschlossene Import ist über `rollback_import(import_id)` vollständig und
transaktional rückrollbar (IMPORT_SPEC.md §10/§17):

- Alle aktiven Zahlungen des Imports werden archiviert (Soft Delete,
  `archive_reason = 'Import-Rollback'`, Audit `origin = 'rollback'`) — kein Hard
  Delete, das Audit-Log bleibt vollständig erhalten.
- Durch den Import neu angelegte Wertpapiere/Depots bleiben archiviert, solange
  keine anderen aktiven Zahlungen darauf verweisen; bereits vorher existierende
  Stammdaten werden nie angetastet.
- Nur aus diesem Import stammende Aliase werden entfernt.
- Der Importdatensatz selbst bleibt als `rolled_back`-Historie erhalten; nach
  Rollback stimmen aktiver Datenbestand und Summen wieder mit dem Zustand vor
  dem Import überein (Integrationstest verifiziert: aktive Anzahl 0, aktive
  Summe `null`).

Die eigenständige JSON-Voll-Sicherung (oben) bleibt der primäre Backup-Pfad;
der Import-Rollback deckt gezielt genau einen Importlauf ab.
