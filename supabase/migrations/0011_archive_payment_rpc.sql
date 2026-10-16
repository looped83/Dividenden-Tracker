-- RPC-Geruest fuer Phase 2 (IMPLEMENTATION_PLAN.md Phase 2): Storno/Archivierung
-- eines Dividendeneingangs. security invoker (Standard) haelt RLS aktiv;
-- die explizite user_id-Bedingung sorgt zusaetzlich dafuer, dass "nicht
-- gefunden" und "keine Berechtigung" nicht unterscheidbar sind (kein Leak).
create or replace function archive_payment(p_id uuid, p_reason text default null)
returns dividend_payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row dividend_payments;
begin
  update dividend_payments
  set archived_at = now(), archive_reason = p_reason
  where id = p_id
    and user_id = auth.uid()
    and archived_at is null
  returning * into v_row;

  if not found then
    raise exception 'Eingang nicht gefunden, bereits archiviert oder keine Berechtigung'
      using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

grant execute on function archive_payment(uuid, text) to authenticated;
