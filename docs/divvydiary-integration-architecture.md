# DivvyDiary-Bestandsintegration — Zielarchitektur (Entwurf, Phase B0)

**Stand:** 2026-08-03 · **Status:** Entwurf, nichts davon ist umgesetzt

Dieses Dokument beschreibt, **wie** eine Integration gebaut würde, falls die
Bedingungen aus dem [Discovery-Bericht §21](./divvydiary-api-discovery.md#21-empfehlung-conditional-go)
erfüllt sind. Es legt keine Migration an, ändert kein Datenmodell und baut keine
Oberfläche.

> **Begriff.** Der Auftrag nennt den geplanten Bereich „Depot". Dieser Name ist
> in der Anwendung bereits dreifach vergeben (Tabelle `depots`,
> `/#/einstellungen/depots`, `/#/statistiken/depots`) und bedeutet dort das
> **Broker-Konto**, dem Zahlungen zugeordnet sind. Dieses Dokument nennt den
> neuen Bereich deshalb **„Bestand"** und die externe Einheit **„externes
> Depot"**. Die Namensentscheidung liegt beim Auftraggeber; an der Architektur
> ändert sie nichts.

---

## 1. Zielarchitektur

```
DivvyDiary REST API  (api.divvydiary.com, X-API-Key)
        │  nur GET · Zeitgrenze 15 s · Secret nur serverseitig
        ▼
Supabase Edge Function  sync-divvydiary-portfolio   (verify_jwt = true)
        │  1 Zod-Validierung der Antwort
        │  2 Normalisierung in das interne Format
        │  3 Zuordnung zu securities (ISIN → externe ID → WKN → manuell)
        ▼
Supabase  external_portfolios · portfolio_positions · portfolio_syncs
          external_security_mappings
        │  Row Level Security: nur eigene Zeilen, nur SELECT
        ▼
PWA  Bereich „Bestand" (TanStack Query gegen den internen Cache)
```

### 1.1 Warum eine Edge Function und kein Aufruf aus dem Browser

Drei Gründe, jeder für sich ausreichend:

1. **Das Secret.** Ein API-Schlüssel im Browser ist ein veröffentlichter
   Schlüssel — und dieser kann schreiben. Er darf das Bundle nie erreichen
   (SECURITY_MODEL.md §5).
2. **CORS.** Ob `api.divvydiary.com` Anfragen von einer fremden Herkunft
   zulässt, ist unbekannt und läge ohnehin nicht in unserer Hand.
3. **Entkopplung.** Die PWA soll das externe Schema nicht kennen. Sie liest den
   internen Cache; ändert DivvyDiary etwas, ist die Oberfläche nicht betroffen.

Dieselbe Begründung trägt bereits die Kalenderfunktion.

### 1.2 Übernommene Muster aus der Kalenderintegration

| Muster | Übernahme |
|---|---|
| Secret nur in Supabase Secrets, nie in einer Antwort, nie im Log | **unverändert** |
| `verify_jwt = true` in `config.toml` | **unverändert** |
| Nutzerkennung ausschließlich aus `auth.getUser()`, nie aus dem Anfragekörper | **unverändert** |
| Schreiben mit `service_role`, jede Anweisung zusätzlich auf `user_id` gefiltert | **unverändert** |
| RLS für `authenticated` nur `SELECT`, kein INSERT/UPDATE/DELETE | **unverändert** |
| Laufzeitfreie Fachlogik in `supabase/functions/_shared`, unter Node getestet | **unverändert** |
| Belegter Lauf über eine `claim_*`-Funktion gegen Parallelläufe | **übernommen**, eigene Funktion `claim_portfolio_sync` |
| Fehlercodes statt Fehlermeldungen nach außen (`messages.ts`) | **erweitert** um Bestandsfehler |
| Abruf und Prüfung **vollständig vor** dem ersten Schreibzugriff | **unverändert — hier noch wichtiger** |

**Nicht übernommen:** `_shared/feed.ts` (iCal-spezifisch), `_shared/ical.ts`,
`_shared/summary.ts`, `_shared/sync.ts` (Termin-Abgleich). Der Bestandsabgleich
ist eine andere Fachlichkeit und bekommt eigene Module. Eine Verallgemeinerung
beider Synchronisationen zu einem gemeinsamen Rahmen wäre eine Abstraktion ohne
Nutzen — zwei Aufrufer sind kein Muster.

### 1.3 Betriebsverhalten

| Aspekt | Festlegung | Begründung |
|---|---|---|
| Auslösung | manuell über eine Schaltfläche; zusätzlich beim Öffnen, wenn der letzte Erfolg älter als **12 Stunden** ist | wie im Kalender; hält die Last klein und ist vorhersehbar |
| Automatik | **höchstens ein Lauf je Tag**, und nur wenn Rate Limits bekannt sind | Rate Limits sind unbekannt (Discovery §12) |
| Zeitgrenze | 15 s je Aufruf | wie `_shared/feed.ts` |
| Wiederholung | **keine automatische** innerhalb eines Laufs; bei `429` wird `Retry-After` angezeigt, nicht ignoriert | ein fremder Dienst wird nicht bedrängt |
| Parallelläufe | `claim_portfolio_sync`, verfällt nach 5 Minuten; zweiter Lauf → HTTP 409 | verhindert doppelte Anfragen und Schreibkonflikte |
| stale-while-error | Bei jedem Fehler bleibt der letzte erfolgreiche Bestand vollständig sichtbar, versehen mit Datum und Hinweis | ein Ausfall der Quelle darf keine Daten verstecken |
| Zwischenspeicher im Client | TanStack Query wie überall; Datenquelle ist immer Supabase | eine Ladelogik, kein Sonderweg |
| Beobachtung | `portfolio_syncs` je Lauf: Zeitpunkte, Zähler, Fehlercode, **bereinigte** Meldung | reicht für die Fehlersuche, ohne Finanzdaten zu protokollieren |

---

## 2. Vorläufiges Datenmodell

Kein Migrationsentwurf, sondern ein Vorschlag. Bewusst **kleiner** als im
Auftrag skizziert: Eine Spalte, die die API nicht füllt, ist keine Vorbereitung,
sondern eine Lüge im Schema. Was DivvyDiary liefert, ist heute unbewiesen
(Discovery §9) — deshalb ist unten in einer eigenen Spalte vermerkt, **wovon die
Existenz abhängt**.

### 2.1 `external_portfolios` — das externe Depot

| Spalte | Typ | Null | Herkunft |
|---|---|---|---|
| `id` | `uuid` PK | nein | erzeugt |
| `user_id` | `uuid` → `auth.users` | nein | JWT |
| `provider` | `text` (Check: `'divvydiary'`) | nein | fest |
| `external_id` | `text` | nein | `portfolios[].id` — **belegt** |
| `name` | `text` | nein | `portfolios[].name` — **belegt** |
| `currency` | `char(3)` | **ja** | nur, falls die API sie liefert |
| `depot_id` | `uuid` → `depots` | ja | **manuelle** Verknüpfung mit einem eigenen Depot |
| `is_active` | `boolean` default `true` | nein | wird `false`, wenn die Quelle das Depot nicht mehr nennt |
| `last_successful_sync_at` | `timestamptz` | ja | eigener Lauf |
| `created_at` / `updated_at` | `timestamptz` | nein | Trigger |

- **Unique:** `(user_id, provider, external_id)`.
- `external_id` als `text`, nicht `bigint`: Die heutige Kennung ist zwar
  numerisch, aber es ist eine **fremde** Kennung. `text` überlebt einen Wechsel
  auf UUIDs oder Präfixe, ohne dass Daten migriert werden müssen.
- `depot_id` ist die Brücke zum bestehenden Modell und **immer manuell**. Eine
  Zuordnung über Namensgleichheit („Trade Republic" = „Trade Republic") wäre
  bequem und gelegentlich falsch.
- Kein `is_default`, kein `sort_order`, keine Kennzahlenspalten — nicht belegt.

### 2.2 `portfolio_positions` — eine Position je Zeile

| Spalte | Typ | Null | Herkunft / Bedingung |
|---|---|---|---|
| `id` | `uuid` PK | nein | erzeugt |
| `user_id` | `uuid` | nein | JWT |
| `external_portfolio_id` | `uuid` → `external_portfolios` | nein | intern |
| `external_position_id` | `text` | **ja** | falls die API eine liefert; sonst dient die ISIN als Schlüssel |
| `security_id` | `uuid` → `securities` | **ja** | Ergebnis der Zuordnung; `null` = „Zuordnung erforderlich" |
| `isin` | `char(12)` | **ja** | **Kernfeld**; ohne sie ist keine sichere Zuordnung möglich |
| `wkn` | `char(6)` | ja | falls geliefert |
| `ticker` | `text` | ja | falls geliefert |
| `exchange` | `char(4)` | ja | ISO-MIC, falls geliefert |
| `name` | `text` | nein | Anzeige, solange keine Zuordnung besteht |
| `quantity` | `numeric(20,8)` | nein | Bruchstücke sind üblich — daher 8 Nachkommastellen |
| `currency` | `char(3)` | ja | Währung der Geldbeträge dieser Zeile |
| `average_buy_price` | `numeric(20,8)` | ja | nur bei Lieferung |
| `cost_basis` | `numeric(20,2)` | ja | nur bei Lieferung; **nicht** aus Kurs × Stück errechnet |
| `current_price` | `numeric(20,8)` | ja | nur bei Lieferung |
| `price_timestamp` | `timestamptz` | ja | ohne ihn ist ein Kurs nicht einordbar |
| `market_value` | `numeric(20,2)` | ja | nur bei Lieferung |
| `annual_dividend` | `numeric(20,2)` | ja | nur bei Lieferung |
| `is_active` | `boolean` default `true` | nein | Deaktivierung statt Löschen |
| `removed_from_source_at` | `timestamptz` | ja | wann die Quelle sie nicht mehr nannte |
| `synced_at` | `timestamptz` | nein | letzter Lauf, der diese Zeile schrieb |
| `source_hash` | `text` | nein | Prüfsumme der normalisierten Felder — verhindert Schreiben ohne Änderung |
| `created_at` / `updated_at` | `timestamptz` | nein | Trigger |

**Bewusst nicht gespeichert:**

| Feld | Grund |
|---|---|
| `gain_amount`, `gain_percent` | aus `market_value` und `cost_basis` **rechenbar** — eine gespeicherte Kopie liefe auseinander |
| `portfolio_weight` | rechenbar; hängt zudem von der gewählten Ansicht ab (ein Depot vs. alle) |
| `dividend_yield`, `yield_on_cost` | rechenbar aus `annual_dividend`, `market_value`, `cost_basis` |
| `sector`, `country`, `security_type` | gehören zum **Unternehmen** (`securities`), nicht zur Position — sonst zwei Wahrheiten |
| `next_ex_date`, `next_pay_date` | stehen bereits in `dividend_calendar_events`; doppelte Kalenderlogik ist ausgeschlossen (Auftrag §9) |
| `raw_data` | ein vollständiger Abzug der Depotdaten in der Datenbank ist ein Datenschutzrisiko ohne Nutzen; die Prüfsumme genügt |

- **Unique:** `(user_id, external_portfolio_id, coalesce(external_position_id, isin))`
  als Ausdrucksindex — die Position ist innerhalb **eines** Depots eindeutig.
  Dasselbe Wertpapier in zwei Depots ergibt zwei Zeilen. Das ist Absicht
  (Auftrag §14): Einstandskurse unterscheiden sich je Depot, eine Zusammenführung
  wäre eine Erfindung.
- **Indizes:** `(user_id, external_portfolio_id) where is_active`,
  `(user_id, security_id)`, `(user_id, isin)`.
- **Geldbeträge als `numeric`, niemals `float`** (CALCULATION_RULES.md §8). In
  der Edge Function werden Beträge als Zeichenkette weitergereicht — der bekannte
  Nachkommastellen-Fehler in Portfolio Performance zeigt, wie schnell hier etwas
  verloren geht.

### 2.3 `portfolio_syncs` — Protokoll je Lauf

`id`, `user_id`, `provider`, `external_portfolio_id` (nullable: ein Lauf umfasst
alle Depots), `started_at`, `finished_at`, `status`
(`running` | `success` | `partial` | `error`), `positions_received`, `created`,
`updated`, `deactivated`, `unmatched`, `error_code`, `error_message` (**bereinigt**),
`created_at`.

- `status = 'partial'`: Ein Depot ließ sich abrufen, ein anderes nicht. Der
  Unterschied zu `error` ist für den Nutzer wichtig — er erklärt, warum ein Teil
  des Bestands älter ist.
- `error_message` folgt der Regel der Kalenderfunktion: eigene Datenbankfehler
  im Klartext (sie benennen die fehlende Spalte), Fremdfehler **nur als Code**
  (sie enthalten sonst die Adresse und damit möglicherweise Zugangsdaten).

### 2.4 `external_security_mappings` — bestätigte Zuordnungen

`id`, `user_id`, `provider`, `external_key` (externe Wertpapier-ID oder ISIN),
`security_id`, `method` (`isin` | `external_id` | `wkn` | `ticker_exchange` | `manual`),
`confirmed_by_user boolean`, `created_at`, `updated_at`.
**Unique:** `(user_id, provider, external_key)`.

Das Gegenstück zu `security_aliases` aus dem Import: Was der Nutzer einmal
bestätigt hat, wird nicht erneut gefragt. `method` bleibt erhalten, damit später
nachvollziehbar ist, **warum** eine Zeile zugeordnet wurde.

### 2.5 RLS und Rechte — für alle vier Tabellen

```sql
alter table <t> enable row level security;
revoke all on <t> from anon, authenticated;
grant select on <t> to authenticated;         -- nur lesen
create policy <t>_select_own on <t>
  for select to authenticated using (user_id = auth.uid());
```

- **Kein INSERT/UPDATE/DELETE für `authenticated`.** Geschrieben wird
  ausschließlich serverseitig mit `service_role`, das dabei explizit auf die aus
  dem JWT ermittelte `user_id` filtert — wie bei den Kalendertabellen.
- **Ausnahme:** `external_security_mappings` und `external_portfolios.depot_id`
  brauchen einen Schreibweg für die manuelle Zuordnung. Empfehlung: **nicht**
  über ein UPDATE-Grant, sondern über eine `security definer`-RPC, die prüft,
  dass `security_id` und `depot_id` demselben Nutzer gehören. Ein UPDATE-Grant
  auf `security_id` erlaubte sonst, eine Position einem fremden Unternehmen
  zuzuweisen.
- `enforce_user_id`- und `set_updated_at`-Trigger wie überall; Audit-Trigger nur
  auf `external_security_mappings` (die anderen Tabellen sind ein Cache — ihre
  Änderungshistorie wäre Rauschen).

---

## 3. Synchronisierungsablauf

1. Der Nutzer löst den Abgleich aus (Schaltfläche oder 12-Stunden-Regel).
2. Die PWA ruft `functions.invoke("sync-divvydiary-portfolio")` mit dem
   Sitzungs-JWT auf.
3. Die Plattform prüft das JWT (`verify_jwt = true`); die Funktion ermittelt die
   Nutzerkennung über `auth.getUser()`.
4. `claim_portfolio_sync` belegt den Lauf. Läuft bereits einer → `409`, **ohne**
   die Quelle anzufragen.
5. Das Secret `DIVVYDIARY_API_KEY` wird serverseitig gelesen. Fehlt es, endet der
   Lauf mit einer verständlichen Meldung — der gespeicherte Bestand bleibt.
6. Ausschließlich lesende Aufrufe: erst die Depotliste, dann je Depot die
   Positionen. Zeitgrenze je Aufruf 15 s, kein Parallelfeuer.
7. **Jede** Antwort wird gegen ein Zod-Schema geprüft. Schlägt das fehl:
   `error_code = "schema"`, Abbruch **vor** jedem Schreibzugriff.
8. Normalisierung: ISIN und Währung in Großbuchstaben, Beträge als kanonische
   Dezimalzeichenketten, Zeitpunkte nach ISO/UTC, leere Zeichenketten zu `null`.
9. Depots werden per Upsert über `(user_id, provider, external_id)` angelegt oder
   aktualisiert.
10. Positionen werden über den Upsert-Schlüssel aus §2.2 verarbeitet.
11. Die Zuordnung zu `securities` läuft nach der Reihenfolge aus der
    [Datenabbildung §3](./divvydiary-data-mapping.md#3-identifikatoren-und-zuordnung).
    Nicht zuordenbare Positionen werden mit `security_id = null` gespeichert —
    sie sind sichtbar, nur eben nicht verknüpft.
12. Geschrieben wird nur, was sich geändert hat (`source_hash`). Unverändertes
    erzeugt kein `updated_at`-Rauschen.
13. Positionen, die die Quelle **in einer gültigen Antwort** nicht mehr nennt,
    werden auf `is_active = false` gesetzt und mit `removed_from_source_at`
    versehen. **Gelöscht wird nie.**
14. Das Ergebnis wird in `portfolio_syncs` festgehalten.
15. Die PWA liest ausschließlich den internen Cache — vor, während und nach dem
    Lauf.

### 3.1 Festlegungen zu den Grenzfällen

| Fall | Verhalten |
|---|---|
| **Leere Antwort** | **Es wird nichts deaktiviert.** Eine leere Liste ist von „Depot geleert" nicht zu unterscheiden. Der Lauf endet mit `status = 'partial'` und einem Hinweis; der Bestand bleibt. Nur wenn die Quelle in **zwei aufeinanderfolgenden erfolgreichen** Läufen leer bleibt, wird deaktiviert. |
| **Fehler bei einem von mehreren Depots** | `status = 'partial'`; die anderen Depots werden regulär aktualisiert; im fehlerhaften Depot wird **nichts** deaktiviert. |
| **Schemaänderung** | Abbruch vor jedem Schreibzugriff, `error_code = "schema"`; die Ansicht zeigt den letzten Stand mit Hinweis. |
| **Doppelte Positionen in einer Antwort** | Der spätere Eintrag gewinnt, der Vorgang wird gezählt (wie bei doppelten UIDs im Kalender). Es wird nichts addiert. |
| **Dasselbe Wertpapier in zwei Depots** | Zwei Zeilen, getrennte Einstände. Zusammengeführt wird erst in der Anzeige, und dort sichtbar als Summe. |
| **Verschiedene Währungen** | Es wird **nicht** umgerechnet. Gesamtwerte über gemischte Währungen weisen „verschiedene Währungen" aus — dieselbe Regel wie in `CalendarSummary`. |
| **Rundungsdifferenzen** | Beträge werden übernommen, wie sie kommen (als Dezimalzeichenkette), und nur zur Anzeige gerundet. Summen entstehen mit `decimal.js`, nie mit `+` auf Fließkommazahlen. |
| **Position mit `quantity = 0`** | Wird gespeichert und als geschlossen dargestellt, nicht stillschweigend verworfen. |
| **Position ohne ISIN** | Wird gespeichert, `security_id` bleibt `null`, sie erscheint unter „Zuordnung erforderlich". Es findet **keine** Namenszuordnung statt. |
| **Nicht zugeordnetes Unternehmen** | Position ist sichtbar und zählt in den Gesamtwert, aber nicht in unternehmensbezogene Auswertungen. Der Zustand wird in der Übersicht benannt („3 Positionen ohne Zuordnung"). |
| **Depot verschwindet aus der Quelle** | `is_active = false`, Positionen bleiben unverändert erhalten. |

### 3.2 Idempotenz

Zwei identische Läufe hintereinander erzeugen: keine neue Zeile, kein
verändertes `updated_at`, keine Deaktivierung, aber zwei Einträge in
`portfolio_syncs`. Das ist die Eigenschaft, die ein Integrationstest prüfen
muss — genauso wie `tests/unit/calendar/sync.test.ts` es für den Kalender tut.

---

## 4. Konzept für den Bestandsbereich

Fachliches Konzept, keine Implementierung.

### 4.1 Einordnung in die Navigation

Der Bereich gehört in `PRIMARY_NAV_ITEMS` zwischen „Kalender" und
„Unternehmen": Erhaltene Dividenden → angekündigte Termine → **Bestand** →
Unternehmen. In der Bottom-Navigation liegt er hinter „Mehr" (die drei direkten
Slots sind belegt). Route: `/#/bestand`, nachgeladen über `routeChunks.ts` wie
jeder andere Bereich.

**Zur Namensfrage:** Fällt die Entscheidung auf „Depot", müssen die drei
bestehenden Vorkommen umbenannt werden (etwa in „Konten"), sonst gibt es zwei
Bedeutungen für ein Wort. Das ist eine eigene, nicht kleine Änderung mit
Auswirkung auf Statistik, Einstellungen und Dokumentation — sie gehört dann
ausdrücklich in den Umfang von B1.

### 4.2 Übersicht

Kennzahlkacheln (`StatCard`, wie auf Übersicht und Kalender). **Es erscheint nur,
was die Quelle liefert oder was transparent berechnet ist** — die Kachel nennt
ihre Herkunft, und eine fehlende Angabe wird als fehlend gezeigt, nicht als Null:

| Kachel | Bedingung | Herkunft |
|---|---|---|
| aktueller Bestandswert | Marktwerte geliefert | Quelle, summiert |
| Einstandswert | Einstände geliefert | Quelle, summiert |
| Gewinn/Verlust absolut und relativ | beides oben vorhanden | **berechnet**, gekennzeichnet |
| erwartete Jahresdividende (brutto) | geliefert | Quelle |
| Ø Dividendenrendite | Jahresdividende und Marktwert vorhanden | **berechnet** |
| Ø Yield on Cost | Jahresdividende und Einstand vorhanden | **berechnet** |
| aktive Positionen | immer | Cache |
| letzter erfolgreicher Abgleich | immer | `portfolio_syncs` |

Fehlen die Grundlagen, verschwindet die Kachel — sie zeigt keine Null. Bei
gemischten Währungen: „verschiedene Währungen" statt einer erfundenen Summe.

### 4.3 Positionen

Mobil eine Karte je Position, ab `md` eine Tabelle (wie `PaymentsPage`):

Unternehmen (verlinkt auf `/#/unternehmen/:id`, sofern zugeordnet) · ISIN ·
Stückzahl · Marktwert · Anteil am Bestand · Einstandswert · Gewinn/Verlust ·
Dividendenrendite · Yield on Cost · erwartete Jahresdividende · nächster Termin
**aus dem bestehenden Kalender** · Zuordnungsstatus · letzter Abgleich.

Spalten ohne Datengrundlage werden **nicht** angezeigt — eine Tabelle mit acht
leeren Spalten ist schlechter als eine mit vier gefüllten.

### 4.4 Detailansicht

`/#/bestand/:id` mit den Abschnitten: Bestand und Marktwert · Einstand und
Performance · Dividendenkennzahlen · **tatsächlich erhaltene Dividenden aus
Supabase** (der eigentliche Mehrwert gegenüber DivvyDiary: Bestand und
tatsächliche Historie nebeneinander) · kommende Termine aus dem Kalender ·
Zuordnungsstatus · Datenquelle und Datenstand je Block.

### 4.5 „Zuordnung erforderlich"

Ein eigener, aus der Übersicht verlinkter Bereich für Positionen mit
`security_id = null`. Je Eintrag: was die Quelle liefert (Name, ISIN, Börse),
warum keine Zuordnung zustande kam (keine ISIN / ISIN unbekannt / mehrdeutig),
und zwei Handlungen — **bestehendes Unternehmen wählen** (`EntitySelect`, wie im
Importassistenten) oder **neues Unternehmen anlegen** (vorbefüllt, aber
bestätigungspflichtig).

Ausgeschlossen: automatisches Anlegen aller unbekannten Unternehmen, automatische
Zuordnung über Namensähnlichkeit. Der Importassistent hält diese Linie bereits;
sie wird hier fortgeschrieben.

### 4.6 Mehrere Depots

Die Architektur ist von Anfang an mehrdepotfähig (`external_portfolios` mit
eigener Kennung, Positionen daran gehängt). Die erste sichtbare Fassung zeigt
eine **Gesamtübersicht**; ein Filter „Depot" folgt, sobald mehr als eines
vorhanden ist. Positionen aus verschiedenen Depots werden nie stillschweigend
zusammengeführt: In der Gesamtansicht erscheint dasselbe Wertpapier als eine
Zeile mit summierter Stückzahl und dem Vermerk „in 2 Depots"; die Einstände
bleiben getrennt und werden in der Detailansicht je Depot gezeigt.

### 4.7 Zustände der Oberfläche

| Zustand | Darstellung |
|---|---|
| Noch nie abgeglichen | Erklärung, was der Bereich zeigt, und eine Schaltfläche |
| Secret fehlt | „Für den Bestand ist noch keine Verbindung zu DivvyDiary hinterlegt." — analog zum Kalender |
| Abgleich läuft | Schaltfläche gesperrt, Fortschritt, alter Bestand bleibt sichtbar |
| Letzter Abgleich fehlgeschlagen | Bestand sichtbar, dezenter Hinweis mit Datum des letzten Erfolgs |
| Teilweise fehlgeschlagen | wie oben, zusätzlich die Angabe, welches Depot betroffen ist |
| Kein Bestand geliefert | „Die Quelle hat keine Positionen gemeldet." — **es wird nichts gelöscht** |
| Offline | App-Hülle aus dem Service Worker, Daten aus Supabase, Abgleich schlägt sichtbar fehl |

### 4.8 Barrierefreiheit und Darstellung

Dieselben Anforderungen wie im übrigen Projekt (UX_AND_DESIGN_SYSTEM.md,
`docs/ACCESSIBILITY_AUDIT.md`): bedienbar ab 320 px, Tabellen mit
`scope`-Kopfzeilen und mobil als Karten, Kontraste nach WCAG AA, Statusänderungen
über `aria-live`, jede Farbaussage zusätzlich in Text (Gewinn/Verlust nie allein
über Rot/Grün), Prüfung mit axe im E2E-Test.

---

## 5. Spezifikation Phase B1

Umfang, falls die Gates aus dem [Discovery-Bericht §21](./divvydiary-api-discovery.md#21-empfehlung-conditional-go)
erfüllt sind. **In diesem Auftrag nicht zu beginnen.**

### 5.1 Datenbank

1. Migration `00xx_external_portfolios.sql`: die vier Tabellen aus §2 mit
   Constraints, Indizes, Triggern.
2. RLS-Policies: `select` je Tabelle, kein Schreibrecht für `authenticated`.
3. `claim_portfolio_sync(user_id, provider, stale_after)` analog
   `claim_calendar_sync`.
4. RPC `link_portfolio_position(position_id, security_id)` und
   `link_external_portfolio(external_portfolio_id, depot_id)` —
   `security definer`, mit Eigentumsprüfung, festem `search_path`.
5. Integrationstests: RLS, Grants (kein DELETE!), Eindeutigkeit, Sperre,
   Fremdnutzerzugriff — in der Form von `tests/integration/calendar.test.ts`.

### 5.2 Edge Function `sync-divvydiary-portfolio`

6. `config.toml`: `verify_jwt = true`, eigener Eintrag.
7. Secret `DIVVYDIARY_API_KEY` (getrennt von `DIVVYDIARY_ICAL_URL`).
8. `_shared/divvydiary/client.ts`: lesender Client, nur GET, Zeitgrenze,
   Größengrenze, kein Folgen fremder Weiterleitungen — der Methodenwächter aus
   `scripts/divvydiary-discovery/request.ts` wandert hierher.
9. `_shared/divvydiary/schema.ts`: Zod-Schemata der Antworten.
10. `_shared/divvydiary/normalize.ts`: externes → internes Format, Beträge als
    Dezimalzeichenketten.
11. `_shared/divvydiary/match.ts`: Zuordnungsreihenfolge, ohne Namensähnlichkeit.
12. `_shared/divvydiary/sync.ts`: reine Abgleichsfunktion (`plan` → `apply`),
    unter Node testbar wie `_shared/sync.ts`.
13. `index.ts`: Auth, Sperre, Abruf, Schreiben, Protokoll, bereinigte Antwort.
14. Ergänzung von `_shared/messages.ts` um die neuen Fehlercodes.

### 5.3 Frontend

15. `src/lib/supabase/repositories/portfolioPositions.ts` — Lesen und die beiden
    Zuordnungs-RPCs.
16. `src/features/portfolio/` — Übersicht, Positionsliste, Detailansicht,
    Zuordnungsbereich, Abgleich-Schaltfläche.
17. Navigation und Route ergänzen (`navigation.ts`, `router.tsx`,
    `routeChunks.ts`, `areaNames.ts`).
18. Berechnete Kennzahlen ausschließlich über `src/lib/money` (Decimal).
19. Cache-Invalidierung nach einem Lauf entsprechend ARCHITECTURE.md §Phase 6.

### 5.4 Qualität

20. Unit-Tests: Normalisierung, Zuordnung, Abgleich (inklusive Idempotenz,
    leerer Antwort, Teilausfall, Schemaänderung, doppelter Position,
    Mehrdepotfall), Kennzahlenberechnung, Darstellungslogik.
21. Integrationstests: RLS, Grants, Sperre, Eigentumsprüfung der RPCs.
22. E2E: Bestandsseite, Zuordnungsablauf, 320 px, axe.
23. Dokumentation: `docs/PORTFOLIO_INTEGRATION.md` in der Form von
    `docs/CALENDAR_INTEGRATION.md`; Ergänzungen in DATA_MODEL, SECURITY_MODEL,
    ARCHITECTURE, PRODUCT_SPEC, DECISIONS.
24. Aufräumen: `scripts/divvydiary-discovery/` entfernen oder als Diagnosemittel
    ausdrücklich behalten.

### 5.5 Nicht in B1

Schreibende Aufrufe an DivvyDiary, Transaktions- oder Kauf-/Verkaufsimport,
Ersatz der historischen Supabase-Dividenden, Änderungen an der
Kalenderintegration, Intraday-Kurse, eigene Kursversorgung, automatisches
Anlegen aller unbekannten Unternehmen, bidirektionale Synchronisation.
