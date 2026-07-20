# SECURITY_MODEL.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliches Sicherheitsmodell (Planungsphase)

---

## 1. Schutzziele und Bedrohungsmodell

Schutzgüter: persönliche Finanzhistorie (Vertraulichkeit), Korrektheit und Vollständigkeit der
Zahlungsdaten (Integrität), langfristige Verfügbarkeit (Backups).

| Bedrohung | Relevanz | Primäre Gegenmaßnahme |
|---|---|---|
| Fremder Zugriff auf Daten anderer Nutzer | hoch | RLS auf jeder Tabelle, automatisiert getestet (§4, §10) |
| Direkte API-Aufrufe unter fremder/ manipulierter `user_id` | hoch | RLS + `enforce_user_id`-Trigger; `user_id` wird serverseitig aus `auth.uid()` gesetzt |
| Session-Diebstahl (XSS) | mittel | CSP ohne `unsafe-inline`-Skripte, keine Fremdskripte, Framework-Escaping, keine `dangerouslySetInnerHTML` |
| CSV-Formula-Injection (Export öffnet in Excel/Numbers) | mittel | Escaping beim Export (§9) |
| Bösartige/beschädigte Importdateien | mittel | Größen-/Typ-/Magic-Byte-Prüfung, Worker-Isolation, Timeouts (IMPORT_SPEC.md §2, §9) |
| Stiller Datenverlust durch Fehlbedienung | hoch | Kein Hard Delete, Audit Log, Import-Rollback, Backups |
| Secrets-Leck über Repo/Client | hoch | Nur Publishable Key im Client; Service-Role nie im Frontend/Repo (§5) |
| Abhängigkeits-Schwachstellen (z. B. veraltetes `xlsx`) | mittel | Gepinnte Versionen, SheetJS 0.20.x aus Herstellerregistry, `npm audit` in CI |

Nicht im Modell: Angriffe auf Supabase selbst (Vertrauensgrenze verwalteter Dienst),
physischer Gerätezugriff (OS-Verantwortung; kein zusätzlicher App-Pin in v1 — DECISIONS.md
D-014).

## 2. Authentifizierung und Session

- Supabase Auth, E-Mail + Passwort, **PKCE-Flow**; optionale spätere Erweiterung Passkeys.
- Registrierung nur mit E-Mail-Bestätigung; Passwort-Mindestlänge 12, Prüfung gegen
  Leaked-Password-Schutz von Supabase Auth.
- Session: Access-Token kurzlebig (Standard 1 h), Auto-Refresh durch supabase-js; Logout
  invalidiert Refresh-Token und **löscht den lokalen Query-Persist-Cache und alle
  Auth-Artefakte** (Finanzdaten dürfen nicht für den nächsten Gerätenutzer lesbar bleiben).
- Anmeldeversuche sind durch Supabase-Rate-Limits begrenzt; keine eigene Implementierung.
- Selbstregistrierung bleibt aktiviert (Mandantenfähigkeit), bringt aber keine Sichtbarkeit
  fremder Daten (RLS). Optional per Supabase-Konfiguration abschaltbar (privates Deployment).

## 3. Autorisierung: Row Level Security

Verbindliche Regeln:

1. `alter table … enable row level security` auf **jeder** Tabelle im Schema `public` —
   ohne Ausnahme, auch für Views gilt `security_invoker = on`.
2. Basis-Policy-Muster für fachliche Tabellen (`profiles`, `portfolios`, `depots`,
   `securities`, `dividend_payments`, `imports`, `goals`):

```sql
create policy sel on <t> for select using (user_id = auth.uid());
create policy ins on <t> for insert with check (user_id = auth.uid());
create policy upd on <t> for update using (user_id = auth.uid())
                                   with check (user_id = auth.uid());
-- DELETE: bewusst KEINE Policy auf fachlichen Tabellen (kein Hard Delete).
```

3. Abweichungen:
   - `profiles`: `id = auth.uid()` statt `user_id`; kein INSERT/DELETE über API (Anlage per Trigger).
   - `imports`: zusätzlich `delete using (user_id = auth.uid() and status in ('analyzing','pending_confirmation','discarded'))`.
   - `dividend_payments`: zusätzlich `delete using (user_id = auth.uid() and archived_at is not null)`
     — engste Ausnahme vom Hard-Delete-Verbot, nur für bereits archivierte eigene Zeilen, audit-
     protokolliert (`action = 'delete'`, siehe D-034).
   - `audit_log`: nur `select using (user_id = auth.uid())`; INSERT ausschließlich über
     `security definer`-Triggerfunktion; kein UPDATE/DELETE für niemanden (insert-only).
4. `anon`-Rolle hat keinerlei Zugriff auf `public`-Tabellen (Policies gelten für
   `authenticated`); Grants werden explizit minimal gesetzt (Least Privilege): `revoke all …
   from anon, authenticated` gefolgt von gezielten `grant select/insert/update`.
5. RPCs (`commit_import`, `rollback_import`, `restore_backup`, `archive_payment`):
   `security invoker`, geprüfter `search_path`, Eingabevalidierung in der Funktion; sie können
   RLS nicht umgehen.

## 4. Migration-Sicherheitscheckliste

Jede Migration wird nur gemerged, wenn:

- [ ] RLS aktiviert für jede neue Tabelle
- [ ] Policies für SELECT/INSERT/UPDATE (DELETE nur begründet) vorhanden
- [ ] Grants minimal (kein impliziter `public`-Zugriff)
- [ ] `user_id`-Spalte not null + FK + Trigger `enforce_user_id`
- [ ] Audit-Trigger angebunden (fachliche Tabellen)
- [ ] RLS-Tests für die neue Tabelle ergänzt (§10)

## 5. Secrets und Konfiguration

| Wert | Ablageort | Im Client? |
|---|---|---|
| `VITE_SUPABASE_URL`, Publishable/Anon Key | `.env` (gitignored), Hosting-Env, CI-Var | ja (public by design, RLS schützt) |
| Service-Role-Key | ausschließlich Supabase-Dashboard/CI-Secret für Migrationen | **niemals** |
| DB-Passwort, Access-Tokens | Passwortmanager / CI-Secrets | niemals |

- `.env*` in `.gitignore`; `.env.example` ohne Werte im Repo.
- CI-Check (z. B. gitleaks) gegen versehentliche Key-Commits.
- Es existiert kein Server-Code, der den Service-Role-Key benötigt; sollte später eine Edge
  Function nötig werden, erhält sie den Key als Supabase-Secret, nie über das Repo.

## 6. Input-Validierung

- **Doppelte Validierung**: Zod im Client (Formulare, Importzeilen, Backup-Dateien) und
  Constraints/Trigger in Postgres (CHECK, FK, UNIQUE, Längen, Wertebereiche). Der Client ist
  Komfort, die Datenbank ist die Autorität.
- Alle Texteingaben längenbegrenzt (DATA_MODEL.md); keine HTML-Interpretation von Nutzertext
  (React-Escaping; Notizen sind reiner Text).
- Datei-Uploads: nur lokal verarbeitet (kein Upload-Endpunkt); Typ-/Größen-/Struktur-Prüfung
  vor dem Parsen (IMPORT_SPEC.md §2).

## 7. Content Security Policy und Header

Auslieferung des Frontends mit:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';        # Tailwind-Injektion; keine externen Styles
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self' https://<projekt>.supabase.co;
  worker-src 'self';
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains
```

Keine externen CDNs, Fonts oder Skripte (Grundsatz 15) — alles wird gebundelt.

## 8. Audit Log

Auditiert werden Änderungen an: Dividendeneingängen, Unternehmen, Depots, Portfolios, Zielen,
Imports (Commit/Rollback), Wiederherstellungen, Profil (fachliche Felder).

Jeder Eintrag: Nutzer, Entität, Entitäts-ID, Aktion, vorherige Werte, neue Werte, Zeitpunkt,
Herkunft (`ui`/`import`/`rollback`/`restore`/`migration`) — siehe DATA_MODEL.md §3.8.

**Nicht protokolliert werden** (Ausschlussliste):

- technische Felder: `updated_at`, `created_at`, Fingerprints (nur Änderungs-Flag, nicht Wert)
- unveränderte Felder (nur Diff)
- Auth-Daten: Passwörter/Hashes, Tokens, Session-IDs (liegen ohnehin nie in `public`)
- vollständige Importdatei-Inhalte (nur Metadaten/Bericht in `imports`)

Das Audit Log ist insert-only (keine UPDATE/DELETE-Pfade, auch nicht für den Eigentümer) und
Teil des Backups.

## 9. Export-/Import-Härtung

- **CSV/Excel-Formula-Injection:** Beim Export erhalten Zellen, die mit `=`, `+`, `-`, `@`,
  Tab oder CR beginnen, ein führendes `'`; Zahlenzellen werden als Zahlen (nicht Text)
  geschrieben und sind davon ausgenommen. Beim Import werden Formeln nie ausgewertet.
- JSON-Backup-Restore validiert Format, Schemaversion und Integritätssummen, bevor irgendetwas
  geschrieben wird (BACKUP_AND_RESTORE.md §5); Fremd-`user_id`s im Backup werden ignoriert und
  durch `auth.uid()` ersetzt.
- Exportdateien enthalten keine internen Tokens oder fremde Daten (RLS-gefiltert erzeugt).

## 10. Automatisierte Sicherheitstests (Pflicht, CI-blockierend)

Mit **zwei Testnutzern A und B** gegen lokale Supabase-Instanz (Details TEST_STRATEGY.md §6):

1. A liest nur eigene Zeilen jeder Tabelle (Zählvergleich nach Seed mit Daten für A und B).
2. B kann Zeilen von A nicht lesen (`select` liefert leer, nicht Fehler-Leak).
3. INSERT mit fremder `user_id` → abgelehnt bzw. serverseitig auf `auth.uid()` gesetzt.
4. UPDATE/Archivierung fremder Zeilen → 0 betroffene Zeilen.
5. DELETE auf fachlichen Tabellen → abgelehnt (keine Policy), auch für eigene Zeilen.
6. Anfragen ohne Session (`anon`) → kein Zugriff auf irgendeine Tabelle/View/RPC.
7. Direkte PostgREST-Aufrufe (ohne App) mit manipulierten Filtern/Headern → RLS hält.
8. RPCs mit fremden IDs (`rollback_import`, `archive_payment`, `restore_backup`) → kein Effekt.
9. `audit_log`: INSERT/UPDATE/DELETE über API → abgelehnt; SELECT nur eigene Einträge.
10. Views (`v_stats_*`) liefern nur eigene Daten (security_invoker-Test).

## 11. Fehlerprotokollierung

- Produktions-Logs (Konsole) enthalten Fehlerklasse und Korrelation (Query-Key, Route), aber
  **keine Beträge, Notizen, Dateiinhalte, Tokens oder E-Mail-Adressen**.
- Kein externer Logging-/Tracking-Dienst (Grundsatz 15).
- Supabase-seitige Logs verbleiben im verwalteten Projekt (Zugriff nur Projektinhaber).

---

## Phase 4 — Import-Sicherheit (umgesetzt)

### RLS neuer Objekte

- `security_aliases`, `import_rows`: RLS aktiv, `revoke all from anon`,
  Policies `using/with check (user_id = auth.uid())`, `enforce_user_id`-Trigger.
- `commit_import`/`rollback_import` laufen als **security invoker** — RLS bleibt
  aktiv, jede eingefügte Zeile durchläuft dieselben Trigger/Checks wie eine
  manuelle Eingabe. Beide sperren den Importdatensatz per `for update` und
  prüfen `user_id = auth.uid()`; „nicht gefunden" und „keine Berechtigung" sind
  ununterscheidbar (kein Info-Leak).

### Serverseitige Kontrollen (nicht nur Frontend)

- Kontrollsummen werden in `commit_import` **erneut** aus den gespeicherten
  Zeilen berechnet und gegen `expected` geprüft; Manipulation der erwarteten
  Werte oder der Zeilenzahl → `raise` → Rollback (Test: „manipulierter
  Zeilenzahl-Erwartungswert wird komplett abgelehnt").
- `guard_import_status()` verhindert, dass ein Client `imports.status` selbst auf
  `committed`/`rolled_back` setzt (nur über die RPCs, GUC `app.import_txn`).

### Automatisiert getestete Angriffe (`tests/integration/import.test.ts`, `rls.test.ts`)

- Nutzer B sieht Import/Importzeilen/Zahlungen von Nutzer A nicht.
- Nutzer B kann den Import von Nutzer A nicht zurückrollen.
- Ein nicht angemeldeter Nutzer kann keinen Import anlegen (anon revoked).
- Ein Client kann einen Import nicht selbst als `committed` markieren.
- Ein manipulierter Erwartungswert bricht den gesamten Import ab (Atomarität).

## Dashboard (Phase 5A)

- Das Dashboard führt **keine neuen RLS-Policies** ein. Der Lesezugriff
  (`fetchDashboardPayments`) läuft über die bestehende Policy
  `dividend_payments_select_own` (`user_id = auth.uid()`); die
  Nutzertrennung ist damit serverseitig identisch zur Zahlungsliste.
- Der Ausschluss stornierter/zurückgerollter Zahlungen (`archived_at is null`)
  ist ein fachlicher Filter **innerhalb** der eigenen Daten, kein
  Sicherheitsmechanismus — die Isolation greift unabhängig davon.
- Namen und Archivstatus von Unternehmen/Depots stammen aus `securities`/`depots`,
  die ebenfalls per Owner-Policy nur eigene Zeilen liefern.
- Integrationstest `tests/integration/dashboard.test.ts` verifiziert die Isolation
  (Nutzer B sieht keine Dashboard-Daten von A) sowie Storno-Ausschluss und
  Archiv-Unternehmen-Einbeziehung auf SQL-Ebene.

## Phase 6 – Ergänzungen

**`dividend_payments` DELETE (0020).** Policy `dividend_payments_delete_own`
(`user_id = auth.uid()`) ersetzt die frühere „nur stornierte"-Bedingung. Ein
Nutzer kann ausschließlich eigene Eingänge löschen (aktiv oder storniert);
fremde IDs betreffen 0 Zeilen (kein Fehler-Leak). Die Absicherung ist
vollständig serverseitig (RLS) — clientseitige Filter sind keine
Sicherheitsmaßnahme. Die Löschung wird über den security-definer-Audit-Trigger
atomar protokolliert; UI-Bestätigung ersetzt den früheren „erst stornieren"-
Zwang als Schutz vor versehentlicher Löschung.

**`duplicate_dismissals` (0020).** RLS: select/insert/delete nur eigene Zeilen,
kein UPDATE, kein anon-Zugriff (`revoke all`, dann minimale Grants). Der
`enforce_user_id`-Trigger verhindert das Unterschieben einer fremden `user_id`.

**Massenaktionen** laufen als einzelne, jeweils RLS-geprüfte Schreibzugriffe je
Datensatz (kein globaler Bypass); fremde Datensätze/Unternehmen/Depots sind damit
nicht erreichbar.
