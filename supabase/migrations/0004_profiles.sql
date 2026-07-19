-- Profil (DATA_MODEL.md §3.1). id = auth.users.id, keine eigene user_id-Spalte.
create table profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  base_currency         char(3) not null default 'EUR' check (base_currency ~ '^[A-Z]{3}$'),
  locale                text not null default 'de-DE',
  theme                 text not null default 'system' check (theme in ('light', 'dark', 'system')),
  backup_reminder_days  int not null default 30 check (backup_reminder_days between 1 and 365),
  last_backup_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table profiles enable row level security;

-- Least Privilege (SECURITY_MODEL.md §3.4): kein INSERT/DELETE fuer den
-- Client (Profile entstehen ausschliesslich per Trigger), keinerlei Zugriff
-- fuer anon.
revoke all on profiles from anon, authenticated;
grant select, update on profiles to authenticated;

create policy profiles_select_own on profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy profiles_update_own on profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Kein INSERT/DELETE ueber die API: Profile entstehen ausschliesslich durch
-- den Trigger auf auth.users (unten) und werden nie geloescht (Kaskade ueber
-- auth.users-Loeschung ist Konto-Loeschung, kein produktiver API-Pfad).

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_profiles_audit
  after insert or update on profiles
  for each row execute function audit_row_change('profile', 'id');

-- Legt bei Registrierung automatisch ein Profil an (Standardmuster fuer
-- Supabase-Projekte: Trigger auf auth.users). security definer, da der
-- aufloesende Client keine INSERT-Berechtigung auf profiles besitzt.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
