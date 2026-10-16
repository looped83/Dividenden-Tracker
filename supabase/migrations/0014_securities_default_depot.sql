-- Optionale Vorschlags-/Standardzuordnung eines Unternehmens zu einem Depot
-- (DATA_MODEL.md §1): dient ausschliesslich als Vorbelegung beim Anlegen
-- eines Dividendeneingangs sowie beim Excel-Import und vereinfacht damit
-- beide Formulare. Keine erzwungene 1:1-Bindung — die tatsaechliche
-- Depot-Wahl je Zahlung bleibt unabhaengig und kann jederzeit abweichen
-- (DECISIONS.md D-006: keine Felder, die spaeter zu widerspruechlichen
-- Zuordnungen fuehren koennten, wenn dasselbe Unternehmen doch in einem
-- anderen Depot gebucht wird).
alter table securities
  add column default_depot_id uuid references depots (id);

create index securities_default_depot_idx on securities (default_depot_id)
  where default_depot_id is not null;
