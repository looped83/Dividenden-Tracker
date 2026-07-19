# DATA_MODEL.md — Dividend Tracker

Stand: 2026-07-19 · Status: Verbindliches Datenmodell (Planungsphase)

Alle Objekte liegen im Schema `public`, werden ausschließlich über SQL-Migrationen erzeugt und
sind vollständig durch Row Level Security geschützt (SECURITY_MODEL.md). Feldbedeutungen und
Pflichtfeld-Klassifikation: DATA_DICTIONARY.md. Typ- und Rundungsregeln: CALCULATION_RULES.md.

---

## 1. Entitäten und Beziehungen

```
auth.users 1──1 profiles
auth.users 1──n portfolios 1──n depots
auth.users 1──n securities
auth.users 1──n imports
auth.users 1──n goals
auth.users 1──n audit_log (insert-only)

dividend_payments n──1 securities
dividend_payments n──1 depots
dividend_payments n──0..1 imports
```

Grundsätze:

- **Kein Hard Delete** auf fachlichen Tabellen: Soft Delete über `archived_at`; es existieren
  keine DELETE-Policies (Ausnahme: `imports` im Status `draft/analyzing`, siehe §3.6).
- Jede fachliche Tabelle trägt `user_id uuid not null references auth.users(id)`.
- `created_at`/`updated_at` werden durch Trigger gepflegt, nie vom Client gesetzt.
- Alle Änderungen an fachlichen Tabellen erzeugen per Trigger Einträge in `audit_log`.

---

## 2. Enums

```sql
create type payment_type as enum (
  'regular',        -- reguläre Dividende
  'special',        -- Sonderdividende
  'correction',     -- Korrekturbuchung (Betrag i. d. R. negativ oder ausgleichend)
  'cancellation',   -- Storno einer früheren Zahlung
  'refund',         -- Rückerstattung (z. B. Quellensteuer)
  'other'           -- sonstige Ausschüttung
);

create type payment_source as enum ('manual', 'csv_import', 'excel_import', 'restore');

create type import_status as enum (
  'analyzing',            -- Datei clientseitig in Analyse (Metadatensatz angelegt)
  'pending_confirmation', -- Analyse abgeschlossen, wartet auf Nutzerbestätigung
  'committed',            -- atomar gespeichert
  'rolled_back',          -- vollständig zurückgerollt
  'discarded'             -- vor Bestätigung verworfen (keine Daten erzeugt)
);

create type data_quality as enum ('ok', 'incomplete', 'needs_review');

create type goal_type as enum (
  'net_year', 'gross_year', 'rolling_12m', 'avg_month_net', 'long_term'
);

create type audit_action as enum (
  'insert', 'update', 'archive', 'unarchive',
  'import_commit', 'import_rollback', 'restore'
);

create type audit_origin as enum ('ui', 'import', 'rollback', 'restore', 'migration');
```

---

## 3. Tabellen

### 3.1 `profiles` — Nutzerprofil und Einstellungen

```sql
create table profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  base_currency         char(3) not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  locale                text not null default 'de-DE',
  theme                 text not null default 'system' check (theme in ('light','dark','system')),
  backup_reminder_days  int  not null default 30 check (backup_reminder_days between 1 and 365),
  last_backup_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
```

Angelegt per Trigger auf `auth.users` (on insert). `base_currency` ist nur änderbar, solange
keine Zahlungen existieren (Trigger-Prüfung; DECISIONS.md D-002).

### 3.2 `portfolios` — optionale Depot-Gruppierung

```sql
create table portfolios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  name        text not null check (length(trim(name)) between 1 and 100),
  note        text check (length(note) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, name)
);
```

### 3.3 `depots`

```sql
create table depots (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  portfolio_id  uuid references portfolios(id),
  name          text not null check (length(trim(name)) between 1 and 100),
  broker        text check (length(broker) <= 100),
  base_currency char(3) not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  note          text check (length(note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (user_id, name)
);
```

### 3.4 `securities` — Wertpapiere/Unternehmen

```sql
create table securities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  name          text not null check (length(trim(name)) between 1 and 200),
  ticker        text check (ticker ~ '^[A-Z0-9 .\-]{1,20}$'),
  isin          char(12) check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  wkn           char(6)  check (wkn ~ '^[A-Z0-9]{6}$'),
  country       char(2)  check (country ~ '^[A-Z]{2}$'),      -- ISO 3166-1 alpha-2
  sector        text check (length(sector) <= 100),
  currency      char(3)  check (currency ~ '^[A-Z]{3}$'),      -- übliche Ausschüttungswährung
  note          text check (length(note) <= 5000),
  data_quality  data_quality not null default 'ok',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create unique index securities_user_isin_key on securities(user_id, isin)
  where isin is not null and archived_at is null;
create unique index securities_user_name_key on securities(user_id, lower(name))
  where archived_at is null;
```

ISIN-Prüfziffer (Luhn) wird clientseitig validiert; DB prüft nur das Format (D-008).

### 3.5 `dividend_payments` — Kerntabelle

```sql
create table dividend_payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id),
  security_id          uuid not null references securities(id),
  depot_id             uuid not null references depots(id),

  -- Zahlung (Basiswährung, final gerundet auf 2 Nachkommastellen)
  pay_date             date not null check (pay_date between date '1970-01-01' and current_date),
  gross_amount         numeric(14,2) not null,
  net_amount           numeric(14,2) not null,
  withholding_tax      numeric(14,2) not null default 0,
  domestic_tax         numeric(14,2) not null default 0,
  solidarity_surcharge numeric(14,2),
  church_tax           numeric(14,2),
  fees                 numeric(14,2),

  -- Originalwerte (Fremdwährung), null wenn Originalwährung = Basiswährung
  original_currency    char(3) not null check (original_currency ~ '^[A-Z]{3}$'),
  original_gross       numeric(18,6),
  original_net         numeric(18,6),
  fx_rate              numeric(18,8) check (fx_rate > 0),

  -- Mengen
  quantity             numeric(18,6) check (quantity > 0),
  amount_per_share     numeric(18,8) check (amount_per_share >= 0),

  -- Klassifikation & Herkunft
  payment_type         payment_type not null default 'regular',
  source               payment_source not null,
  import_id            uuid references imports(id),
  source_file_name     text,
  source_row_number    int check (source_row_number >= 1),
  row_fingerprint      text,            -- SHA-256, exakter Zeilen-Fingerprint (Stufe 2)
  business_fingerprint text not null,   -- SHA-256, fachlicher Fingerprint (Stufe 3)

  -- Dokumentation
  note                 text check (length(note) <= 5000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  archived_at          timestamptz,
  archive_reason       text,

  -- Konsistenz
  constraint sign_consistency check (
    (payment_type in ('regular','special','refund','other') and gross_amount >= 0 and net_amount >= 0)
    or payment_type in ('correction','cancellation')
  ),
  constraint import_fields_consistency check (
    (source in ('csv_import','excel_import'))
      = (import_id is not null and source_row_number is not null and row_fingerprint is not null)
  ),
  constraint fx_fields_consistency check (
    (original_gross is null and original_net is null and fx_rate is null)
    or (original_gross is not null and original_net is not null and fx_rate is not null)
  )
);

create index dp_user_date_idx      on dividend_payments(user_id, pay_date desc);
create index dp_user_security_idx  on dividend_payments(user_id, security_id, pay_date desc);
create index dp_user_depot_idx     on dividend_payments(user_id, depot_id, pay_date desc);
create index dp_user_import_idx    on dividend_payments(user_id, import_id) where import_id is not null;
create index dp_business_fp_idx    on dividend_payments(user_id, business_fingerprint);
create index dp_row_fp_idx         on dividend_payments(user_id, row_fingerprint) where row_fingerprint is not null;
create index dp_active_idx         on dividend_payments(user_id, pay_date desc) where archived_at is null;
```

**Bewusst kein** Unique Constraint auf `business_fingerprint`: identische echte Zahlungen sind
fachlich möglich (z. B. zwei Tranchen am selben Tag). Duplikate werden im Importprozess erkannt
und vom Nutzer entschieden (Grundsatz 4, IMPORT_SPEC.md §7); die Datenbank erzwingt hier keine
stillschweigende Ablehnung. Ein Unique Constraint existiert dagegen auf
`(import_id, source_row_number)`:

```sql
create unique index dp_import_row_key on dividend_payments(import_id, source_row_number)
  where import_id is not null;
```

Die betragliche Invariante `net = gross − Steuern − Gebühren (±0,02 Toleranz)` wird als
CHECK-Constraint hinterlegt (genaue Formel: CALCULATION_RULES.md §4).

### 3.6 `imports` — Importhistorie und -bericht

```sql
create table imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id),
  file_name        text not null,
  file_hash        char(64) not null,          -- SHA-256 hex der Rohdatei
  file_size_bytes  bigint not null check (file_size_bytes > 0),
  file_type        text not null check (file_type in ('csv','xlsx','xls')),
  sheet_name       text,                        -- gewähltes Tabellenblatt (Excel)
  status           import_status not null default 'analyzing',
  column_mapping   jsonb,                       -- Spaltenzuordnung inkl. manueller Korrekturen
  detected_formats jsonb,                       -- Datums-/Zahlenformat, Encoding, Trennzeichen
  row_balance      jsonb,                       -- Importbilanz (IMPORT_SPEC.md §8)
  row_report       jsonb,                       -- Klassifikation JEDER Zeile inkl. Ablehnungsgrund
  checksums        jsonb,                       -- Kontrollsummen (Summe brutto/netto, Anzahl)
  created_at       timestamptz not null default now(),
  committed_at     timestamptz,
  rolled_back_at   timestamptz
);

create index imports_user_hash_idx on imports(user_id, file_hash);
```

DELETE ist nur für Status `analyzing`/`pending_confirmation`/`discarded` erlaubt (Aufräumen
abgebrochener Analysen); `committed`/`rolled_back` sind unlöschbare Historie.

### 3.7 `goals`

```sql
create table goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id),
  goal_type     goal_type not null,
  year          int check (year between 1990 and 2100),   -- für Jahresziele
  target_year   int check (target_year between 1990 and 2100), -- für long_term
  target_amount numeric(14,2) not null check (target_amount > 0),
  currency      char(3) not null default 'EUR',
  note          text check (length(note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  constraint goal_year_consistency check (
    (goal_type in ('net_year','gross_year') and year is not null and target_year is null)
    or (goal_type = 'long_term' and target_year is not null and year is null)
    or (goal_type in ('rolling_12m','avg_month_net') and year is null and target_year is null)
  )
);

create unique index goals_unique_active on goals(user_id, goal_type, coalesce(year, 0))
  where archived_at is null;
```

Ziele referenzieren keinerlei Zahlungsdaten (strikte Trennung Ist/Ziel, Grundsatz 8).

### 3.8 `audit_log` — insert-only

```sql
create table audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  entity_type text not null check (entity_type in
                ('dividend_payment','security','depot','portfolio','goal','import','profile')),
  entity_id   uuid not null,
  action      audit_action not null,
  old_values  jsonb,        -- null bei insert
  new_values  jsonb,        -- null bei archive
  origin      audit_origin not null,
  created_at  timestamptz not null default now()
);

create index audit_entity_idx on audit_log(user_id, entity_type, entity_id, created_at desc);
```

- Befüllung ausschließlich durch `SECURITY DEFINER`-Triggerfunktionen (Client kann nicht
  schreiben; RLS: nur SELECT für den Eigentümer, kein INSERT/UPDATE/DELETE über die API).
- `old_values`/`new_values` enthalten nur die **geänderten fachlichen Felder** (Diff), keine
  technischen Felder (`updated_at`, Fingerprints) und keine Fremd-IDs ohne Änderung
  (SECURITY_MODEL.md §8 definiert die Ausschlussliste).

---

## 4. Trigger und Funktionen

| Objekt | Zweck |
|---|---|
| `set_updated_at()` | `updated_at = now()` bei jedem UPDATE (alle fachlichen Tabellen) |
| `enforce_user_id()` | erzwingt `user_id = auth.uid()` bei INSERT (Defense in Depth zusätzlich zu RLS) |
| `audit_row_change()` | schreibt Diff nach `audit_log` (INSERT/UPDATE inkl. Archivierung) |
| `protect_payment_immutables()` | verbietet UPDATE von `id, user_id, source, import_id, source_row_number, row_fingerprint, created_at`; verbietet UPDATE archivierter Zeilen außer `unarchive` |
| `recompute_business_fingerprint()` | berechnet `business_fingerprint` serverseitig neu bei INSERT/UPDATE relevanter Felder (eine Wahrheit, CALCULATION_RULES.md §5) |
| `profiles_on_signup()` | legt Profil bei Registrierung an |
| `commit_import(import_id, rows jsonb)` | RPC: validiert Bilanz, fügt Zahlungen + fehlende Stammdaten atomar ein, setzt Status `committed` |
| `rollback_import(import_id)` | RPC: archiviert alle Zahlungen des Imports (`origin='rollback'`), archiviert mitangelegte Securities/Depots ohne verbleibende aktive Zahlungen, Status `rolled_back` |
| `restore_backup(payload jsonb, mode text)` | RPC: BACKUP_AND_RESTORE.md §5 |
| `archive_payment(id, reason)` | RPC: setzt `archived_at`, `archive_reason`, Audit-Eintrag |

Alle RPCs laufen mit `security invoker` (RLS aktiv); nur die Audit-Triggerfunktion ist
`security definer` mit fest gesetztem `search_path`.

---

## 5. Views für Statistik (Lesezugriff, RLS-transparent)

| View | Inhalt |
|---|---|
| `v_active_payments` | `dividend_payments where archived_at is null` — Basis aller Statistiken |
| `v_stats_monthly` | Summen brutto/netto/Steuern je (user, Jahr, Monat) |
| `v_stats_yearly` | Summen je (user, Jahr) + Zahlungsanzahl |
| `v_stats_by_security` | Summen/Anzahl je Wertpapier |
| `v_stats_by_depot` | Summen/Anzahl je Depot |

Views sind `security_invoker = on` (Postgres 15+), damit RLS der Basistabellen greift.
Formeldefinitionen: CALCULATION_RULES.md §6; Abgleichtests gegen `lib/statistics`:
TEST_STRATEGY.md §4.

---

## 6. Migrationsdisziplin

1. Jede Schemaänderung = eigene Migration mit sprechendem Namen (`0007_add_goals.sql`).
2. Checkliste je Migration: RLS aktiviert? Policies für SELECT/INSERT/UPDATE/(DELETE)?
   Audit-Trigger? `updated_at`-Trigger? Indizes? Typen regeneriert? Tests ergänzt?
3. Migrationen sind vorwärtsgerichtet; Korrekturen erfolgen durch neue Migrationen, nie durch
   Editieren bereits angewendeter Dateien.
4. CI wendet alle Migrationen auf eine leere und auf eine mit Seed-Daten befüllte Datenbank an.
