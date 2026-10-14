-- Geprüfte Auffälligkeiten (Datenqualität, DECISIONS.md D-6-4).
--
-- Auffällige Datensätze ließen sich bisher nur ansehen, nicht abarbeiten: Ein
-- korrekter, aber ungewöhnlicher Eingang (Sonderausschüttung, aufgestockte
-- Position) stand bei jedem Aufruf wieder in der Liste. Dieselbe Lösung wie bei
-- den Dubletten (`duplicate_dismissals`, 0020): eine schmale, nutzerbezogene
-- Tabelle mit der Entscheidung „geprüft, in Ordnung" — je Eingang und Art der
-- Auffälligkeit. Es wird nichts automatisch korrigiert (D-6-5).
--
-- Anders als dort verweist die Zeile per Fremdschlüssel auf den Eingang: Wird
-- er gelöscht, geht die Entscheidung mit. Der Code ist frei als Text gehalten,
-- damit eine neue Prüfregel keine Migration braucht.
create table anomaly_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id),
  payment_id uuid not null references dividend_payments (id) on delete cascade,
  code       text not null check (code ~ '^[a-z_]{1,64}$'),
  created_at timestamptz not null default now(),
  constraint anomaly_reviews_unique unique (user_id, payment_id, code)
);

create index anomaly_reviews_payment_idx on anomaly_reviews (payment_id);

alter table anomaly_reviews enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein Zugriff für anon; ein Nutzer
-- verwaltet ausschließlich eigene Einträge. Kein UPDATE — eine Entscheidung
-- wird angelegt oder per DELETE zurückgenommen.
revoke all on anomaly_reviews from anon, authenticated;
grant select, insert, delete on anomaly_reviews to authenticated;

create policy anomaly_reviews_select_own on anomaly_reviews
  for select
  to authenticated
  using (user_id = auth.uid());

create policy anomaly_reviews_insert_own on anomaly_reviews
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy anomaly_reviews_delete_own on anomaly_reviews
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Der Eingang muss dem Nutzer gehören (wie 0030 für Asset und Depot): Ein
-- Fremdschlüssel prüft nur, dass er existiert.
create or replace function enforce_own_payment()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from dividend_payments
    where id = new.payment_id
      and user_id = coalesce(new.user_id, auth.uid())
  ) then
    raise exception 'payment_id % gehoert nicht zum eigenen Bestand', new.payment_id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger trg_anomaly_reviews_enforce_own_payment
  before insert on anomaly_reviews
  for each row execute function enforce_own_payment();

create trigger trg_anomaly_reviews_enforce_user_id
  before insert or update on anomaly_reviews
  for each row execute function enforce_user_id();
