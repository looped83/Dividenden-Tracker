/**
 * Der vollstaendige Katalog der Endpunkte, die die Discovery anfragen darf
 * (docs/divvydiary-api-discovery.md §4).
 *
 * Dies ist eine **Allowlist**, keine Suchliste: Jeder Eintrag steht hier, weil
 * er in einer nachpruefbaren Quelle belegt ist — nicht, weil er plausibel
 * klingt. Es wird nichts geraten, nichts durchprobiert und keine Wortliste
 * abgearbeitet. Wer einen Endpunkt ergaenzt, traegt seinen Beleg in `evidence`
 * ein; ohne Beleg gehoert er nicht hierher.
 *
 * Die Belege stammen aus dem offenen Quelltext von Portfolio Performance
 * (`name.abuchen.portfolio.online.impl.DivvyDiary*`), der DivvyDiary seit
 * Jahren produktiv anspricht, sowie aus der eigenen Kalenderintegration
 * (docs/CALENDAR_INTEGRATION.md).
 */

/** Basisadresse aller bekannten Endpunkte. Nur HTTPS, nur dieser Host. */
export const API_ORIGIN = "https://api.divvydiary.com";

/** Wie gut ein Endpunkt belegt ist — bestimmt, wie das Ergebnis zu lesen ist. */
export type EvidenceLevel =
  /** In fremdem, offenem Produktivcode nachgelesen (Pfad, Methode, Header). */
  | "third_party_source"
  /** In dieser Anwendung selbst im Einsatz. */
  | "own_integration"
  /** Von der Quelle selbst dokumentiert. */
  | "vendor_documented";

export interface DiscoveryEndpoint {
  /** Kurzname; erscheint im Bericht und in der Endpunktmatrix. */
  readonly id: string;
  /** Pfad relativ zu {@link API_ORIGIN}; `{isin}` wird ersetzt. */
  readonly path: string;
  /** Wofuer der Endpunkt in einer spaeteren Depot-Integration gebraucht wuerde. */
  readonly purpose: string;
  readonly evidence: EvidenceLevel;
  /** Woher der Beleg stammt — nachpruefbar, nicht "gefuehlt". */
  readonly source: string;
  /** Braucht der Aufruf eine ISIN? Dann wird er ohne `--isin` uebersprungen. */
  readonly needsIsin?: boolean;
}

export const ENDPOINTS: readonly DiscoveryEndpoint[] = [
  {
    id: "session",
    path: "/session",
    purpose: "Belegt die Authentifizierung und liefert die Liste der Depots (id, name).",
    evidence: "third_party_source",
    source: "Portfolio Performance, DivvyDiaryUploader.getPortfolios()",
  },
  {
    id: "documentation",
    path: "/documentation/",
    purpose:
      "Swagger-/OpenAPI-Beschreibung der API. Beantwortet die offene Kernfrage, " +
      "ob ein lesender Endpunkt fuer Depotpositionen existiert.",
    evidence: "vendor_documented",
    source:
      "Portfolio Performance, Javadoc in DivvyDiarySearchProvider: " +
      "„The DivvyDiary REST API is described using Swagger at " +
      "https://api.divvydiary.com/documentation/“",
  },
  {
    id: "symbol",
    path: "/symbols/{isin}",
    purpose:
      "Wertpapierstammdaten und Dividendenhistorie zu einer ISIN. " +
      "Traegt eine Integration auch ohne Positionsendpunkt.",
    evidence: "third_party_source",
    source:
      "Portfolio Performance, DivvyDiaryDividendFeed.getDividendPayments() " +
      "und DivvyDiarySearchProvider.addSymbolSearchResults()",
    needsIsin: true,
  },
];

/**
 * Endpunkte, die eine spaetere Depot-Integration braeuchte, fuer die es aber
 * **keinen** Beleg gibt. Sie werden bewusst **nicht** angefragt — das waere
 * genau das Erraten von Pfaden, das der Auftrag untersagt. Sie stehen hier,
 * damit der Bericht die Luecke benennt, statt sie zu verschweigen.
 */
export const UNVERIFIED_NEEDS: readonly { need: string; note: string }[] = [
  {
    need: "Depotpositionen (Stueckzahl, Einstand, Marktwert, Gewichtung)",
    note:
      "In keiner oeffentlichen Quelle beobachtet. Ob es einen lesenden " +
      "Endpunkt gibt, beantwortet allein /documentation/.",
  },
  {
    need: "Depotkennzahlen (Gesamtwert, erwartete Jahresdividende, Yield on Cost)",
    note: "Wie oben — unbelegt.",
  },
  {
    need: "Transaktionen (lesend)",
    note:
      "Nur die schreibende Richtung ist belegt " +
      "(POST /portfolios/{id}/import). Lesend: unbekannt.",
  },
];

/** Setzt Platzhalter ein und baut die vollstaendige Adresse. */
export function buildUrl(endpoint: DiscoveryEndpoint, isin?: string): string {
  const path = endpoint.needsIsin
    ? endpoint.path.replace("{isin}", encodeURIComponent(isin ?? ""))
    : endpoint.path;
  return `${API_ORIGIN}${path}`;
}

/** Die Endpunkte, die mit der vorliegenden Konfiguration anfragbar sind. */
export function selectEndpoints(isin: string | null): readonly DiscoveryEndpoint[] {
  return ENDPOINTS.filter((endpoint) => !endpoint.needsIsin || isin !== null);
}
