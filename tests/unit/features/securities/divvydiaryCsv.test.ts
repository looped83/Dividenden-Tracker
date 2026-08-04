import { describe, expect, it } from "vitest";
import {
  DivvyDiaryCsvError,
  parseDivvyDiaryCsv,
  parseExportDate,
} from "@/features/securities/divvydiaryCsv";

/**
 * Einlesen des DivvyDiary-Portfolio-Exports.
 *
 * Die Beispieldaten sind **erfunden** — Struktur und Schreibweisen entsprechen
 * einem echten Export, Stueckzahlen und Betraege nicht. Ein realer Depotbestand
 * gehoert nicht in ein Repository.
 *
 * Geprueft werden vor allem die vier Eigenheiten der Quelle, an denen ein
 * naiver Parser scheitert: die Waehrungsspalte, `"mixed"`, leere Zellen und der
 * Stichtag im Dateinamen.
 */

const HEADER =
  "symbol;isin;wkn;name;quantity;buyin;buyinTotal;price;value;gain;gainRel;currency;" +
  "allocation;allocationOnBuyin;dividendYield;dividendYieldOnBuyin;totalDividendRate;" +
  "dividendRate;dividendFrequency;dividendCagr;dividendCagrPeriod;sector;securityType;" +
  "country;originalDividendCurrency;transactions;exDate;payDate;gainPrev;gainPrevRel;" +
  "prevPricePeriod;note;taxRate";

/** Aktie mit Bestand, alle Felder gefuellt. */
const EQUITY =
  "ABT;US0028241000;850103;Abbott Laboratories;10,5;80,25;842,625;92,92;975,66;133,035;" +
  "0,157882;EUR;0,5;0,45;0,018647;0,020913;18,19;1,7327;quarterly;0,0854;5Y;Health Care;" +
  "EQUITY;US;USD;8;2026-07-15;2026-08-17;1,14;0,012421;1D;;0,26375";

/** ETF: `country` und `sector` stehen auf „mixed". */
const ETF =
  "ISPA;DE000A0F5UH1;A0F5UH;iShares STOXX Global Select Dividend 100 UCITS ETF (DE);20;" +
  "26,69;533,8;40,095;801,9;268,1;0,502106;EUR;0,5;0,55;0,029164;0,043807;23,39;1,1693;" +
  "quarterly;0,0717;5Y;mixed;ETF;mixed;EUR;24;2026-07-15;2026-07-15;0,165;0,004132;1D;;0,26375";

/** Beobachtungswert: kein Bestand, `gain`/`gainRel` sind **leer**. */
const WATCHLIST =
  "MMM;US88579Y1010;851745;3M Co;0;0;0;153,75;0;;;EUR;0;;0,013783;0;0;2,1192;quarterly;" +
  "-0,1254;5Y;Industrials;EQUITY;US;USD;62;2026-05-22;2026-06-12;0,8;0,00523;1D;;0,26375";

function csv(...rows: string[]): ArrayBuffer {
  const text = [HEADER, ...rows].join("\n");
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe("parseDivvyDiaryCsv", () => {
  it("liest eine Position vollständig und normalisiert die Zahlen", () => {
    const result = parseDivvyDiaryCsv(csv(EQUITY));

    expect(result.positions).toHaveLength(1);
    const [position] = result.positions;
    expect(position).toMatchObject({
      sourceRow: 2,
      name: "Abbott Laboratories",
      ticker: "ABT",
      isin: "US0028241000",
      wkn: "850103",
      country: "US",
      sector: "Health Care",
      quantity: "10.5",
      buyinTotal: "842.625",
      marketValue: "975.66",
      annualDividendTotal: "18.19",
      dividendFrequency: "quarterly",
      assetType: "equity",
      nextExDate: "2026-07-15",
      nextPayDate: "2026-08-17",
    });
  });

  it("nimmt die Ausschüttungswährung, nicht die Depotwährung der Zeile", () => {
    // Die Spalte `currency` steht im Export durchgehend auf der Depotwaehrung
    // (EUR). Wer sie als Waehrung des Papiers uebernimmt, schreibt bei jeder
    // Zeile EUR und macht den Bestand aermer statt reicher.
    const [position] = parseDivvyDiaryCsv(csv(EQUITY)).positions;
    expect(position.dividendCurrency).toBe("USD");
    expect(position.currency).toBe("EUR");
  });

  it('verwirft „mixed" bei Land und Branche, statt es zu übernehmen', () => {
    // `securities.country` ist char(2) — „mixed" wiese die Datenbank ab. Als
    // Branche stuende es kuenftig als groesster Sektor in der Statistik.
    const [position] = parseDivvyDiaryCsv(csv(ETF)).positions;
    expect(position.country).toBeNull();
    expect(position.sector).toBeNull();
    expect(position.isin).toBe("DE000A0F5UH1");
  });

  it("überspringt Zeilen ohne Bestand, ohne sie als Fehler zu werten", () => {
    const result = parseDivvyDiaryCsv(csv(EQUITY, WATCHLIST, ETF));

    expect(result.positions.map((position) => position.isin)).toEqual([
      "US0028241000",
      "DE000A0F5UH1",
    ]);
    expect(result.withoutHolding).toBe(1);
    expect(result.invalid).toEqual([]);
    // Die Bilanz muss aufgehen (IMPORT_SPEC.md §8).
    expect(result.totalRows).toBe(
      result.positions.length + result.withoutHolding + result.invalid.length,
    );
  });

  it('liest eine leere Zelle als „keine Angabe", nicht als 0', () => {
    // `gain` ist bei Zeilen ohne Bestand leer. Eine 0 stuende dort als Aussage,
    // wo die Quelle bewusst schweigt.
    const withoutGain = EQUITY.replace(";133,035;0,157882;", ";;;");
    const [position] = parseDivvyDiaryCsv(csv(withoutGain)).positions;
    expect(position.gainAbsolute).toBeNull();
    expect(position.gainRelative).toBeNull();
    expect(position.marketValue).toBe("975.66");
  });

  it("erkennt negative Werte (Kursverlust, gekürzte Dividende)", () => {
    const losing = EQUITY.replace(";133,035;0,157882;", ";-133,035;-0,157882;").replace(
      ";0,0854;5Y;",
      ";-0,1254;5Y;",
    );
    const [position] = parseDivvyDiaryCsv(csv(losing)).positions;
    expect(position.gainAbsolute).toBe("-133.035");
    expect(position.gainRelative).toBe("-0.157882");
    expect(position.dividendCagr).toBe("-0.1254");
  });

  it("meldet eine Zeile mit ungültiger ISIN, statt sie stillschweigend zu verlieren", () => {
    const broken = EQUITY.replace("US0028241000", "NICHTEINEISIN");
    const result = parseDivvyDiaryCsv(csv(broken));
    expect(result.positions).toEqual([]);
    expect(result.invalid).toEqual([
      { sourceRow: 2, reason: 'Abbott Laboratories: ISIN „NICHTEINEISIN" ist ungültig' },
    ]);
  });

  it("weist eine fremde Datei mit klarer Meldung ab", () => {
    const foreign = new TextEncoder().encode("datum;betrag\n2026-01-01;12,50");
    expect(() =>
      parseDivvyDiaryCsv(
        foreign.buffer.slice(foreign.byteOffset, foreign.byteOffset + foreign.byteLength),
      ),
    ).toThrow(DivvyDiaryCsvError);
  });

  it("kommt mit BOM und CRLF zurecht", () => {
    // BOM als Escape statt als Zeichen: unsichtbar im Quelltext waere es eine
    // Falle fuer jeden, der die Zeile spaeter anfasst.
    const text = `\uFEFF${HEADER}\r\n${EQUITY}\r\n`;
    const bytes = new TextEncoder().encode(text);
    const result = parseDivvyDiaryCsv(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].name).toBe("Abbott Laboratories");
  });

  it('übernimmt unbekannte Rhythmen als „unregelmäßig", statt sie zu verschweigen', () => {
    const odd = EQUITY.replace(";quarterly;", ";whenever;");
    const [position] = parseDivvyDiaryCsv(csv(odd)).positions;
    expect(position.dividendFrequency).toBe("irregular");
  });
});

describe("parseExportDate", () => {
  it("liest den Exportzeitpunkt aus dem Dateinamen", () => {
    // 1785790381565 ms = 3. August 2026, 22:53 Uhr deutscher Zeit.
    expect(
      parseExportDate(
        "divvydiaryportfolio1785790381565.csv",
        new Date("2026-08-04T12:00:00Z"),
      ),
    ).toBe("2026-08-03");
  });

  it("liefert nichts für einen umbenannten Dateinamen", () => {
    // Lieber nachfragen als ein Datum erfinden.
    expect(parseExportDate("depot.csv")).toBeNull();
  });

  it("verwirft einen Zeitstempel aus der Zukunft", () => {
    expect(
      parseExportDate(
        "divvydiaryportfolio1785790381565.csv",
        new Date("2020-01-01T00:00:00Z"),
      ),
    ).toBeNull();
  });
});
