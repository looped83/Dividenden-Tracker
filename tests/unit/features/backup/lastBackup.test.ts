import { describe, expect, it } from "vitest";
import { describeLastBackup } from "@/features/backup/hooks";

const now = new Date("2026-07-29T12:00:00Z");

describe("describeLastBackup", () => {
  it("benennt, wenn noch nie gesichert wurde", () => {
    expect(describeLastBackup(null, false, now)).toBe("Noch keine Sicherung erstellt.");
  });

  it("meldet den Ladezustand, statt eine Nie-Aussage zu behaupten", () => {
    // Waehrend des Ladens "Noch keine Sicherung erstellt." zu zeigen waere die
    // gefaehrlichste Falschaussage dieser Zeile.
    expect(describeLastBackup(null, true, now)).toMatch(/wird geladen/i);
  });

  it("sagt heute am selben Tag", () => {
    expect(describeLastBackup("2026-07-29T08:00:00Z", false, now)).toMatch(/heute/);
  });

  it("sagt gestern nach einem Tag", () => {
    expect(describeLastBackup("2026-07-28T08:00:00Z", false, now)).toMatch(/gestern/);
  });

  it("zaehlt die Tage und nennt zusaetzlich das Datum", () => {
    const label = describeLastBackup("2026-07-17T12:00:00Z", false, now);
    expect(label).toMatch(/vor 12 Tagen/);
    expect(label).toMatch(/17\.7\.2026|17\.07\.2026/);
  });
});
