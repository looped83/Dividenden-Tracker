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
| Beträge | Brutto, Netto, Steuern, Währung | **keine** — der Feed liefert keine |
| Tabelle | `dividend_payments` | `dividend_calendar_events` |

Beide Datenarten werden bewusst **nicht** vermischt (PRODUCT_SPEC.md Grundsatz 8):

- Die Kalendersynchronisation verändert keine Zahlung, kein Unternehmen, kein Depot.
- Kein angekündigter Termin wird automatisch als „erhalten" markiert.
- Es wird kein Betrag geschätzt und keine Währung abgeleitet — angezeigt wird nur, was
  tatsächlich im Feed steht.

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

Fehlt das Secret, meldet die Oberfläche „Für den Dividendenkalender ist noch keine
Kalenderquelle hinterlegt." — gespeicherte Termine bleiben sichtbar.

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
| `title`, `description`, `location`, `external_url`, `categories` | direkt aus dem Feed; fehlende Felder bleiben leer |
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

```bash
# 1) Migration einspielen
supabase migration up            # oder: supabase db push

# 2) Secret setzen (echter Wert, niemals ins Repository)
supabase secrets set DIVVYDIARY_ICAL_URL="YOUR_PRIVATE_ICAL_URL"

# 3) Edge Function ausrollen
supabase functions deploy sync-divvydiary-calendar
```

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
| Gerät offline | Die App-Hülle kommt aus dem Service Worker; Termine stammen aus der Datenbank, ein Abruf schlägt sichtbar fehl, ohne etwas zu löschen |
| Zwei Läufe gleichzeitig | der zweite endet sofort mit `409`, ohne die Quelle erneut anzufragen |

Der Service Worker speichert ausschließlich die App-Hülle (`public/sw.js`) — weder
Kalenderdaten noch Adressen oder Token.
