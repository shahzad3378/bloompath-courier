-- Accept confirmed lowercase aliases while retaining historical service values
-- and supporting the previous deployment during rollout. New requests use lowercase.
alter table public.broadreach_bookings
  drop constraint broadreach_bookings_requested_service_check;
alter table public.broadreach_bookings
  add constraint broadreach_bookings_requested_service_check
  check (requested_service in ('ca_rateshop', 'us_rateshop', 'CA_Rateshop', 'US_Rateshop'));
