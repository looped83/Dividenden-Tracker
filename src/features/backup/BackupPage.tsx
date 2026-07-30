/**
 * Unterbereich „Sicherung" der Einstellungen: Sicherung erstellen,
 * wiederherstellen und Daten exportieren.
 *
 * Keine eigene Reiterleiste — die Einstellungen bringen bereits eine mit, eine
 * zweite darunter waere doppelt. Stattdessen stehen die beiden Haelften
 * derselben Sache ab `lg` nebeneinander: Eine Sicherung erstellt man, um sie
 * spaeter wieder einzuspielen; untereinander lag zwischen beiden ein
 * Bildschirmdrittel. Der Export verfolgt einen anderen Zweck (Auswerten,
 * Weitergeben) und steht deshalb fuer sich darunter.
 */

import BackupSection from "./BackupSection";
import RestoreSection from "./RestoreSection";
import ExportSection from "./ExportSection";

export function BackupPage() {
  return (
    <div className="space-y-6">
      {/* Ohne `items-start`: Beide Kacheln fuellen die Zeilenhoehe, ihre
          Unterkanten liegen also auf einer Linie. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BackupSection />
        <RestoreSection />
      </div>
      <ExportSection />
    </div>
  );
}
