# MIGRATION_PLAN.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindlicher Migrationsplan Numbers → App (Planungsphase)

Leitprinzip: **Die Numbers-Tabelle bleibt während der gesamten Migration die Golden Source.**
Die App übernimmt diese Rolle erst nach vollständiger, dokumentierter Abstimmung aller Jahre
und einer Parallelphase. Nichts wird gelöscht, bevor der finale Abgleich bestanden ist.

---

## 1. Voraussetzungen

- Phasen 1–4 des IMPLEMENTATION_PLAN.md abgeschlossen (insbesondere Import inkl. Bilanz,
  Duplikaterkennung, Rollback) und Phase 7 (Backup/Export) verfügbar.
- Ein leeres oder ausschließlich mit Testdaten befülltes Nutzerkonto; Testdaten werden vor
  Migrationsbeginn per Voll-Restore-Mechanik archiviert oder ein frisches Konto genutzt.
- Import-Mapping-Vorlage für das Numbers-Exportformat erstellt und an einem kleinen
  Jahresauszug verifiziert.

## 2. Ablauf (verbindliche Schrittfolge)

1. **Sicherheitskopie** der Numbers-Datei erstellen (Datum im Namen, zweiter Speicherort).
2. Datei zusätzlich als **XLSX exportieren** (Numbers → „Exportieren" → Excel).
3. Daten zusätzlich **jahrweise als CSV exportieren** (eine Datei je Kalenderjahr;
   CSV dient als Kontrollformat gegen XLSX-Exporteigenheiten).
4. **Historische Jahre einzeln importieren** — ältestes Jahr zuerst, ein Import = ein Jahr
   (kleine, prüfbare Einheiten; Rollback bleibt chirurgisch).
5. **Jeden Jahresimport separat validieren**: Importbilanz (IMPORT_SPEC.md §8) muss aufgehen;
   jede Warnung/mögliches Duplikat wird entschieden, nichts bleibt offen.
6. **Anzahl der Eingänge vergleichen**: Zeilenzahl Numbers (Jahr) ↔ „gültige neue Eingänge" +
   dokumentierte Ausschlüsse.
7. **Monatssummen vergleichen**: Numbers-Monatssummen (netto) ↔ App-Statistik 6.1 je Monat.
8. **Jahressummen vergleichen**: netto und brutto (Kennzahlen 6.3/6.4) ↔ Numbers-Jahreszeile;
   zusätzlich Kontrollsummen aus dem Importbericht (IMPORT_SPEC.md Schritt 17).
9. **Brutto- und Nettowerte** stichprobenartig auf Einzelzahlungsebene vergleichen
   (mindestens 5 Zahlungen je Jahr, darunter alle Fremdwährungs- und Korrekturfälle).
10. **Steuerwerte vergleichen**: Quellensteuer und inländische Steuern je Jahr (Kennzahl 6.17),
    sofern in Numbers geführt.
11. **Abweichungen einzeln dokumentieren** im Abweichungsprotokoll (§4) — jede Differenz
    erhält Ursache und Entscheidung (Quelle korrigieren / App-Wert korrigieren mit Audit /
    akzeptierte historische Ungenauigkeit mit Begründung).
12. **Import freigeben oder zurücksetzen**: Bei nicht erklärbaren Abweichungen → vollständiger
    Rollback des Jahresimports, Ursache klären, erneut importieren. Kein „wird später
    korrigiert".
13. **Parallelphase**: Neue Eingänge über eine Übergangszeit (Empfehlung: 2 volle
    Monatszyklen, mindestens 8 Wochen) doppelt pflegen (Numbers + App); wöchentlicher
    Schnellabgleich der laufenden Monatssumme.
14. **Finalen Gesamtexport** aus der App erzeugen (JSON-Vollbackup + Excel-Export) und
    gegen die Numbers-Gesamtsummen abschließend abstimmen.
15. **Numbers schreibgeschützt archivieren** (inkl. Sicherheitskopie aus Schritt 1);
    ab jetzt ist die App die Golden Source. Backup-Routine (30-Tage-Erinnerung) beginnt.

## 3. Abnahmekriterien je Jahr

Ein Jahr gilt **nur dann** als migriert, wenn:

- [ ] alle relevanten Zeilen klassifiziert sind (Importbilanz geht auf, keine offenen
      „möglichen Duplikate")
- [ ] keine Zeile stillschweigend fehlt (Zeilenzahlabgleich Schritt 6 dokumentiert)
- [ ] die Anzahl der Zahlungen plausibel übereinstimmt (Differenzen nur durch dokumentierte
      Ausschlüsse, z. B. Leer-/Strukturzeilen)
- [ ] definierte Monats- und Jahressummen übereinstimmen (netto; brutto soweit in Numbers
      vorhanden; Toleranz 0,00 € — Rundungsdifferenzen sind zu erklären, nicht zu tolerieren)
- [ ] jede verbleibende Abweichung im Abweichungsprotokoll dokumentiert und erklärt ist

Der Migrationsstatus je Jahr wird in einer Checkliste geführt (in der App als Notiz zum
jeweiligen Import sowie in `MIGRATION_LOG.md` im privaten Betriebsordner, nicht im Repo).

## 4. Abweichungsprotokoll (Vorlage)

| Feld | Inhalt |
|---|---|
| Jahr / Import-ID | z. B. 2019 / `imp_…` |
| Fundstelle | Numbers-Zeile bzw. App-Zahlung (ID) |
| Art | Zeilenzahl / Monatssumme / Einzelwert / Steuerwert |
| Numbers-Wert / App-Wert | beide Werte exakt |
| Ursache | z. B. Tippfehler in Numbers 2019, Rundung Broker, Duplikat in Numbers |
| Entscheidung | Quelle gilt / App-Korrektur (Audit-Link) / akzeptiert mit Begründung |
| Datum, Kürzel | |

## 5. Bekannte Risiken der Migration

| Risiko | Gegenmaßnahme |
|---|---|
| Numbers-XLSX-Export verändert Formate (Datum/Dezimal) | CSV-Gegenprobe (Schritt 3); Formatfestlegung im Assistenten je Datei |
| Historische Jahre ohne Steuerdetail | Felder leer lassen (Default 0 nur wo fachlich korrekt); Kennzahl 6.17/6.18 weist Datenlage aus |
| Uneinheitliche Firmennamen über die Jahre | Wertpapier-Zuordnung ISIN > Ticker > Name; nach jedem Jahresimport Stammdaten konsolidieren (App bietet Zusammenführen mit Audit) |
| Alt-Duplikate bereits in Numbers | Stufe-3/4-Erkennung markiert sie; Entscheidung wird protokolliert statt automatisch bereinigt |
| Ermüdung bei vielen Jahren („schnell durchklicken") | Ein Jahr pro Sitzung; Abnahme-Checkliste je Jahr verpflichtend abhaken |
| Doppelpflege-Phase wird vergessen | Wöchentlicher Abgleichstermin; Backup-/Paritätsstatus im Dashboard-Bereich Datensicherung sichtbar |

## 6. Phase 4 — technische Umsetzung des Imports

Migration `0016_import_phase4.sql` liefert die Werkzeuge für die eigentliche
Datenmigration:

- Herkunftsspalten `securities.created_by_import_id`, `depots.created_by_import_id`.
- Tabellen `security_aliases` (bestätigte Namenszuordnungen) und `import_rows`
  (Zeilen-Herkunft).
- RPCs `commit_import` (atomar, serverseitig kontrollsummen-verifiziert) und
  `rollback_import` (transaktionaler Vollrückbau).

Verifizierte Kontrollwerte der bereitgestellten Datei (als Abnahmebasis der
Migration): 1.439 Zeilen · 49.391,57 € · 15.11.2012–17.07.2026 · Broker
312/1.012/115 · alle Jahreswerte laut IMPORT_SPEC §13. Neu entstehende
Unternehmen werden **archiviert** angelegt (`archived_at`, `created_by_import_id`),
nicht automatisch aktiviert; bestehende Stammdaten behalten ihren Status.
