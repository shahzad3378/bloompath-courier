-- Stable system account numbers for shippers and automatic base-currency sync.

create sequence if not exists public.shipper_account_number_seq;

alter table public.shipper_business_profiles
add column if not exists account_number text;

create or replace function private.assign_shipper_account_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(new.account_number), '') is null then
    new.account_number :=
      'SHP-' || lpad(
        nextval('public.shipper_account_number_seq')::text,
        8,
        '0'
      );
  end if;

  return new;
end;
$$;

drop trigger if exists assign_shipper_account_number
on public.shipper_business_profiles;

create trigger assign_shipper_account_number
before insert on public.shipper_business_profiles
for each row
execute function private.assign_shipper_account_number();

update public.shipper_business_profiles
set account_number =
  'SHP-' || lpad(
    nextval('public.shipper_account_number_seq')::text,
    8,
    '0'
  )
where account_number is null
   or btrim(account_number) = '';

alter table public.shipper_business_profiles
alter column account_number set not null;

create unique index if not exists shipper_business_profiles_account_idx
on public.shipper_business_profiles (
  organization_id,
  account_number
);

comment on column public.shipper_business_profiles.account_number is
'System-generated customer account number shown on finance screens and exports.';

create or replace function private.sync_organization_base_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_base and new.is_active then
    update public.organization_settings
    set currency = new.currency_code,
        updated_at = now()
    where organization_id = new.organization_id
      and currency is distinct from new.currency_code;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_organization_base_currency
on public.organization_currencies;

create trigger sync_organization_base_currency
after insert or update of currency_code, is_base, is_active
on public.organization_currencies
for each row
execute function private.sync_organization_base_currency();

update public.organization_settings settings
set currency = base.currency_code,
    updated_at = now()
from public.organization_currencies base
where base.organization_id = settings.organization_id
  and base.is_base
  and base.is_active
  and settings.currency is distinct from base.currency_code;
