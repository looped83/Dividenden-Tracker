-- Erweitert audit_action um 'delete': Voraussetzung fuer die eng begrenzte
-- Hard-Delete-Ausnahme auf bereits archivierten dividend_payments (0013).
-- ALTER TYPE ... ADD VALUE muss vor seiner Verwendung committet sein und
-- steht deshalb in einer eigenen Migration (Postgres-Einschraenkung).
alter type audit_action add value 'delete';
