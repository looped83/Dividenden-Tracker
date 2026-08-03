# DivvyDiary — Lesender Depotzugriff: Discovery-Bericht (Phase B0)

**Stand:** 2026-08-03 · **Art:** Untersuchung, keine Implementierung ·
**Ergebnis:** **CONDITIONAL GO** (siehe §21)

Begleitende Dokumente:
[Zielarchitektur](./divvydiary-integration-architecture.md) ·
[Datenabbildung](./divvydiary-data-mapping.md) ·
[Sicherheitsbewertung](./divvydiary-security-assessment.md) ·
Werkzeug: [`scripts/divvydiary-discovery/`](../scripts/divvydiary-discovery/README.md)

---

## 1. Executive Summary

Untersucht wurde, ob sich der Depotbestand lesend aus DivvyDiary abrufen und
später in einen eigenen Bereich der PWA integrieren lässt. Die Anwendung wurde
dabei **nicht verändert**; es wurde kein einziger schreibender Aufruf gesendet.

Vier Ergebnisse, in der Reihenfolge ihrer Tragweite:

1. **Es gibt eine echte, mit einem API-Schlüssel nutzbare REST-API.** Host
   `api.divvydiary.com`, Authentifizierung über die Kopfzeile `X-API-Key`. Zwei
   lesende Endpunkte sind belegt: `GET /session` (Liste der Depots mit stabiler
   numerischer `id`) und `GET /symbols/{ISIN}` (Wertpapierstammdaten und
   Dividendenhistorie). DivvyDiary verweist selbst auf eine Swagger-Beschreibung
   unter `https://api.divvydiary.com/documentation/`.
2. **Für den Depot*bestand* — Stückzahlen, Einstand, Marktwert — gibt es
   keinen Beleg.** Kein öffentlich einsehbarer Client liest Positionen aus
   DivvyDiary heraus. Die einzige belegte Richtung für Bestandsdaten ist die
   **schreibende**: `POST /portfolios/{id}/import`. Genau die Vermutung des
   Auftrags (§5) trifft damit zu — der Schlüssel ist nachweislich für den Import
   **zu** DivvyDiary gedacht; ob er auch heraus liest, ist offen.
3. **Derselbe Schlüssel schreibt.** Ein Schlüssel, der `GET /session` erlaubt,
   erlaubt auch `POST /portfolios/{id}/import`. Eine Trennung in Lese- und
   Schreibrechte ist nicht bekannt. Das ist kein Hinderungsgrund, aber es
   verschiebt die Anforderungen an die Aufbewahrung erheblich
   ([Sicherheitsbewertung](./divvydiary-security-assessment.md)).
4. **Live verifizieren ließ sich nichts.** In dieser Arbeitsumgebung ist
   `api.divvydiary.com` durch die Netzwerkrichtlinie gesperrt (HTTP 403 vom
   Egress-Proxy), und es liegt kein API-Schlüssel vor. Alle Angaben unten sind
   deshalb **quellenbelegt, nicht selbst gemessen**. Der Unterschied ist in §4
   und §6 durchgehend gekennzeichnet.

Damit die entscheidende offene Frage in wenigen Minuten beantwortbar ist, liegt
ein sicheres, ausschließlich lesendes Prüfwerkzeug bei
(`scripts/divvydiary-discovery/`, §22).

**Kurzfassung der Empfehlung:** Kein Nein, aber auch kein Ja. Die Integration
ist erst zu bauen, wenn die drei Bedingungen aus §21 erfüllt sind — vor allem
der Nachweis eines lesenden Positionsendpunkts. Bleibt der aus, ist die
belastbare Alternative nicht „irgendwie doch", sondern Option C aus §20: der
Bestand bleibt in Supabase, DivvyDiary liefert nur Wertpapier- und
Dividendenstammdaten.

---

## 2. Aktueller Stand der bestehenden App

| Bereich | Befund |
|---|---|
| Build/Framework | Vite 8, React 19, TypeScript 5.9 (strikt), Tailwind 4, PWA mit eigenem Service Worker (`public/sw.js`) |
| Routing | `createHashRouter` (React Router 8) wegen GitHub Pages (DECISIONS.md D-030); Navigation zentral in `src/app/navigation.ts` |
| Daten | Supabase (PostgreSQL 17), `@supabase/supabase-js` 2.111, TanStack Query 5 als Cache-Schicht |
| Auth | Supabase Auth; `RequireAuth` + `SessionProvider` |
| Geld/Zahlen | ausschließlich `decimal.js` über `src/lib/money`; `parseFloat`/`Number(x)` sind per ESLint verboten (CALCULATION_RULES.md §8) |
| Validierung | Zod 4 in `features/*/schemas.ts` |
| Migrationen | 28 Stück unter `supabase/migrations/`, fortlaufend nummeriert |
| Edge Functions | genau eine: `sync-divvydiary-calendar` |
| Tests | 789 Unit-Tests (Vitest), Integrationstests gegen echtes PostgreSQL (RLS/Grants), Playwright-E2E inkl. axe und 320-px-Prüfung |
| Dokumentation | umfangreich und gepflegt (ARCHITECTURE, DATA_MODEL, SECURITY_MODEL, CALCULATION_RULES, PRODUCT_SPEC …) |

### Datenmodell, soweit für eine Depotintegration relevant

| Tabelle | Rolle | Für die Integration wichtige Spalten |
|---|---|---|
| `securities` | Unternehmen/Wertpapier | `isin char(12)`, `wkn char(6)`, `ticker`, `currency`, `country`, `sector`, `name` |
| `depots` | **Broker-Konto des Nutzers** (selbst gepflegt) | `name` (eindeutig je Nutzer), `broker`, `base_currency`, `portfolio_id` |
| `portfolios` | optionale Gruppierung von Depots | `name` |
| `dividend_payments` | tatsächlich erhaltene Zahlungen | Brutto/Netto/Steuern/Gebühren, Währung, Zahltag |
| `security_aliases` | bestätigte Namenszuordnungen aus dem Import | `alias_normalized`, `security_id` |
| `dividend_calendar_events` | angekündigte Termine aus dem iCal-Feed | `external_uid`, `event_date`, `company_name`, `expected_amount`, `source_portfolio` |
| `calendar_sync_status` | Zustand des letzten Kalenderlaufs | Status, Zeitpunkte, bereinigte Fehlermeldung |

Durchgehende Muster, an die sich eine Integration halten muss:

- **RLS auf jeder Tabelle**, `using (user_id = auth.uid())`; `revoke all from anon, authenticated`, dann gezielte Grants.
- **Kein DELETE-Grant** — gelöscht wird nie, es wird archiviert (`archived_at`) bzw. auf einen Zustand gesetzt (`removed_from_source`).
- **`enforce_user_id`-Trigger** setzt/prüft `user_id` serverseitig; ein Client kann keine fremde Kennung unterschieben.
- **`audit_row_change`-Trigger** auf allen fachlichen Tabellen.
- Migrationen fortlaufend nummeriert, keine nachträgliche Änderung bestehender Dateien (DATA_MODEL.md §6).

### Vorhandene Kennungen und Verknüpfungsmöglichkeiten

`securities.isin` ist die stärkste vorhandene Kennung: eindeutig je Nutzer
(partieller Index über nicht archivierte Zeilen). `wkn` und `ticker` sind
vorhanden, aber **nicht** eindeutig indiziert. Eine Spalte für externe Kennungen
(DivvyDiary-Wertpapier-ID) existiert bisher nicht — sie käme neu hinzu.

### Konflikt mit dem bestehenden Begriff „Depot"

**Der Auftrag verlangt einen Menüpunkt „Depot" — dieser Name ist in der
Anwendung bereits vergeben**, und zwar dreifach:

1. `depots` ist eine Tabelle: das selbst gepflegte Broker-Konto, dem jede
   Dividendenzahlung zugeordnet ist.
2. `/#/einstellungen/depots` verwaltet genau diese Depots.
3. `/#/statistiken/depots` wertet die Zahlungen je Depot aus.

Ein vierter Ort namens „Depot" mit einer anderen Bedeutung (der aus DivvyDiary
gespiegelte Wertpapierbestand) wäre für den Nutzer nicht auseinanderzuhalten und
für jeden späteren Beitrag eine Fehlerquelle. **Empfehlung: Der Bereich heißt
„Bestand".** Er beantwortet die Frage „Was liegt im Depot?", während die
bestehenden Depots die Frage „Wo wurde gebucht?" beantworten. Die Entscheidung
liegt beim Auftraggeber; die Architektur funktioniert mit beiden Namen. In den
Folgedokumenten wird „Bestand" verwendet und der Konflikt jeweils erwähnt.

---

## 3. Bestehende Kalender-Integration

Sie ist vollständig umgesetzt, dokumentiert (`docs/CALENDAR_INTEGRATION.md`) und
**nicht Teil dieses Auftrags**. Für die Depotfrage zählt sie in dreifacher
Hinsicht:

**Als Vorbild.** Der Aufbau — Secret nur serverseitig, Edge Function mit
`verify_jwt = true`, laufzeitunabhängige Fachlogik in `supabase/functions/_shared`,
Schreiben ausschließlich mit `service_role` und explizitem `user_id`-Filter,
Lesen im Client nur über RLS — ist genau das, was eine Depotintegration
bräuchte. Sie ist wiederverwendbar, aber **nicht** wörtlich: `_shared/feed.ts`
holt iCal-Text, nicht JSON; `_shared/sync.ts` gleicht Kalendertermine ab, nicht
Positionen. Wiederverwendbar sind das Muster und drei kleine Bausteine
(`messages.ts`, `datetime.ts`, die Claim-Funktion als Vorlage) — nicht der
Abgleich selbst.

**Als zweite, getrennte Zugangsart.** Der Kalender nutzt einen **Token in der
URL** (`…/dividends/upcoming/ical?dates=pay&token=…`), gehalten im Supabase-Secret
`DIVVYDIARY_ICAL_URL`. Das ist ein **anderes Geheimnis** als der `X-API-Key`. Die
beiden Integrationen können und sollen technisch getrennt bleiben: eigenes
Secret, eigene Edge Function, eigene Tabellen, eigener Statusdatensatz.

**Als Grenze.** Der Feed ist bereits die Quelle für kommende Termine. Eine
Depotintegration darf dafür **keine zweite Logik** aufbauen (Auftrag §9). Der
Bestand liefert Positionen, der Kalender liefert Termine; die Bestandsansicht
verlinkt den nächsten Termin aus `dividend_calendar_events`, statt ihn erneut zu
beschaffen.

**Möglicher Konflikt, den es zu kennen gilt:** Der Feed nennt im SUMMARY-Ende
ein Depot in Klammern („… Zahltag (Trade Republic)"), gespeichert als
`source_portfolio` — ein **freier Text**, keine Kennung. Er lässt sich nicht
verlässlich mit einer DivvyDiary-Depot-`id` gleichsetzen. Wer beide später
verbinden will, braucht eine bestätigte Zuordnung, keine Namensgleichheit.

---

## 4. Gefundene DivvyDiary-Schnittstellen

### 4.1 Im eigenen Repository

Gesucht wurde nach `divvydiary`, `ical`, `ics`, `token`, `apiKey`, `X-API-Key`,
Umgebungsvariablen, Secrets, Edge Functions, Proxy-Endpunkten und
CORS-Konfiguration — im Arbeitsbaum **und in der gesamten Git-Historie**.

| Fund | Ort | Bewertung |
|---|---|---|
| Edge Function `sync-divvydiary-calendar` | `supabase/functions/` | in Betrieb, sauber getrennt |
| Secret `DIVVYDIARY_ICAL_URL` | Supabase-Secret; Platzhalter in `.env.example` | korrekt: kein `VITE_`-Präfix, nicht im Repository |
| CORS `access-control-allow-origin: *` | `sync-divvydiary-calendar/index.ts` | vertretbar, weil `verify_jwt = true` davor greift; Details in der Sicherheitsbewertung |
| Feed-Adressform | `docs/CALENDAR_INTEGRATION.md` Zeile 68 | **Platzhalter** (`token=…`), kein echter Token |

**Keine Zugangsdaten im Repository, auch nicht in der Historie.** Die
`.gitignore` deckt `.env`, `.env.*`, `supabase/functions/**/.env` und
`supabase/.env` ab. Es besteht **kein Anlass zu einer Rotation** — die Empfehlung
aus Auftrag §2 greift mangels Fund nicht.

Eine wiederverwendbare serverseitige Integrationsstruktur existiert (siehe §3);
Kalender- und Bestandsintegration lassen sich sauber trennen.

### 4.2 Außerhalb: die REST-API

| Endpunkt | Methode | Auth | Belegt durch |
|---|---|---|---|
| `/session` | GET | `X-API-Key` | Portfolio Performance, `DivvyDiaryUploader.getPortfolios()` |
| `/symbols/{ISIN}` | GET | `X-API-Key` | Portfolio Performance, `DivvyDiaryDividendFeed` und `DivvyDiarySearchProvider` |
| `/portfolios/{id}/import?splitAdjusted=true` | **POST** | `X-API-Key` | Portfolio Performance, `DivvyDiaryUploader.upload()` |
| `/dividends/upcoming/ical?dates=pay&token=…` | GET | Token in der URL | eigene Integration, in Betrieb |
| `/documentation/` | GET | unbekannt | Javadoc in `DivvyDiarySearchProvider`: „The DivvyDiary REST API is described using Swagger at https://api.divvydiary.com/documentation/" |

Portfolio Performance ist quelloffen, wird von DivvyDiary selbst als
Integrationsweg beworben, und die genannten Klassen stehen im aktuellen
`master`-Stand. Das ist ein belastbarer Beleg für **Pfad, Methode und
Kopfzeile** — es ist **kein** Beleg für Stabilitätszusagen, Nutzungsbedingungen
oder Antwortschemata über die dort ausgelesenen Felder hinaus.

### 4.3 Was ausdrücklich nicht getan wurde

Keine automatisierte Endpunkt-Erkennung, keine Wortlisten, keine Brute Force,
keine Untersuchung der internen Web-API von `divvydiary.com` über eine
Browser-Session, kein einziger schreibender Aufruf. Endpunkte, die eine
Integration bräuchte, für die es aber keinen Beleg gibt, sind in
`scripts/divvydiary-discovery/endpoints.ts` als `UNVERIFIED_NEEDS` benannt und
werden bewusst **nicht** angefragt.

---

## 5. Offiziell dokumentierte Möglichkeiten

Die vom Auftrag (§3) verlangte Trennung, ohne Beschönigung:

| Stufe | Befund |
|---|---|
| **1. Offiziell dokumentiert** | Eine Swagger-/OpenAPI-Beschreibung unter `https://api.divvydiary.com/documentation/` **existiert nach fremder Angabe**. Ihr Inhalt konnte hier nicht gelesen werden. Solange das nicht geschehen ist, gilt: *kein* Endpunkt ist als offiziell dokumentiert nachgewiesen. |
| **2. Offiziell erwähnt, nicht dokumentiert** | Der API-Schlüssel wird in den DivvyDiary-Einstellungen erzeugt und ist ausdrücklich für die Portfolio-Performance-Integration vorgesehen (Übertragung des Depots **zu** DivvyDiary). Das belegt die Existenz und den vorgesehenen Zweck des Schlüssels — nicht einen lesenden Bestandszugriff. |
| **3. Technisch beobachtbare interne Web-Endpunkte** | **Nicht untersucht.** Eine cookie-basierte Browser-Session ist für eine serverseitige Integration ungeeignet (§7) und ihre Nutzung wäre rechtlich wie technisch fragwürdig. |
| **4. Bloße Vermutungen** | Dass es zu `POST /portfolios/{id}/import` ein lesendes Gegenstück gäbe (etwa `GET /portfolios/{id}`), ist **naheliegend, aber unbelegt**. Es wird in diesem Bericht nirgends als gegeben behandelt. |
| **5. Nicht verifizierbar** | Rate Limits, Pagination, Versionierung, Fehlerformat, Nutzungsbedingungen für Drittanwendungen, Zusagen zur Schemastabilität. |

Eine interne Web-API wird hier ausdrücklich **nicht** als offiziell unterstützte
externe API bewertet.

---

## 6. Verifizierte lesende Endpunkte

**Vorbemerkung zur Beweislage.** „Verifiziert" heißt in diesem Bericht: in
fremdem, offenem Produktivcode nachgelesen. Es heißt **nicht**: hier mit einem
Schlüssel aufgerufen. In dieser Arbeitsumgebung verweigert der Egress-Proxy die
Verbindung zu `api.divvydiary.com` und `divvydiary.com` (403 auf CONNECT), und
es liegt kein Schlüssel vor. Beides ist reproduzierbar und in §12 vermerkt.

### Endpunktmatrix

| Ressource | Endpunkt | Methode | Auth | Status | Offiziell dokumentiert | Produktiv geeignet |
|---|---|---|---|---|---|---|
| Depotliste | `GET /session` | GET | `X-API-Key` | quellenbelegt, nicht live geprüft | unbekannt (Swagger ungelesen) | **gelb** |
| Wertpapierstammdaten | `GET /symbols/{ISIN}` | GET | `X-API-Key` | quellenbelegt, nicht live geprüft | unbekannt | **gelb** |
| Dividendenhistorie | Teil von `/symbols/{ISIN}` | GET | `X-API-Key` | quellenbelegt | unbekannt | **gelb** |
| Kommende Termine | `GET /dividends/upcoming/ical` | GET | Token in URL | **in Betrieb** | nein | **grün** (bereits umgesetzt) |
| API-Beschreibung | `GET /documentation/` | GET | unbekannt | Existenz fremdbelegt | — | — |
| **Depotpositionen** | **unbekannt** | — | — | **kein Beleg** | nein | **unbekannt** |
| **Depotkennzahlen** | **unbekannt** | — | — | **kein Beleg** | nein | **unbekannt** |
| **Transaktionen (lesend)** | **unbekannt** | — | — | **kein Beleg** | nein | **unbekannt** |
| Depot-Import (schreibend) | `POST /portfolios/{id}/import` | POST | `X-API-Key` | quellenbelegt | unbekannt | **nicht Gegenstand** |

### Details, soweit belegt

**`GET https://api.divvydiary.com/session`**

- Kopfzeilen: `X-API-Key: <Schlüssel>`, `User-Agent` (von Portfolio Performance gesetzt).
- Keine Pfad- oder Query-Parameter.
- Antwort: JSON-Objekt mit einem Feld `portfolios`, einer Liste aus
  `{ id: number, name: string }`. Weitere Felder sind wahrscheinlich vorhanden
  (der Name „session" legt Profildaten nahe), werden von Portfolio Performance
  aber nicht ausgelesen und sind daher unbekannt.
- Bedeutung: **Dies ist der einzige belegte Beweis, dass der API-Schlüssel
  überhaupt lesen darf** — und zugleich der Beleg für eine stabile, numerische
  Depotkennung.
- Content-Type, Statuscodes, Rate-Limit-, Cache-, ETag-/Last-Modified-Kopfzeilen,
  Antwortgröße, Fehlerformat: **unbekannt** (das Prüfwerkzeug erfasst sie alle).

**`GET https://api.divvydiary.com/symbols/{ISIN}`**

- Kopfzeile: `X-API-Key`. Pfadparameter: ISIN, 12 Zeichen. Der Aufruf ist ohne
  gültige ISIN sinnlos; Portfolio Performance ruft ihn nur bei genau 12 Zeichen.
- Belegte Antwortfelder: `symbol`, `name`, `wkn`, `isin`, `exchange` (4-stelliger
  ISO-MIC), `currency`, `dividendCurrency`, `dividendFrequency` sowie
  `dividends[]` mit `exDate`, `payDate`, `amount` (Zahl), `currency`.
- Bekanntes Problem: In Portfolio Performance ist ein Fehler dokumentiert,
  wonach Dividendenbeträge aus DivvyDiary Nachkommastellen verlieren können
  (Issue #4112). Das ist ein Hinweis auf das Zusammenspiel von JSON-Zahl und
  Zielformat — für dieses Projekt bedeutet es: **Beträge als Zeichenkette
  weiterreichen und mit `decimal.js` verarbeiten**, nie als Fließkommazahl
  (CALCULATION_RULES.md §8).
- Ohne gültigen Schlüssel antwortet die API mit `401` (aus dem Kommentar in
  `DivvyDiarySearchProvider` ableitbar).

**Nicht belegt:** jede Form von Pagination, Versionierung im Pfad (die Pfade
tragen kein `/v1/`), ETag/Last-Modified, ein einheitliches Fehlerformat.

---

## 7. Authentifizierung

| Frage | Antwort | Belegstärke |
|---|---|---|
| Verfahren | API-Schlüssel in der Kopfzeile `X-API-Key` | belegt |
| Alternative Übergabe | keine bekannt (kein Bearer, kein Query-Parameter) | belegt für die genannten Endpunkte |
| Zweites, getrenntes Verfahren | Token in der URL — ausschließlich für den iCal-Feed | eigene Integration |
| Tokenformat | unbekannt (Portfolio Performance behandelt ihn als undurchsichtige Zeichenkette) | — |
| Gültigkeitsdauer | unbekannt; kein Ablauf beobachtet | — |
| Erneuerung/Rotation | über die DivvyDiary-Einstellungen; kein API-gestützter Weg bekannt | — |
| Trennung Lesen/Schreiben | **keine bekannt** — derselbe Schlüssel bedient `GET /session` und `POST /portfolios/{id}/import` | belegt |
| Verhalten ohne/mit falschem Schlüssel | `401` | abgeleitet aus dem Quelltext |
| OAuth, Scopes, Ablaufdatum, Widerruf einzelner Rechte | nicht bekannt | — |

**Serverseitige Nutzbarkeit: ja.** Ein statischer Schlüssel in einer Kopfzeile
ist genau das, was eine Supabase Edge Function braucht — kein Browserkontext,
keine Cookies, keine Anmeldeschleife. Das ist der klare Vorteil gegenüber einer
cookie-basierten internen Web-API, die für eine produktive Integration
**ungeeignet** wäre (kurzlebig, an einen Browser gebunden, jederzeit änderbar).

**Die kritische Bewertung, die der Auftrag verlangt (§5):** Der Schlüssel ist
nachweislich für den **Import zu DivvyDiary** vorgesehen — so bewirbt DivvyDiary
ihn, und so nutzt Portfolio Performance ihn hauptsächlich. Er ermöglicht
zusätzlich mindestens zwei lesende Aufrufe (`/session`, `/symbols/{ISIN}`). Ob
er auch den **Bestand** liest, ist damit **nicht** beantwortet. Die Formulierung
„der Schlüssel erlaubt lesenden Depotzugriff" wäre nach heutigem Stand zu
optimistisch: Er erlaubt lesenden Zugriff auf die **Depotliste**, nicht
nachweislich auf den **Depotinhalt**.

**Risiko der Aufbewahrung:** Ein Schlüssel mit Schreibrecht, der abhandenkommt,
erlaubt Fremden, in das DivvyDiary-Depot des Nutzers zu schreiben. Er gehört
deshalb ausschließlich in ein Supabase-Secret und niemals in Frontend, Git, Logs
oder eine Fehlerantwort — siehe [Sicherheitsbewertung](./divvydiary-security-assessment.md).

---

## 8. Verfügbare Depotdaten

Belegt ist genau ein Feldpaar:

| Feld | Vorhanden | API-Feld | Datentyp | Hinweise |
|---|---|---|---|---|
| externe Depot-ID | **ja** | `portfolios[].id` | Ganzzahl (`long`) | stabile Kennung; Grundlage der Mehrdepotfähigkeit |
| Depotname | **ja** | `portfolios[].name` | Zeichenkette | frei vom Nutzer vergeben, änderbar — als Anzeige geeignet, als Schlüssel nicht |

Alles Weitere — Depotwährung, Gesamtwert, Einstandswert, Gewinn/Verlust absolut
und prozentual, erwartete Jahresdividende, durchschnittliche Dividendenrendite,
durchschnittlicher Yield on Cost, Anzahl Positionen, Berechnungs- und
Aktualisierungszeitpunkt — ist **unbekannt**. Die vollständige Feldmatrix mit
Bewertung steht in der [Datenabbildung](./divvydiary-data-mapping.md#1-feldmatrix-depot).

---

## 9. Verfügbare Positionsdaten

**Aus einem Positionsendpunkt: keine.** Ein solcher Endpunkt ist nicht belegt.

Belegt ist nur, welche Bestandsfelder DivvyDiary **entgegennimmt** (aus dem
Aufbau von `POST /portfolios/{id}/import`): je Wertpapier `isin`, `quantity`,
`buyin { price, currency }`, dazu optional Transaktionen mit `type` (`BUY`/`SELL`),
`datetime`, `quantity`, `amount`, `fees`, `taxes`, `currency`, `broker`,
`brokerReference`. Das zeigt, **welche Daten DivvyDiary über eine Position
besitzt** — es zeigt nicht, dass es sie herausgibt.

Wertpapierbezogene Daten sind dagegen belegt lesbar (`/symbols/{ISIN}`): Name,
ISIN, WKN, Ticker, Börse (MIC), Währung, Dividendenwährung,
Ausschüttungsfrequenz und die Dividendenhistorie mit Ex-Tag, Zahltag, Betrag und
Währung. Das ist wertvoll — es ist nur eben **Wertpapier**- und nicht
**Bestands**information.

Die Feldmatrix mit allen 30 im Auftrag genannten Positionsfeldern und ihrer
Bewertung steht in der
[Datenabbildung](./divvydiary-data-mapping.md#2-feldmatrix-position).

---

## 10. Fehlende Daten

Nach heutigem Beleg fehlen für einen vollwertigen Bestandsbereich:

- **Bestand:** Stückzahl, Einstandskurs, Einstandswert, aktueller Kurs,
  Kurszeitpunkt, Marktwert, Gewinn/Verlust, Depotgewicht.
- **Kennzahlen:** Dividendenrendite, Yield on Cost, erwartete Jahresdividende
  (je Position und je Depot).
- **Depotkopf:** Depotwährung, Gesamtwert, Einstandswert, Anzahl Positionen,
  Berechnungszeitpunkt.
- **Zuordnung:** externe Positions-ID, externe Wertpapier-ID, Zugehörigkeit
  einer Position zu einem Depot.
- **Klassifikation:** Sektor, Branche, Land, Region, Wertpapierart.
- **Zustand:** geschlossene Positionen, Bruchstücke, Positionen mit null Stück,
  Datenstatus (bestätigt/prognostiziert).

Teilweise über `/symbols/{ISIN}` erreichbar wären: Ausschüttungsfrequenz,
Dividendenwährung, Börse, sowie über die Historie die zuletzt gezahlten Beträge.
Aus ihnen ließe sich eine **erwartete** Jahresdividende **berechnen** — das wäre
dann aber eine eigene Rechnung dieser Anwendung und müsste als solche
gekennzeichnet sein, nicht als Angabe der Quelle (dieselbe Regel wie beim
Kalender: kein halb geratener Betrag neben echten Finanzdaten).

**Nicht erfunden wird nichts.** Kein fehlendes Feld wird aus ungeeigneten Daten
abgeleitet; wo die Quelle schweigt, bleibt die Oberfläche leer.

---

## 11. Identifikatoren und Matching

Ausführlich in der [Datenabbildung](./divvydiary-data-mapping.md#3-identifikatoren-und-zuordnung).
Kurzfassung:

| Kennung | Verfügbarkeit | Eignung |
|---|---|---|
| ISIN | belegt bei `/symbols`, Pflichtfeld im Import | **stark** — auch im eigenen Modell eindeutig indiziert |
| externe Depot-ID | belegt (`portfolios[].id`) | **stark** für Depots |
| externe Wertpapier-ID | unbekannt | offen |
| WKN | belegt bei `/symbols` | mittel — nur im deutschsprachigen Raum, nicht eindeutig indiziert |
| Ticker + Börse (MIC) | belegt bei `/symbols` | mittel — mehrdeutig über Börsen hinweg |
| Name | belegt | **untauglich als automatische Zuordnung** |

Empfohlene Reihenfolge: **1.** exakte ISIN · **2.** gespeicherte externe
DivvyDiary-ID · **3.** exakte WKN · **4.** Ticker + Börse · **5.** manuelle
Zuordnung. Eine automatische Zuordnung allein über den Namen wird **nicht**
empfohlen und ist im Konzept ausgeschlossen — dieselbe Linie, die
`src/lib/import/matchCompany.ts` bereits fährt (Ähnlichkeit erzeugt dort nur
einen Hinweis, nie eine Zuordnung).

---

## 12. Rate Limits und technische Einschränkungen

| Aspekt | Stand |
|---|---|
| Rate Limits | **unbekannt.** Keine Angabe in irgendeiner Quelle. Ein täglicher manueller Abruf je Nutzer ist mit Sicherheit unkritisch; alles Weitere ist zu ermitteln. |
| Pagination | unbekannt; bei `/session` und `/symbols` gibt es keinen Hinweis darauf |
| Versionierung | **keine im Pfad** (`/session`, nicht `/v1/session`). Das ist ein Risiko: Eine Änderung träfe alle Aufrufer gleichzeitig. |
| Fehlerformat | unbekannt außer `401` |
| Antwortgrößen | unbekannt; bei einem persönlichen Depot sicher klein |
| Zwischenspeicherung | unbekannt (ETag/Last-Modified nicht belegt). Portfolio Performance cached `/symbols`-Antworten selbst je ISIN — ein Hinweis, dass die Quelle es nicht tut. |
| Nutzungsbedingungen für Drittanwendungen | **nicht geprüft und nicht auffindbar.** Offene Frage an DivvyDiary. |

**Einschränkung dieser Untersuchung.** In dieser Arbeitsumgebung sind
`api.divvydiary.com`, `divvydiary.com`, das Portfolio-Performance-Forum und
`archive.org` durch die Netzwerkrichtlinie gesperrt; der Egress-Proxy beantwortet
CONNECT mit 403. Zudem liegt kein DivvyDiary-API-Schlüssel vor. **Es konnte
deshalb kein einziger Aufruf gegen die echte API ausgeführt werden.** Sämtliche
Statuszeilen dieses Berichts lauten folgerichtig „quellenbelegt, nicht live
geprüft". Das mitgelieferte Werkzeug schließt genau diese Lücke, sobald ein
Schlüssel und ein Netzzugang vorliegen (§22).

---

## 13. Datenschutz und Sicherheit

Vollständig in der [Sicherheitsbewertung](./divvydiary-security-assessment.md).
Die vier Punkte, die die Entscheidung berühren:

1. **Der Schlüssel kann schreiben.** Er ist damit sensibler als die Feed-URL des
   Kalenders und gehört ausschließlich in ein Supabase-Secret.
2. **Bestandsdaten sind sensibler als Termindaten.** Der Kalender-Cache verrät
   *dass* jemand Verizon hält; ein Bestands-Cache verrät *wie viel* und *zu
   welchem Kurs*. RLS, Least-Privilege-Grants und die Log-Disziplin des Projekts
   müssen daher unverändert streng angewendet werden.
3. **Kein Fremdnutzerrisiko durch Bauart** — sofern die Edge Function die
   Nutzerkennung wie die Kalenderfunktion ausschließlich aus dem geprüften JWT
   nimmt und jede Anweisung zusätzlich auf sie filtert.
4. **Ein Schlüssel je Anwendung, nicht je Nutzer.** Bei Mehrbenutzerbetrieb wäre
   ein anwendungsweiter Schlüssel falsch: Er zeigte auf ein einziges
   DivvyDiary-Konto. Für die aktuelle Einzelnutzung ist ein Secret vertretbar;
   die Struktur muss den späteren Wechsel auf nutzereigene Schlüssel offenhalten.

---

## 14. Stabilitätsbewertung

| Kriterium | Bewertung | Begründung |
|---|---|---|
| offiziell dokumentiert | **unbekannt** | Swagger-Seite existiert laut Fremdquelle, Inhalt ungelesen |
| Authentifizierung eindeutig | **grün** | `X-API-Key`, einfach, serverseitig nutzbar |
| externe Nutzung erlaubt | **unbekannt** | keine auffindbaren Nutzungsbedingungen für Drittanwendungen |
| lesender Depotzugriff möglich | **unbekannt** | Depot*liste* ja, Depot*inhalt* unbelegt |
| stabile IDs | **grün** (Depot), **unbekannt** (Position/Wertpapier) | `portfolios[].id` ist numerisch und stabil; ISIN als fachliche Kennung vorhanden |
| ausreichende Felder | **rot bis unbekannt** | für einen Bestandsbereich heute nicht nachgewiesen |
| vorhersehbares Fehlerformat | **unbekannt** | nur `401` bekannt |
| Pagination | **unbekannt** | kein Hinweis |
| Rate Limits bekannt | **rot** | nirgends dokumentiert |
| Versionierung | **rot** | keine Version im Pfad |
| Schema stabil | **gelb** | seit Jahren unverändert von Portfolio Performance genutzt — aber ohne Zusage; ein bekannter Nachkommastellen-Fehler zeigt, dass sich Details ändern |
| ohne Browser-Session nutzbar | **grün** | statischer Schlüssel |
| serverseitig nutzbar | **grün** | passt zur Edge Function |
| Datenschutz vertretbar | **gelb** | nur mit striktem Secret-Handling und RLS |
| langfristige Wartbarkeit | **gelb** | eine externe, undokumentierte Abhängigkeit ohne Version |
| Abhängigkeit von internen Endpunkten | **grün** | keine — es wird keine interne Web-API genutzt |
| Gefahr kurzfristiger Änderungen | **gelb** | ohne Versionierung und Änderungsmitteilung jederzeit möglich |

**Gesamtbild: gelb.** Die Authentifizierung ist solide und serverseitig
brauchbar; die Datenlage für den eigentlichen Zweck ist unbewiesen, die
Rahmenbedingungen (Doku, Limits, Version, Nutzungserlaubnis) sind offen.

---

## 15. Vorgeschlagene Zielarchitektur

Ausführlich in der
[Zielarchitektur](./divvydiary-integration-architecture.md#1-zielarchitektur).
Grundform:

```
DivvyDiary REST API
        ↓ nur GET, nur serverseitig, Secret aus Supabase Secrets
Supabase Edge Function  sync-divvydiary-portfolio
        ↓ Zod-Validierung → Normalisierung → Zuordnung
Supabase-Cache  external_portfolios · portfolio_positions · portfolio_syncs
        ↓ Row Level Security, nur Lesen
Bestandsansicht der PWA
```

Kernentscheidung: **Die PWA sieht das externe Antwortschema nie.** Sie liest
ausschließlich den internen Cache. Ändert DivvyDiary sein Schema, schlägt die
Synchronisation fehl — die Ansicht zeigt weiter den letzten erfolgreichen Stand.

---

## 16. Vorläufiges Datenmodell

Vier Tabellen, kritisch gekürzt gegenüber dem Vorschlag des Auftrags —
insbesondere werden **keine Felder vorgesehen, die die API nicht liefert**.
Vollständig mit Spalten, Nullbarkeit, Unique Constraints, Indizes und
RLS-Regeln in der
[Zielarchitektur](./divvydiary-integration-architecture.md#2-vorläufiges-datenmodell).
Es wird in dieser Phase **keine Migration angelegt**.

---

## 17. Synchronisierungsablauf

15 Schritte, Idempotenz über `(user_id, provider, external_portfolio_id,
external_position_id)`, Deaktivieren statt Löschen, und die harte Regel: **eine
leere oder fehlerhafte Antwort deaktiviert niemals den Bestand.** Vollständig in
der [Zielarchitektur](./divvydiary-integration-architecture.md#3-synchronisierungsablauf).

---

## 18. Konzept für den Bestands-Tab

Übersicht mit KPIs, Positionsliste, Detailansicht und ein eigener Bereich
„Zuordnung erforderlich" für Positionen ohne sichere Verknüpfung. Grundregel:
**Es wird nur angezeigt, was die Quelle liefert oder was transparent aus ihr
berechnet ist.** Vollständig in der
[Zielarchitektur](./divvydiary-integration-architecture.md#4-konzept-für-den-bestandsbereich)
— dort auch die Namensfrage aus §2.

---

## 19. Risiken und offene Fragen

### Risiken

| # | Risiko | Wirkung | Gegenmaßnahme |
|---|---|---|---|
| R1 | Es gibt gar keinen lesenden Positionsendpunkt | Der Bestandsbereich ist nicht baubar | **Gate 1** vor B1 (§21); sonst Option C |
| R2 | Der Schlüssel kann schreiben | Bei Verlust: fremder Schreibzugriff auf das DivvyDiary-Depot | nur Supabase-Secret, nie im Frontend, nie im Log; Rotation dokumentieren |
| R3 | Keine Versionierung, keine Änderungsmitteilung | Die Synchronisation bricht ohne Vorwarnung | Zod-Validierung, `stale-while-error`, Schemafehler als eigener Fehlercode |
| R4 | Nutzungsbedingungen für Drittzugriff unbekannt | Nutzung könnte unerwünscht sein | **Gate 2**: Rückfrage bei DivvyDiary vor B1 |
| R5 | Falsche Zuordnung zu einem Unternehmen | Verfälschte Auswertung | nur ISIN/ID/WKN automatisch; Namensähnlichkeit nie |
| R6 | Zwei Datenwahrheiten für dasselbe Wertpapier | Widersprüchliche Zahlen in der Oberfläche | strenges Hoheitsmodell (Datenabbildung §4), Quelle je Kennzahl sichtbar |
| R7 | Begriffskollision „Depot" | Fehlbedienung, Fehlentwicklung | Bereich „Bestand" nennen (§2) |
| R8 | Rundungs- und Fließkommafehler bei Beträgen | Falsche Geldbeträge | Beträge als Zeichenkette übernehmen, `decimal.js`, `numeric` in der Datenbank |
| R9 | Rate Limit unbekannt | Sperre bei zu häufigem Abruf | manueller Sync, höchstens ein automatischer Lauf je Tag, `429` respektieren |
| R10 | Bestandsdaten im Cache sind sensibler als Termindaten | Größerer Schaden bei einem Leck | RLS, kein DELETE-Grant, keine Finanzwerte im Log |

### Offene Fragen

**An DivvyDiary:**

1. Gibt es einen lesenden Endpunkt für die Positionen eines Depots? Wenn ja:
   Pfad, Felder, Stabilitätszusage.
2. Ist die Nutzung der API durch eine eigene, private Anwendung ausdrücklich
   erlaubt? Gibt es Nutzungsbedingungen?
3. Welche Rate Limits gelten?
4. Lässt sich ein Schlüssel auf Lesen beschränken?
5. Ist eine Versionierung geplant? Wie werden Schemaänderungen angekündigt?

**Technisch, durch das Prüfwerkzeug beantwortbar:**

6. Welche Felder liefert `/session` über `portfolios[].id/name` hinaus?
7. Ist `/documentation/` ohne Anmeldung erreichbar, und was steht darin?
8. Welche Kopfzeilen liefert die API (Rate Limit, ETag, Version)?

**Produktseitig, durch den Auftraggeber:**

9. Heißt der Bereich „Bestand" oder „Depot" (§2)?
10. Sollen DivvyDiary-Depots mit den bestehenden `depots` verknüpfbar sein, um
    Bestand und erhaltene Dividenden je Broker nebeneinander zu zeigen?

---

## 20. Entscheidungsmatrix

| | **A — Offizielle lesende API** | **B — Interne Web-API** | **C — Alternative Quelle** | **D — Keine Integration** |
|---|---|---|---|---|
| Beschreibung | `X-API-Key` gegen `api.divvydiary.com`, Positionen über einen noch nachzuweisenden Endpunkt | Nachbau der Aufrufe der Weboberfläche mit Browser-Session | Bestand in Supabase gepflegt (manuell oder per CSV/Excel-Import); DivvyDiary nur als Stammdatenquelle über `/symbols/{ISIN}` | Es bleibt beim Ist-Zustand: erhaltene Dividenden + Kalender |
| Technische Machbarkeit | **offen** — hängt allein an Gate 1 | technisch möglich | **hoch** — die Importpipeline (`src/lib/import/`) existiert bereits | trivial |
| Sicherheit | gut, sofern Secret serverseitig; Schreibrecht des Schlüssels bleibt | **schlecht** — Session-Cookies serverseitig zu halten ist nicht vertretbar | **sehr gut** — kein zusätzliches Geheimnis nötig (bzw. nur derselbe Schlüssel lesend) | unverändert |
| Rechtliche/vertragliche Sicherheit | **offen** (Gate 2) | **schlecht** — undokumentierte Endpunkte, keinerlei Erlaubnis | gut | gut |
| Stabilität | gelb — keine Version, keine Zusage | **rot** — kann sich mit jedem Frontend-Release ändern | grün — eigene Daten | grün |
| Wartungsaufwand | mittel: Edge Function, Schema-Validierung, Zuordnung, Tests | **hoch** — dauerndes Nachziehen | niedrig bis mittel | keiner |
| Funktionsumfang | am größten, **wenn** Gate 1 hält | wie A, ohne Verlässlichkeit | Bestand ja, aber ohne Live-Kurse und ohne automatische Aktualisierung | keine Bestandsansicht |
| **Empfehlung** | **verfolgen — nach Gate 1 und Gate 2** | **verwerfen** | **Rückfallebene; sofort umsetzbar** | **vertretbar** — der Tracker bleibt ohne Bestand vollständig nutzbar |

**Zu Option C, ausdrücklich:** Sie ist die stärkste Alternative und wird oft
unterschätzt. `GET /symbols/{ISIN}` ist **belegt lesbar** und liefert für jede
ISIN, die bereits in `securities` steht, Ausschüttungsfrequenz,
Dividendenwährung, Börse und Dividendenhistorie. Damit ließe sich der bestehende
Bereich „Unternehmen" spürbar aufwerten — ohne Positionsendpunkt, ohne neues
Datenmodell für Bestände und mit Supabase durchgehend als führender Quelle. Nur
konzeptionell bewertet; hier wird nichts davon umgesetzt.

---

## 21. Empfehlung: CONDITIONAL GO

**Nicht GO**, weil die Kernbedingung des Auftrags nicht erfüllt ist: Ein
*lesender Depotzugriff* im Sinne von Positionen ist **nicht technisch
nachgewiesen**. Belegt ist nur der Zugriff auf die Depot**liste**.

**Nicht NO-GO**, weil keiner der Ausschlussgründe zutrifft: Es ist nicht nur
schreibender Import möglich (`/session` und `/symbols` lesen nachweislich), es
wird keine fragile Browser-Session gebraucht (statischer Schlüssel,
serverseitig), stabile Kennungen existieren (`portfolios[].id`, ISIN), und der
Schlüssel ist bei sauberer Aufbewahrung vertretbar.

### Die drei Bedingungen

| Gate | Bedingung | Wie zu prüfen | Wenn nicht erfüllt |
|---|---|---|---|
| **1** | Ein lesender Endpunkt liefert je Depot mindestens ISIN und Stückzahl je Position | `https://api.divvydiary.com/documentation/` öffnen; anschließend `npm run discover:divvydiary` mit eigenem Schlüssel | **NO-GO für den Bestandsbereich.** Weiter mit Option C. |
| **2** | Die Nutzung durch eine eigene Anwendung ist erlaubt | kurze Anfrage an DivvyDiary (offene Fragen 1–5 aus §19) | Entscheidung des Auftraggebers; ohne Antwort bleibt ein Restrisiko |
| **3** | Der Umgang mit dem schreibfähigen Schlüssel ist bewusst entschieden | Secret-Handling nach [Sicherheitsbewertung](./divvydiary-security-assessment.md) | kein Start von B1 |

Sind **1 und 3** erfüllt und **2** zumindest bewusst abgewogen, wird aus dem
CONDITIONAL GO ein GO für den in §22 beschriebenen Umfang.

**Diese Empfehlung ist bewusst nicht optimistischer formuliert, als die
Erkenntnisse es erlauben.** Es wurde keine Annahme getroffen, um ein positives
Ergebnis zu erzeugen; die entscheidende Lücke steht in §9 und §10 offen benannt.

---

## 22. Umfang einer möglichen Phase B1

Die vollständige Spezifikation steht in der
[Zielarchitektur §5](./divvydiary-integration-architecture.md#5-spezifikation-phase-b1).
Sie umfasst Migrationen und RLS-Policies, eine eigene Edge Function
`sync-divvydiary-portfolio`, Secret-Konfiguration, API-Client mit
Zod-Validierung, Normalisierung, idempotente Upserts, Deaktivierung entfallener
Positionen, Unternehmens-Matching samt manueller Zuordnung, Sync-Protokoll,
Fehlerbehandlung, Caching, die Bestandsansicht mit KPIs, Positionsliste und
Detailansicht, mobile Darstellung, Barrierefreiheit, Tests und Dokumentation.

**Phase B1 wird in diesem Auftrag nicht begonnen.**

### Das mitgelieferte Prüfwerkzeug

`scripts/divvydiary-discovery/` beantwortet Gate 1 in wenigen Minuten:

```bash
DIVVYDIARY_API_KEY="…" npm run discover:divvydiary -- --isin DE0007164600
```

Es fragt ausschließlich die drei belegten Endpunkte an, ausschließlich mit `GET`
(schreibende Methoden sind technisch blockiert und die Blockade ist getestet),
maskiert den Schlüssel in jeder Ausgabe und gibt Feldnamen und Werttypen aus —
niemals Depotwerte. Einzelheiten: [`README`](../scripts/divvydiary-discovery/README.md).

Geprüft sind (`tests/unit/divvydiary-discovery/`, 81 Tests): fehlende
Umgebungsvariable, unbrauchbare ISIN, unbekannte Option, Blockade von POST, PUT,
PATCH und DELETE, die Statuscodes 401, 403, 404, 429 und 500, Zeitüberschreitung,
nicht erreichbarer Server, ungültiges JSON, unerwarteter Content-Type, leere
Antwort, überdimensionierte Antwort, blockierte Weiterleitung auf einen fremden
Host, erkannte Schemaänderung sowie die Maskierung von Schlüsseln, Tokens,
Kopfzeilen und Werten. Kein Test verändert Daten.

---

## Quellen

- Portfolio Performance (quelloffen), `name.abuchen.portfolio.online.impl`:
  [`DivvyDiaryUploader.java`](https://github.com/portfolio-performance/portfolio/blob/master/name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl/DivvyDiaryUploader.java),
  [`DivvyDiaryDividendFeed.java`](https://github.com/portfolio-performance/portfolio/blob/master/name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl/DivvyDiaryDividendFeed.java),
  [`DivvyDiarySearchProvider.java`](https://github.com/portfolio-performance/portfolio/blob/master/name.abuchen.portfolio/src/name/abuchen/portfolio/online/impl/DivvyDiarySearchProvider.java)
- Portfolio Performance, Issue
  [#4112](https://github.com/portfolio-performance/portfolio/issues/4112)
  („Amounts of dividends from divvydiary.com miss decimal digits")
- Eigene Integration: `docs/CALENDAR_INTEGRATION.md`, `supabase/functions/`
- Nicht erreichbar (Netzwerkrichtlinie dieser Umgebung): `api.divvydiary.com`,
  `divvydiary.com`, `forum.portfolio-performance.info`, `archive.org`
