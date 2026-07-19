# Dividenden-Tracker

Persönliche Web-App zur langfristigen, zuverlässigen Dokumentation **tatsächlich erhaltener
Dividendeneingänge** — als Ablösung einer langjährig gepflegten Numbers-Tabelle.
PWA für Mac, iPad und iPhone. Supabase Postgres als Source of Truth.

**Status:** Phase 1 (Projektgrundlage und Designsystem) ist umgesetzt. Die weiteren Phasen
folgen dem Phasenplan in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver
npm run typecheck  # TypeScript strict, ohne Emit
npm run lint       # ESLint (inkl. Geld-Verbotsliste, CALCULATION_RULES.md §8)
npm run format:check
npm test           # Vitest (Unit-Tests)
npm run build      # Produktions-Build
```

Node.js ≥ 22 wird vorausgesetzt. Alle Paketversionen sind exakt gepinnt
(siehe [ARCHITECTURE.md](ARCHITECTURE.md) §2).

## Spezifikation

| Dokument | Inhalt |
|---|---|
| [PRODUCT_SPEC.md](PRODUCT_SPEC.md) | Produktziel, Umfang, Abgrenzung, Grundsätze, Funktionsbereiche |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Tech-Stack mit Versionen, Systemarchitektur, Datenfluss, PWA |
| [DATA_MODEL.md](DATA_MODEL.md) | Tabellen, Enums, Constraints, Trigger, Views |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | Feldlexikon: Pflicht / optional / abgeleitet / technisch |
| [IMPORT_SPEC.md](IMPORT_SPEC.md) | CSV/XLSX/XLS-Import: 25 Schritte, Duplikatstufen, Bilanz, Rollback |
| [CALCULATION_RULES.md](CALCULATION_RULES.md) | Geld- und Rundungskonzept, alle Kennzahldefinitionen |
| [SECURITY_MODEL.md](SECURITY_MODEL.md) | Auth, RLS, CSP, Audit Log, Bedrohungsmodell |
| [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md) | Backupformat, Validierung, Voll-/Merge-Restore |
| [TEST_STRATEGY.md](TEST_STRATEGY.md) | Unit-, Import-, DB-, Sicherheits-, Backup-, E2E-, A11y-Tests |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | Kontrollierte Migration aus Numbers (Golden Source) |
| [UX_AND_DESIGN_SYSTEM.md](UX_AND_DESIGN_SYSTEM.md) | Designsystem, responsive Layouts, Barrierefreiheit |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | 10 Phasen mit Scope, Tests und Abnahmekriterien |
| [DECISIONS.md](DECISIONS.md) | Entscheidungsprotokoll (ADRs) und offene Punkte |
