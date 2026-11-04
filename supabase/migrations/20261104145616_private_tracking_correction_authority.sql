-- Keep elevated writes outside the exposed API schema. The private function
-- independently enforces active administrator, tenant, version and finance guards.
alter function public.correct_shipment_tracking_event(bigint,bigint,timestamptz,timestamptz,text,text,timestamp,text,text) set schema private;
revoke all on function private.correct_shipment_tracking_event(bigint,bigint,timestamptz,timestamptz,text,text,timestamp,text,text) from public,anon;
grant execute on function private.correct_shipment_tracking_event(bigint,bigint,timestamptz,timestamptz,text,text,timestamp,text,text) to authenticated;
create function public.correct_shipment_tracking_event(
 p_shipment_id bigint,p_event_id bigint,p_expected_updated_at timestamptz,
 p_expected_event_at timestamptz,p_expected_status text,p_status text,
 p_local_time timestamp without time zone,p_timezone text,p_reason text
) returns void language sql security invoker set search_path = '' as $$
 select private.correct_shipment_tracking_event(p_shipment_id,p_event_id,p_expected_updated_at,p_expected_event_at,p_expected_status,p_status,p_local_time,p_timezone,p_reason);
$$;
revoke all on function public.correct_shipment_tracking_event(bigint,bigint,timestamptz,timestamptz,text,text,timestamp,text,text) from public,anon;
grant execute on function public.correct_shipment_tracking_event(bigint,bigint,timestamptz,timestamptz,text,text,timestamp,text,text) to authenticated;
