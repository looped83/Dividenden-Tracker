/**
 * Unterbereich "Datensicherung" der Einstellungen: Sicherung erstellen,
 * wiederherstellen und Daten exportieren.
 *
 * Die drei Abschnitte stehen untereinander statt in einer eigenen Reiterleiste.
 * Die Einstellungen bringen bereits eine Reiterebene mit — eine zweite darunter
 * waere doppelt. Jeder Abschnitt bringt seine eigene Karte mit Titel und
 * Beschreibung mit, wie die uebrigen Einstellungsbereiche.
 */

import BackupSection from "./BackupSection";
import RestoreSection from "./RestoreSection";
import ExportSection from "./ExportSection";

export function BackupPage() {
  return (
    <div className="space-y-6">
      <BackupSection />
      <RestoreSection />
      <ExportSection />
    </div>
  );
}
