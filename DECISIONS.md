# DECISIONS.md

This file records durable project decisions that future work must respect.

It complements `CLAUDE.md`:

- `CLAUDE.md` defines how work should be approached.
- `DECISIONS.md` records what this project has already decided.

Only document decisions that materially affect future work.

---

# When to Add a Decision

Add an entry when the decision:

- affects future implementation choices
- has meaningful alternatives
- creates a lasting constraint or trade-off
- would otherwise be discussed again
- is important for product, architecture, data, UI/UX, security, performance, infrastructure or tooling

Do not document:

- minor implementation details
- temporary task notes
- obvious conventions
- short-lived workarounds
- decisions already documented elsewhere

Keep entries concise and practical.

---

# Decision Template

## ADR-000: Title

**Status:** Proposed | Accepted | Superseded | Deprecated  
**Scope:** Product | Architecture | Data | UI/UX | Security | Performance | Infrastructure | Tooling

### Decision

State what was decided in one clear paragraph.

### Why

Explain why this option was selected.

### Alternatives

List only meaningful alternatives and briefly explain why they were not chosen.

### Consequences

**Benefits**

- Main benefits

**Trade-offs**

- Accepted limitations or costs

### Guardrails

- Rules future work must respect

### Revisit When

- Conditions that justify reconsidering the decision

---

# Active Decisions

## ADR-001: Historie vollständig im Client, Schwelle bei 10.000 Zahlungen

**Status:** Accepted  
**Scope:** Performance

### Decision

Dividendenliste, Übersicht und Statistik laden die **gesamte** aktive Historie einmal in den
Client (`fetchAllPayments` bzw. `fetchDashboardPayments`, jeweils in 1.000er-Seiten) und
filtern, sortieren, aggregieren und blättern dort. Das bleibt so, solange ein Konto weniger als
**10.000 Zahlungen** führt.

### Rationale

Die Auswertungen sind decimal-genau und laufen über `lib/money`/`lib/statistics`; sie im Client
zu halten hält Zahl und Wahrheit an einer Stelle (ARCHITECTURE.md §4.4/§4.5) und macht
Jahreswechsel, Filter und Drill-downs ohne Netzrunde möglich. Bei 1.439 Zahlungen (heutige
Kontrollmenge) ist das unmerklich.

### Trade-offs

- Übertragung und Verarbeitung wachsen linear mit der Historie; jede Zahlung wird beim Laden zu
  einem `Money`-Objekt.
- Liste und Auswertungen holen die Historie unter zwei Query-Keys getrennt (vollständige Zeilen
  bzw. schlanke Projektion) — bei einem Wechsel zwischen den Bereichen also zweimal.

### Guardrails

- Kein serverseitiges Filtern/Paginieren einführen, solange die Schwelle nicht erreicht ist —
  es zerteilte die Auswertungen ohne Not.
- Bei Überschreiten in dieser Reihenfolge vorgehen: (1) beide Abfragen auf **eine** schlanke
  Projektion vereinheitlichen, (2) Aggregate serverseitig vorrechnen (RPC), (3) erst danach
  Liste serverseitig filtern und blättern.

### Revisit When

- Ein Konto überschreitet 10.000 aktive Zahlungen, **oder**
- das Laden der Liste dauert auf einem iPhone spürbar länger als eine Sekunde, **oder**
- die Übertragung je Aufruf überschreitet rund 2 MB.

---

# Superseded Decisions

Move replaced decisions here instead of deleting them.

Reference the decision that replaced them.
