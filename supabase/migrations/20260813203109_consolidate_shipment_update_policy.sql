-- Harden fourth-attempt updates and keep a single permissive shipment UPDATE policy.

create or replace function private.guard_fourth_attempt_authorization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fourth_attempt_authorized is distinct from old.fourth_attempt_authorized
    or new.fourth_attempt_authorized_at is distinct from old.fourth_attempt_authorized_at
    or new.fourth_attempt_authorized_by is distinct from old.fourth_attempt_authorized_by then
    if old.fourth_attempt_authorized and not new.fourth_attempt_authorized then
      if new.delivery_attempt_count <> 4 or new.status <> 'return_initiated' then
        raise exception 'Fourth-attempt authorization cannot be removed.';
      end if;
      return new;
    end if;

    if (
      to_jsonb(new) - array[
        'fourth_attempt_authorized',
        'fourth_attempt_authorized_at',
        'fourth_attempt_authorized_by',
        'updated_at'
      ]
    ) is distinct from (
      to_jsonb(old) - array[
        'fourth_attempt_authorized',
        'fourth_attempt_authorized_at',
        'fourth_attempt_authorized_by',
        'updated_at'
      ]
    ) then
      raise exception 'Only fourth-attempt authorization may be changed.';
    end if;

    if not new.fourth_attempt_authorized
      or old.fourth_attempt_authorized
      or old.status <> 'return_initiated'
      or old.delivery_attempt_count <> 3 then
      raise exception 'This AWB is not eligible for a fourth attempt.';
    end if;

    if not (
      (select private.can_manage_shipments())
      or old.shipper_id = (select auth.uid())
      or (old.shipper_id is null and old.created_by = (select auth.uid()))
    ) then
      raise exception 'You cannot authorize this shipment.';
    end if;

    new.fourth_attempt_authorized := true;
    new.fourth_attempt_authorized_at := now();
    new.fourth_attempt_authorized_by := (select auth.uid());
  end if;

  return new;
end;
$$;

revoke all on function private.guard_fourth_attempt_authorization() from public;

drop policy if exists "internal users can update shipments" on public.shipments;
drop policy if exists "shippers can authorize fourth attempt" on public.shipments;
drop policy if exists "authorized users can update shipments" on public.shipments;

create policy "authorized users can update shipments"
on public.shipments
for update
to authenticated
using (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or (
      status = 'return_initiated'
      and delivery_attempt_count = 3
      and not fourth_attempt_authorized
      and (
        shipper_id = (select auth.uid())
        or (shipper_id is null and created_by = (select auth.uid()))
      )
    )
  )
)
with check (
  organization_id = (select private.current_organization_id())
  and (
    (select private.can_manage_shipments())
    or (
      fourth_attempt_authorized
      and (
        shipper_id = (select auth.uid())
        or (shipper_id is null and created_by = (select auth.uid()))
      )
    )
  )
);
