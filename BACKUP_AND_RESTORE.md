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
  "format_version": 1,               // Backup-Formatversion (dieses Dokument)
  "schema_version": "0007",           // höchste angewendete DB-Migration
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

## 3. Backup-Erinnerung und Status

- Bereich „Datensicherung" zeigt: letztes erfolgreiches Backup (`profiles.last_backup_at`),
  Anzahl seither geänderter/neuer Datensätze (aus `audit_log` ableitbar), Empfehlung.
- Erinnerung: nicht-blockierender Hinweis in der App, wenn `now() − last_backup_at >
  backup_reminder_days` (Default 30 Tage) **oder** seit dem letzten Backup ein Import lief.
- `last_backup_at` wird nur nach vollständig erzeugtem und heruntergeladenem JSON-Export
  gesetzt.

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

Zwei Modi, beide über `restore_backup(payload, mode)`-RPC in **einer Transaktion**, beide mit
Pflicht-Vorschau vor Ausführung:

### 5.1 Vorschau (immer, ohne Schreiben)

Zeigt: Backup-Datum, Versionen, Zeilenzahlen je Entität, Kontrollsummen, sowie im
Merge-Modus die Konfliktanalyse (wie viele Zahlungen neu / bereits vorhanden / abweichend).

### 5.2 Voll-Restore (`mode='full'`)

- Nur zulässig, wenn der Datenbestand leer ist **oder** der Nutzer der vorherigen
  Komplett-Archivierung ausdrücklich zustimmt („Bestehende N Datensätze werden archiviert und
  durch das Backup ersetzt" — kein Hard Delete, Grundsatz 3).
- Stellt alle Entitäten mit Original-IDs, Herkunft, Fingerprints, Importhistorie wieder her;
  `audit_log`-Einträge des Backups werden als historische Einträge übernommen, zusätzlich
  entsteht ein neuer Audit-Eintrag `action='restore'` mit Backup-Metadaten.
- Wiederhergestellte Zahlungen behalten `source` aus dem Backup; das Restore-Ereignis selbst
  ist über den Audit-Eintrag und `imports`-Historie nachvollziehbar.

### 5.3 Merge-Restore (`mode='merge'`)

- Ergänzt fehlende Datensätze; vorhandene bleiben unangetastet.
- Duplikatprüfung beim Restore: primär über `id` (identisch → überspringen), sekundär über
  `business_fingerprint` (gleicher Fingerprint, andere ID → als „möglicher Konflikt" in der
  Vorschau, Standard überspringen, einzeln übersteuerbar — analog Import Stufe 3/4).
- Abweichende Datensätze (gleiche `id`, unterschiedlicher Inhalt) werden **nie**
  überschrieben: Konfliktliste in der Vorschau, Entscheidung je Datensatz (behalten /
  Backup-Stand als Korrektur übernehmen → auditierter UPDATE).
- Ergebnisbericht analog Importbilanz: `gesamt = neu + übersprungen + Konflikte(entschieden)`.

### 5.4 Mehrfacher Restore

Restore ist idempotent: dasselbe Backup zweimal einspielen (merge) erzeugt keine Duplikate
(id-basiert). Voll-Restore nach Voll-Restore archiviert den ersten Stand nachvollziehbar.

## 6. Fehlerfälle

| Fall | Verhalten |
|---|---|
| Beschädigtes Backup (Checksumme falsch) | Abbruch vor jedem Schreiben, genaue Angabe der betroffenen Entität |
| Unvollständiges Backup (Block fehlt) | Abbruch mit Liste fehlender Blöcke |
| Ältere Formatversion | Adapter migriert in aktuelles Format, Bericht listet ergänzte Defaults |
| Neuere Formatversion | Abbruch mit Hinweis auf App-Update |
| Abbruch mitten im Restore | Transaktion rollt vollständig zurück; kein Teilzustand |
| Speicher-/Netzfehler beim Export | Export gilt als fehlgeschlagen; `last_backup_at` bleibt unverändert |

## 7. Tests (Verweis)

Backup-Roundtrip (Export → Wipe → Restore → byte-/wertgleicher Vergleich), beschädigte und
unvollständige Backups, ältere Formatversionen, mehrfacher Restore, Merge-Konflikte:
TEST_STRATEGY.md §7.
