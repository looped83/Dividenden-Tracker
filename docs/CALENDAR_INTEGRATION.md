# Dividendenkalender (DivvyDiary-iCal-Feed)

Der Bereich **Kalender** (`/#/kalender`) zeigt die **angekündigten** Zahltage aus einem
persönlichen DivvyDiary-Kalender-Feed. Er ergänzt die App um den Blick nach vorn; die
erfassten **tatsächlich erhaltenen** Dividendeneingänge bleiben davon vollständig
unberührt.

## 1. Zweck und Abgrenzung

| | Dividendeneingänge (`/#/eingaenge`) | Dividendenkalender (`/#/kalender`) |
|---|---|---|
| Inhalt | tatsächlich erhaltene Zahlungen | angekündigte Zahltage der Quelle |
| Herkunft | manuell erfasst, CSV-/Excel-Import, Wiederherstellung | DivvyDiary-iCal-Feed |
| Beträge | Brutto, Netto, Steuern, Währung | **erwarteter** Betrag laut Quelle, sofern die SUMMARY ihn nennt |
| Tabelle | `dividend_payments` | `dividend_calendar_events` |

Beide Datenarten werden bewusst **nicht** vermischt (PRODUCT_SPEC.md Grundsatz 8):

- Die Kalendersynchronisation verändert keine Zahlung, kein Unternehmen, kein Depot.
- Kein angekündigter Termin wird automatisch als „erhalten" markiert.
- Es wird kein Betrag geschätzt und keine Währung abgeleitet — angezeigt wird nur, was
  tatsächlich im Feed steht. Der Betrag ist eine **Ankündigung** der Quelle, keine
  erhaltene Zahlung; er wird nirgends in die Statistik, in Ziele oder in die
  Dividendenhistorie eingerechnet.

Ein späterer Abgleich („dieser Zahltag ist eingetroffen") ist durch die stabile
`external_uid` und den erweiterbaren `event_type` vorbereitet, aber **nicht** umgesetzt.

## 2. Aufbau

```
DivvyDiary-iCal-Feed (HTTPS, Token in der Adresse)
        ↓  nur serverseitig
Supabase Edge Function  sync-divvydiary-calendar
        ↓  iCal-Parsing (ICAL.js), Validierung, Abgleich
Supabase-Datenbank  dividend_calendar_events + calendar_sync_status
        ↓  Row Level Security, nur Lesen
Kalenderansicht der PWA
```

| Datei | Rolle |
|---|---|
| `supabase/functions/sync-divvydiary-calendar/index.ts` | Deno-Einstiegspunkt: Auth, Sperre, Abruf, Schreiben, Status |
| `supabase/functions/sync-divvydiary-calendar/deno.json` | Abhängigkeiten der Funktion (supabase-js, ical.js) |
| `supabase/functions/_shared/feed.ts` | HTTPS-Abruf mit Zeitgrenze und Plausibilitätsprüfung |
| `supabase/functions/_shared/ical.ts` | iCal-Verarbeitung (ICAL.js) |
| `supabase/functions/_shared/summary.ts` | Zerlegung der SUMMARY-Zeile in Unternehmen, Betrag, Art und Depot |
| `supabase/functions/_shared/sync.ts` | idempotenter Abgleich |
| `supabase/functions/_shared/datetime.ts` | Kalendertag- und Zeitzonenlogik |
| `supabase/functions/_shared/messages.ts` | bereinigte Nutzermeldungen und Log-Codes |
| `supabase/migrations/0027_dividend_calendar.sql` | Tabellen, Enums, Indizes, RLS, Sperrfunktion |
| `src/features/calendar/*` | Kalenderseite (Monat, Liste, Detailansicht, Synchronisation) |
| `src/lib/calendar/*` | Monatsraster, Gruppierung, Beschriftungen |

Die Dateien unter `_shared/` enthalten bewusst keinen Laufzeitbezug (kein `Deno`, kein
`fetch`, keine Datenbank). Dadurch läuft **derselbe** Code in der Edge Function und in den
Unit-Tests (`tests/unit/calendar/`).

## 3. Das Secret

Der Feed-Link ist persönlich und enthält einen Token. Er wird ausschließlich als
Supabase-Secret gehalten:

```bash
supabase secrets set DIVVYDIARY_ICAL_URL="YOUR_PRIVATE_ICAL_URL"
```

Der Wert hat die Form `https://api.divvydiary.com/dividends/upcoming/ical?dates=pay&token=…`.
Er darf **niemals**

- im Repository stehen (auch nicht in Beispielen, Fixtures oder Tests),
- ein `VITE_`-Präfix bekommen (das landete im Browser-Bundle),
- in einer Antwort der Edge Function auftauchen,
- in einem Logeintrag erscheinen.

Die Funktion liest das Secret über `Deno.env.get("DIVVYDIARY_ICAL_URL")` und gibt bei
jedem Fehler nur einen Code aus (`feed:timeout`, `feed:http:403`, `ical:parse`, …) — nie
die Meldung des ursprünglichen Fehlers, weil `fetch` darin die angefragte Adresse nennt.

Eine begründete Ausnahme sind Fehler der **eigenen** Datenbank (`store:load`,
`store:insert`, …): Dort wird die Meldung von PostgreSQL mitprotokolliert, weil sie die
fehlende Spalte oder verletzte Bedingung benennt und der Fehler ohne sie nicht auffindbar
ist. Sie enthält weder Adresse noch Token; die Werte der betroffenen Zeile stehen in
`details`, das bewusst nicht mitgeht.

Fehlt das Secret, meldet die Oberfläche „Für den Dividendenkalender ist noch keine
Kalenderquelle hinterlegt." — gespeicherte Termine bleiben sichtbar.

## 3a. Die SUMMARY-Zeile

DivvyDiary presst vier Angaben in eine Zeile:

```
Verizon Communications Inc 51,37 € Zahltag (Trade Republic)
└─ Unternehmen ─────────┘ └ Betrag ┘ └ Art ┘ └─ Depot ──┘
```

`_shared/summary.ts` zerlegt sie **von rechts nach links**, weil nur das Zeilenende eine
feste Gestalt hat (Klammer, Schlagwort, Betrag) — der Unternehmensname darf beliebig viele
Wörter, Punkte und Ziffern enthalten („3M Co."). Erkannt werden:

- deutsche und englische Zahlschreibweise (`51,37`, `1.234,56`, `1,234.56`),
- Währungszeichen (`€`, `$`, `£`, `CA$` …) und ISO-Codes,
- die Schlagwörter „Zahltag" und „Ex-Tag" (samt englischer Varianten) — daraus folgt
  `event_type`,
- das Depot in der Klammer.

**Passt ein Teil nicht auf das Muster, bleibt das Feld leer** und die Oberfläche zeigt
weiterhin die vollständige Zeile als Titel. Ein halb geratener Betrag wäre schlimmer als
gar keiner: Er stünde neben echten Finanzdaten, ohne als Vermutung erkennbar zu sein.
Betrag und Währung werden nur **gemeinsam** übernommen; ein Betrag ohne Währung ist nicht
darstellbar.

Gerechnet wird beim Zerlegen nichts — der Wert wird als kanonischer Dezimalstring
gespeichert und erst in der App über `lib/money` (Decimal) summiert, nie als
Fließkommazahl (CALCULATION_RULES.md §8).

## 4. Datenmodell

`dividend_calendar_events` — ein Termin je Zeile, eindeutig über
`(user_id, source, external_uid)`.

| Spalte | Bedeutung |
|---|---|
| `external_uid` | `UID` des VEVENT — die Identität über alle Läufe hinweg |
| `event_type` | `payment` (Zahltag) oder `ex_date`; vorbereitet für weitere Feeds |
| `event_state` | `active`, `cancelled` (STATUS:CANCELLED), `removed_from_source` |
| `event_date` | **maßgeblicher Kalendertag** (`date`, keine Zeitzone) |
| `end_date` | letzter Tag mehrtägiger Termine, inklusiv (DTEND ist im Feed exklusiv) |
| `starts_at` / `ends_at` | nur bei Terminen mit Uhrzeit, sonst `null` |
| `title` | SUMMARY-Zeile unverändert |
| `company_name` | Unternehmensname, beim Einlesen aus der SUMMARY gelöst |
| `expected_amount` / `expected_currency` | **erwarteter** Betrag laut Quelle, `numeric(14,2)` plus ISO-Code; nur gemeinsam gesetzt |
| `source_portfolio` | Depot/Broker aus der Klammer am Zeilenende |
| `description`, `location`, `external_url`, `categories` | direkt aus dem Feed; fehlende Felder bleiben leer |
| `sequence_number`, `recurrence_rule`, `source_created_at`, `source_updated_at` | Metadaten des Feeds |
| `raw_data` | alle Eigenschaften des VEVENT als Text — für spätere Auswertungen |
| `first_synced_at`, `last_synced_at` | erster bzw. letzter Lauf, der diese Zeile geschrieben hat |

`calendar_sync_status` — ein Datensatz je Nutzer und Quelle mit Zustand, Zeitpunkten,
Zählern und einer **bereinigten** Fehlermeldung. Weder Secrets noch Feed-Inhalte.

`claim_calendar_sync(user_id, source, stale_after)` belegt einen Lauf atomar und
verhindert damit parallele Synchronisationen. Nach `stale_after` (Standard: 5 Minuten)
verfällt eine Belegung, damit ein abgestürzter Lauf nicht dauerhaft blockiert.

## 5. Sicherheit

- **Authentifizierung**: `verify_jwt = true` (config.toml) sperrt die Funktion vor dem
  eigenen Code; zusätzlich bestimmt sie die Nutzerkennung über `auth.getUser()` aus dem
  geprüften JWT. Eine vom Client übergebene `user_id` wird nie verwendet.
- **Row Level Security**: `dividend_calendar_events` und `calendar_sync_status` sind für
  `authenticated` **nur lesbar**, und nur die eigenen Zeilen. Es gibt keine INSERT-,
  UPDATE- oder DELETE-Policy; geschrieben wird ausschließlich serverseitig mit
  service_role, das dabei explizit auf die ermittelte `user_id` filtert.
- **Kein Service-Role-Key im Client**: Der Browser ruft nur `functions.invoke(…)` auf.
- **Least Privilege**: service_role hat auf den Kalendertabellen kein DELETE — entfallene
  Termine werden auf `removed_from_source` gesetzt, nie gelöscht.
- Geprüft wird all das in `tests/integration/calendar.test.ts`.

## 6. Synchronisationslogik

1. Lauf belegen (`claim_calendar_sync`). Ist bereits einer unterwegs → HTTP 409, keine
   zweite Anfrage an die Quelle.
2. Feed laden: HTTPS, 15 s Zeitgrenze, höchstens 5 MB, Content-Type-Prüfung, Inhalt muss
   `BEGIN:VCALENDAR` enthalten.
3. Parsen mit ICAL.js. Ereignisse ohne `UID` oder ohne `DTSTART` werden gezählt und
   übersprungen; bei doppelter `UID` gewinnt der spätere Eintrag.
4. Abgleich gegen den gespeicherten Bestand:
   - unbekannte `UID` → anlegen,
   - bekannte `UID` mit geänderten Feldern → aktualisieren (auch Absagen und die
     Rückkehr eines zuvor entfallenen Termins),
   - unverändert → **nicht** schreiben (kein `updated_at`-Rauschen),
   - aktiv, in der Zukunft, nicht mehr im Feed → `removed_from_source`.
5. Ergebnis in `calendar_sync_status` festhalten.

**Schritte 2 und 3 laufen vor jedem Schreibzugriff.** Ein Ausfall der Quelle kann
gespeicherte Termine deshalb nicht beschädigen; die Kalenderseite zeigt den letzten
erfolgreich synchronisierten Stand weiter.

Vergangene Termine werden nie als entfallen markiert: Der Feed enthält nur kommende
Zahltage, jeder vergangene Termin fehlt darin zwangsläufig.

### Darstellung

Standard ist die **Liste**: je Termin eine Kachel mit Datumsfeld (Tageszahl und
Monatskürzel), Unternehmen und Wochentag; auf breiten Bildschirmen mehrspaltig,
gruppiert nach „Heute", „Diese Woche", „Später" — und danach **je Monat ein eigener
Abschnitt** („September 2026"). „Später" endet mit dem laufenden Monat; zuvor trug es alles,
was nach dieser Woche kam, sodass in einem gut gefüllten Kalender ein halbes Jahr Termine
ohne sichtbaren Monatswechsel untereinander stand. Ein Etikett trägt nur der **Ex-Tag**:
„Zahltag" stünde an praktisch jedem Termin dieses Kalenders und sagte damit nichts. Für
Hilfsmittel wird die Art weiterhin in beiden Fällen angesagt.

Direkt unter der Kopfzeile — an derselben Stelle wie in jedem anderen Bereich — stehen vier
Kennzahlkacheln (`StatCard` wie auf der Übersicht): nächster Zahltag mit Abstand in Tagen,
erwartete Summe im laufenden Monat, erwartete Summe der nächsten 30 Tage und Anzahl
verschiedener Unternehmen. Darunter die Wahl der Darstellung (Liste links als
Voreinstellung, Monatsraster rechts). Wann zuletzt abgeglichen wurde, steht als Fußnote am
Seitenende: Es ist eine Auskunft über die Herkunft der Daten, nicht über Dividenden.

Die Summen stammen ausschließlich aus den Beträgen, die die Quelle nennt. Nennt sie für
einen Termin keinen, fehlt er in der Summe — und die Kachel sagt es („aus 2 von 3
Terminen"), statt die Lücke stillschweigend als Null zu verrechnen. Liefert die Quelle
überhaupt keine Beträge, zeigt die Kachel die Anzahl. Beträge in verschiedenen Währungen
werden **nicht** addiert (das wäre eine Umrechnung zu einem erfundenen Kurs); die Kachel
weist dann „verschiedene Währungen" aus. Abgesagte Termine zählen nirgends mit, bleiben in
der Liste aber sichtbar und gekennzeichnet.

Das Monatsraster ist einen Klick entfernt; die Wahl bleibt in `localStorage` erhalten. Es hat
**zwei Darstellungen**: Ab `lg` (Spaltenbreite rund 136 px) steht der Unternehmensname in der
Tageszelle. Darunter — auf dem Telefon sind sieben Spalten je 46 px breit — bliebe von
„Johnson & Johnson" ein „Jo…"; dort trägt der Tag deshalb nur **Punkte** (einer je Termin,
abgesagte gedämpft), und der angetippte Tag stellt seine Termine als volle Kacheln unter das
Raster — dieselben Kacheln wie in der Liste. Die ganze Tageszelle ist die Zielfläche: Ein
einzelner Punkt wäre bei 46 px kein zuverlässig treffbares Ziel (WCAG 2.5.5). Vorgewählt ist
heute, sonst der erste Tag des Monats mit Terminen.

Die Abschnittsüberschriften der Liste („Heute", „September 2026") sind gesetzt wie die
Abschnittstitel der übrigen Bereiche; zuvor standen sie klein, grau und in Großbuchstaben da
und sahen damit nach Beschriftung statt nach Überschrift aus.

### Wann synchronisiert wird

- Beim Öffnen des Kalenders, wenn der letzte Erfolg älter als **12 Stunden** ist oder noch
  nie synchronisiert wurde — einmal je Sitzung, nicht bei jedem Rendern.
- Jederzeit über die Schaltfläche **Aktualisieren**. Sie ist während des Laufs gesperrt.

Für eine echte tägliche Synchronisation ohne geöffnete App lässt sich zusätzlich
`pg_cron` im Supabase-Projekt einrichten (Dashboard → Database → Extensions → `pg_cron`
und `pg_net`). Ein Cron-Job müsste die Funktion mit einem gültigen Nutzer-JWT aufrufen;
solange das nicht eingerichtet ist, genügt die Fallback-Logik oben.

## 7. Zeitzonen

Maßgeblich ist der **Kalendertag**, nicht der Zeitpunkt (`event_date` ist ein `date`).

- Ganztägige Ereignisse (`DTSTART;VALUE=DATE:20260813`) werden Ziffer für Ziffer
  übernommen — keine UTC-Umrechnung, kein Tagesversatz.
- Ereignisse mit Uhrzeit werden über `TZID` bzw. `…Z` in einen absoluten Zeitpunkt
  umgerechnet; der angezeigte Kalendertag ist der Tag in **Europe/Berlin**.
- Ein Ereignis ohne Zeitzonenangabe („floating") gilt als Berliner Zeit.
- Die Oberfläche formatiert durchgehend `de-DE` (`src/lib/utils/formatDate.ts`).

## 8. Einrichtung und Betrieb

Drei Dinge sind nötig: die Migration, das Secret und die ausgerollte Funktion.

**Mit der Supabase CLI:**

```bash
# 1) Migration einspielen
supabase migration up            # oder: supabase db push

# 2) Secret setzen (echter Wert, niemals ins Repository)
supabase secrets set DIVVYDIARY_ICAL_URL="YOUR_PRIVATE_ICAL_URL"

# 3) Edge Function ausrollen
supabase functions deploy sync-divvydiary-calendar
```

**Ohne lokale CLI:**

1. Migration: Dashboard → SQL Editor → Inhalt von
   `supabase/migrations/0027_dividend_calendar.sql` ausführen.
2. Secret: Dashboard → Project Settings → Edge Functions → Secrets →
   `DIVVYDIARY_ICAL_URL` anlegen. Direktlink:
   `https://supabase.com/dashboard/project/<ref>/settings/functions`
3. Funktion: einmalig zwei GitHub-Secrets hinterlegen (Repository → Settings →
   Secrets and variables → Actions) — `SUPABASE_ACCESS_TOKEN`
   (https://supabase.com/dashboard/account/tokens) und `SUPABASE_PROJECT_ID`
   (die Projekt-Ref). Danach GitHub → Actions → **Deploy Edge Functions** →
   *Run workflow*. Der Workflow
   (`.github/workflows/deploy-functions.yml`) rollt anschließend bei jeder
   Änderung unter `supabase/functions/` automatisch aus.

Das Dashboard kann Edge Functions zwar auch im Browser anlegen, aber nur als
einzelne Datei — diese Funktion besteht bewusst aus mehreren Modulen, die von den
Unit-Tests des Projekts geprüft werden. Der Weg über Actions hält beides zusammen.

### Lokale Entwicklung

```bash
# .env aus .env.example anlegen und DIVVYDIARY_ICAL_URL eintragen (nicht einchecken)
supabase functions serve sync-divvydiary-calendar --env-file .env
```

### Manuell prüfen

```bash
# Zugangstoken einer angemeldeten Sitzung; ohne gültiges JWT antwortet die
# Funktion mit 401.
curl -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "https://<projekt>.supabase.co/functions/v1/sync-divvydiary-calendar"
```

Erwartete Antwort:

```json
{ "status": "success", "eventsRead": 12, "created": 12, "updated": 0, "removed": 0, "skipped": 0 }
```

Läuft bereits ein Abgleich, antwortet die Funktion mit `409` und `{"status":"running"}`.
Bei einem Fehler mit `502` und einer verständlichen, bereinigten Meldung.

### Tests

```bash
npm test                  # iCal-Verarbeitung, Abgleich, Abruf, Kalenderansicht
npm run test:integration  # RLS, Grants, Eindeutigkeit, Sperre (echte Datenbank)
npm run test:e2e:app      # Kalenderseite im Browser inkl. axe und 320-px-Prüfung
```

## 9. Verhalten bei Störungen

| Situation | Verhalten |
|---|---|
| DivvyDiary nicht erreichbar / Zeitüberschreitung | gespeicherte Termine bleiben sichtbar, dezenter Hinweis, Status `error` |
| Antwort ist kein Kalender (z. B. HTML-Fehlerseite) | Abbruch **vor** jedem Schreibzugriff, Bestand unverändert |
| Secret fehlt | Hinweis auf die fehlende Kalenderquelle, kein Datenverlust |
| Datenbank lehnt ab (fehlende Migration, verletzte Bedingung) | eigener Hinweis „Vermutlich fehlt … eine Datenbankmigration"; im Log steht `store:<schritt> — <Meldung der Datenbank>` |
| Gerät offline | Die App-Hülle kommt aus dem Service Worker; Termine stammen aus der Datenbank, ein Abruf schlägt sichtbar fehl, ohne etwas zu löschen |
| Zwei Läufe gleichzeitig | der zweite endet sofort mit `409`, ohne die Quelle erneut anzufragen |

Der Service Worker speichert ausschließlich die App-Hülle (`public/sw.js`) — weder
Kalenderdaten noch Adressen oder Token.
