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

Add accepted decisions here.

---

# Superseded Decisions

Move replaced decisions here instead of deleting them.

Reference the decision that replaced them.
