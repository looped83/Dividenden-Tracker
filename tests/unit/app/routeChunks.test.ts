import { describe, expect, it } from "vitest";
import {
  PRIMARY_NAV_ITEMS,
  SETTINGS_TABS,
  STATISTICS_TABS,
  BOTTOM_NAV_MORE_ITEMS,
} from "@/app/navigation";
import { chunksFor } from "@/app/routeChunks";

/**
 * Das Vorausladen ist stumm: Fehlt ein Pfad in der Tabelle, passiert schlicht
 * nichts — niemand merkt es, und der neue Bereich laedt dauerhaft erst beim
 * Klick. Dieser Test macht die Luecke sichtbar.
 */
const NAVIGIERBARE_PFADE = [
  ...PRIMARY_NAV_ITEMS.map((item) => item.to),
  ...BOTTOM_NAV_MORE_ITEMS.map((item) => item.to),
  ...STATISTICS_TABS.map((tab) => tab.to),
  ...SETTINGS_TABS.map((tab) => tab.to),
  "/eingaenge/neu",
  "/mehr",
];

describe("routeChunks", () => {
  it("kennt zu jedem Ziel der Navigation die nachzuladenden Teile", () => {
    // Die Uebersicht liegt im Startpaket und hat deshalb keinen eigenen Teil.
    for (const pfad of NAVIGIERBARE_PFADE.filter((pfad) => pfad !== "/")) {
      expect(chunksFor(pfad), pfad).not.toHaveLength(0);
    }
  });

  it("laedt bei verschachtelten Bereichen Huelle und ersten Reiter", () => {
    expect(chunksFor("/statistiken")).toEqual(["statistics", "statisticsOverview"]);
    expect(chunksFor("/einstellungen")).toEqual(["settings", "settingsGeneral"]);
  });

  it("bleibt bei unbekannten Pfaden ohne Wirkung", () => {
    expect(chunksFor("/gibt-es-nicht")).toHaveLength(0);
    expect(chunksFor("/eingaenge/42")).toHaveLength(0);
  });
});
