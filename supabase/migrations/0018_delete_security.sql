-- Eng begrenzte Ausnahme vom Hard-Delete-Verbot (Grundsatz 3, PRODUCT_SPEC.md
-- §3), analog zu dividend_payments (0013_delete_payment.sql): Nutzer koennen ein
-- Unternehmen endgueltig entfernen, aber ausschliesslich nachdem es bereits
-- archiviert wurde. Der verpflichtende Archivierungsschritt verhindert ein
-- versehentliches Loeschen aus dem aktiven Zustand heraus; die Loeschung wird im
-- Audit Log protokolliert (Grundsatz 2).
--
-- Referentielle Integritaet: dividend_payments.security_id und
-- security_aliases.security_id verweisen mit ON DELETE NO ACTION (Default) auf
-- securities. Ein Unternehmen mit noch vorhandenen Dividendeneingaengen oder
-- Import-Aliassen laesst sich daher NICHT loeschen (die Datenbank weist das mit
-- einem Fremdschluesselfehler ab). Das ist gewollt: historische Zahlungen
-- archivierter Unternehmen bleiben in allen Auswertungen sichtbar. Loeschbar sind
-- damit nur archivierte Unternehmen ohne verbleibende Historie.

grant delete on securities to authenticated;

create policy securities_delete_archived_own on securities
  for delete
  to authenticated
  using (user_id = auth.uid() and archived_at is not null);

-- Trigger neu anlegen, damit das DELETE-Ereignis mit auditiert wird
-- (audit_row_change() behandelt den DELETE-Fall seit 0013_delete_payment.sql;
-- CREATE OR REPLACE TRIGGER aendert keine Ereignisliste).
drop trigger if exists trg_securities_audit on securities;
create trigger trg_securities_audit
  after insert or update or delete on securities
  for each row execute function audit_row_change('security');
