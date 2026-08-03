# DivvyDiary-Bestandsintegration — Sicherheitsbewertung (Phase B0)

**Stand:** 2026-08-03 · **Bezug:** SECURITY_MODEL.md, `docs/CALENDAR_INTEGRATION.md` §5

Bewertet wird eine Integration, die **noch nicht existiert**. Ziel ist, die
Auflagen festzulegen, unter denen sie gebaut werden dürfte — und die Punkte zu
benennen, die einen Bau ausschließen würden.

---

## 1. Befund im Repository

Gesucht wurde im Arbeitsbaum **und in der gesamten Git-Historie** nach
DivvyDiary-Adressen, Tokens, API-Schlüsseln, `X-API-Key`, `apiKey` und
Umgebungsvariablen.

| Prüfpunkt | Ergebnis |
|---|---|
| Zugangsdaten im Quelltext | **keine** |
| Zugangsdaten in der Git-Historie | **keine** — der einzige Fund ist ein Platzhalter mit `token=…` in `docs/CALENDAR_INTEGRATION.md` |
| Feed-URL clientseitig sichtbar | **nein.** Kein `VITE_`-Präfix; der Browser ruft nur `functions.invoke(…)` auf |
| `.gitignore` | deckt `.env`, `.env.*`, `supabase/functions/**/.env`, `supabase/.env` ab; `.env.example` bewusst ausgenommen |
| Secret in Fehlerantworten | nein — die Kalenderfunktion gibt nur Codes nach außen |
| Secret in Server-Logs | nein — Fremdfehler werden nur als Code protokolliert, weil `fetch`-Meldungen die Adresse mitführen |
| Service-Role-Key im Client | nein |

**Es besteht kein Anlass zu einer Rotation.** Die im Auftrag (§2) vorgesehene
Meldepflicht bei gefundenen Zugangsdaten greift mangels Fund nicht. Der
bestehende Umgang mit dem Kalender-Token ist die Messlatte für alles Weitere.

---

## 2. Das zentrale Risiko: der Schlüssel kann schreiben

Belegt: Derselbe `X-API-Key`, der `GET /session` erlaubt, erlaubt auch
`POST /portfolios/{id}/import`. Eine Beschränkung auf Lesen ist nicht bekannt.

| | Kalender-Token (heute) | API-Schlüssel (geplant) |
|---|---|---|
| Übergabe | in der URL | Kopfzeile `X-API-Key` |
| Rechte | nur Lesen (ein Kalenderfeed) | **Lesen und Schreiben** |
| Schaden bei Verlust | fremde Einsicht in kommende Termine | **fremde Einsicht in den Bestand plus Schreibzugriff auf das DivvyDiary-Depot** |
| Aufbewahrung | Supabase-Secret | Supabase-Secret, **getrennt** |
| Widerruf | Feed in DivvyDiary neu erzeugen | Schlüssel in DivvyDiary neu erzeugen |

**Folgerungen, sämtlich verbindlich:**

1. Eigenes Secret `DIVVYDIARY_API_KEY`, **getrennt** von `DIVVYDIARY_ICAL_URL`.
   Zwei Geheimnisse mit verschiedenen Rechten gehören nicht in eine Variable —
   und ein Widerruf des einen darf das andere nicht mitnehmen.
2. Der Schlüssel wird **ausschließlich** in der Edge Function gelesen
   (`Deno.env.get`) und ausschließlich in der Kopfzeile an
   `api.divvydiary.com` gesendet.
3. **Kein `VITE_`-Präfix.** Ein `VITE_DIVVYDIARY_API_KEY` landete im
   Browser-Bundle und damit auf GitHub Pages — der Schlüssel wäre öffentlich und
   schreibfähig. Das ist der einzige Fehler in dieser Integration, der sofort
   und irreversibel wirkt.
4. Der API-Client der Edge Function darf technisch **nur GET** senden. Der
   Methodenwächter aus `scripts/divvydiary-discovery/request.ts` wandert
   mitsamt seinen Tests dorthin. Ein schreibender Aufruf soll nicht „vermieden"
   werden, er soll **unmöglich** sein.
5. Weiterleitungen werden **nicht** blind verfolgt: `redirect: "manual"`, und
   ein fremdes Ziel wird abgelehnt. Sonst genügte eine Umleitung, um den
   Schlüssel an einen anderen Server zu schicken.
6. Rotation wird dokumentiert (`supabase secrets set …` plus Neuausrollen), und
   das Vorgehen bei Verdacht steht in der Betriebsdokumentation von B1.

---

## 3. Bestandsdaten sind sensibler als Termindaten

Der Kalender-Cache verrät, **dass** jemand Verizon hält. Ein Bestands-Cache
verrät **wie viel**, **zu welchem Kurs gekauft** und **wie groß das Vermögen
insgesamt** ist. Der Schaden eines Lecks ist eine andere Größenordnung.

| Auflage | Umsetzung |
|---|---|
| RLS auf jeder neuen Tabelle | `using (user_id = auth.uid())`, `revoke all from anon, authenticated`, dann nur `grant select` |
| Kein Schreibrecht für `authenticated` | Schreiben nur mit `service_role`, jede Anweisung zusätzlich auf die ermittelte `user_id` gefiltert |
| Kein DELETE-Grant, auch nicht für `service_role` | entfallene Positionen werden deaktiviert; Least Privilege wie bei den Kalendertabellen |
| Keine Finanzwerte im Log | Zähler und Fehlercodes ja; Stückzahlen, Beträge, ISIN-Listen nein |
| Kein Rohabzug in der Datenbank | statt `raw_data` nur eine Prüfsumme (`source_hash`) |
| Kein Bestand im Service-Worker-Cache | `public/sw.js` speichert weiterhin nur die App-Hülle (SECURITY_MODEL.md §7.1) |
| Kein Bestand im Backup-Export? | **zu entscheiden in B1.** Empfehlung: Der Cache gehört **nicht** in die Sicherung — er ist reproduzierbar, aber der Export verlässt das System und liegt danach ungeschützt beim Nutzer |

---

## 4. Zugriffsschutz der Edge Function

| Kontrolle | Festlegung |
|---|---|
| Authentifizierung | `verify_jwt = true` in `config.toml` — die Plattform sperrt vor dem eigenen Code |
| Identität | ausschließlich `auth.getUser()` aus dem geprüften JWT; eine vom Client übergebene `user_id` wird **nie** verwendet |
| Autorisierung | jede Datenbankanweisung filtert zusätzlich explizit auf diese Kennung (service_role umgeht RLS) |
| Eingaben | die Funktion nimmt keine Parameter entgegen, die den Datenzugriff steuern; höchstens ein optionales `portfolioId`, das gegen die eigenen Depots geprüft wird |
| CORS | wie beim Kalender `access-control-allow-origin: *`. Vertretbar, weil `verify_jwt` davor greift und die Antwort keine Geheimnisse enthält. **Besser**, sobald die Herkunft feststeht: die konkrete Pages-Adresse |
| Antwort an den Client | nur Zähler, Status und eine vorformulierte Meldung — nie eine Fremdfehlermeldung, nie ein Adressfragment |
| Parallelläufe | `claim_portfolio_sync`; zweiter Lauf → `409`, ohne die Quelle anzufragen |
| Größen- und Zeitgrenzen | 15 s je Aufruf, harte Obergrenze für die Antwortgröße — schützt vor einer entarteten Gegenstelle |

---

## 5. Mehrbenutzerbetrieb

Heute nutzt die Anwendung ein Konto. Beim Wachsen entsteht ein Problem, das
jetzt schon zu bedenken ist:

**Ein anwendungsweites `DIVVYDIARY_API_KEY` zeigt auf genau ein
DivvyDiary-Konto.** Bei zwei Nutzern sähe der zweite den Bestand des ersten. Das
ist kein RLS-Problem — die Zeilen wären korrekt getrennt —, sondern ein
Zuordnungsproblem an der Quelle.

| Betriebsart | Empfehlung |
|---|---|
| Ein Nutzer (heute) | ein Secret ist vertretbar; die Funktion schreibt auf die Kennung aus dem JWT |
| Mehrere Nutzer | **je Nutzer ein eigener Schlüssel**, verschlüsselt in einer eigenen Tabelle (Supabase Vault) — niemals im Klartext, niemals für andere lesbar |

Die Struktur aus der Zielarchitektur (`user_id` auf jeder Tabelle, `provider`
als Spalte) hält diesen Wechsel offen, ohne ihn heute zu bauen. Vorher darf die
Integration nicht für weitere Nutzer freigegeben werden.

**Vermischung verschiedener Depots** ist durch den Unique-Schlüssel
`(user_id, external_portfolio_id, …)` ausgeschlossen: Eine Position kann nicht
in zwei Depots dieselbe Zeile belegen.

---

## 6. Entwicklung und CI/CD

| Bereich | Auflage |
|---|---|
| Lokale Entwicklung | Schlüssel nur in einer nicht versionierten `.env` für `supabase functions serve`; `.env.example` enthält nur den leeren Namen mit Warnhinweis |
| Prüfwerkzeug | `scripts/divvydiary-discovery/` liest den Schlüssel **nur** aus der Umgebung, maskiert ihn in jeder Ausgabe und schreibt keine Depotdaten in eine Datei |
| CI | Der Schlüssel gehört **nicht** in GitHub Actions. Der Deploy-Workflow rollt Funktionen aus; Secrets liegen bei Supabase. Es gibt keinen Testfall, der den echten Dienst braucht |
| Tests | keiner der 81 Discovery-Tests spricht mit dem Netz; alle nutzen ein eingereichtes `fetch` |
| Fehlermeldungen | eigene Datenbankfehler im Klartext (sie benennen die fehlende Spalte), Fremdfehler nur als Code — die Regel der Kalenderfunktion gilt unverändert |

---

## 7. Zusicherungen, die die fertige Lösung einhalten muss

Diese Liste ist die Abnahmeprüfung für B1:

1. Kein Secret im Frontend-Bundle.
2. Kein Secret in Git — weder im Arbeitsbaum noch in der Historie.
3. Kein Secret in Browser-Logs oder einer Netzwerkantwort an den Client.
4. Kein Secret in normalen Server-Logs.
5. Keine ungeschützte Edge Function (`verify_jwt = true`, geprüft).
6. Keine Daten eines anderen Nutzers — durch RLS **und** durch den expliziten
   Filter im serverseitigen Schreibpfad, beides mit Integrationstests belegt.
7. Kein schreibender Aufruf an DivvyDiary — technisch blockiert, nicht bloß
   unterlassen, und mit einem Test belegt.
8. Keine Finanzwerte in Logs oder Fehlermeldungen.
9. Kein DELETE auf den Bestandstabellen — auch nicht für `service_role`.
10. Keine automatische Zuordnung eines Wertpapiers über den Namen.

---

## 8. Gesamtbewertung

| Bereich | Bewertung | Begründung |
|---|---|---|
| Secret-Handling (Muster vorhanden) | **grün** | Der Kalender zeigt, dass das Projekt es kann |
| Rechte des Schlüssels | **gelb** | Schreibfähig, keine Trennung bekannt — beherrschbar, aber eine bewusste Entscheidung wert |
| Zugriffsschutz der Funktion | **grün** | `verify_jwt`, JWT-Identität, service_role mit explizitem Filter |
| RLS und Datenmodell | **grün** | Muster steht, Least Privilege durchgehend |
| Sensibilität der Daten | **gelb** | Bestandsdaten sind wertvoller als alles bisher Gespeicherte |
| Mehrbenutzerfähigkeit | **gelb** | Ein anwendungsweiter Schlüssel skaliert nicht; Struktur hält den Wechsel offen |
| Rechtliche Zulässigkeit der Nutzung | **unbekannt** | keine auffindbaren Nutzungsbedingungen für Drittanwendungen |
| **Gesamt** | **gelb — baubar unter Auflagen** | Kein Sicherheitsgrund spricht gegen die Integration. Die Auflagen aus §2, §3 und §7 sind nicht verhandelbar |

Ein Sicherheits-Veto gibt es nicht. Der offene Punkt bleibt fachlich: Ob ein
lesender Positionsendpunkt überhaupt existiert
([Bericht §21, Gate 1](./divvydiary-api-discovery.md#21-empfehlung-conditional-go)).
