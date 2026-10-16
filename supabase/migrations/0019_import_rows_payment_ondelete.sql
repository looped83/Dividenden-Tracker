-- Endgueltiges Loeschen eines Dividendeneingangs (0013_delete_payment.sql) war
-- fuer importierte Zahlungen unmoeglich: die Herkunftszeile
-- import_rows.payment_id verweist mit ON DELETE NO ACTION (Default) auf
-- dividend_payments, sodass das Loeschen mit
-- "violates foreign key constraint import_rows_payment_id_fkey" abgewiesen wurde.
--
-- import_rows ist ein reiner Provenance-/Audit-Datensatz der Importzeile. Wird
-- die daraus entstandene Zahlung spaeter (nach Archivierung) endgueltig
-- geloescht, soll die Herkunftszeile als Historie erhalten bleiben, aber ihren
-- Verweis verlieren. Daher ON DELETE SET NULL statt NO ACTION.
--
-- Referentielle Aktionen laufen systemseitig und sind nicht an die
-- Tabellenrechte/RLS von import_rows gebunden (dort ist fuer authenticated nur
-- select/insert gewaehrt) — das Nullsetzen funktioniert somit trotzdem.

alter table import_rows
  drop constraint import_rows_payment_id_fkey;

alter table import_rows
  add constraint import_rows_payment_id_fkey
    foreign key (payment_id) references dividend_payments (id) on delete set null;
