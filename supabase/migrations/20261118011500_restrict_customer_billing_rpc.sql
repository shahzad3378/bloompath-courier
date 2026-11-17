-- The project's default function privileges include anon explicitly.
revoke all on function public.create_invoice_from_awbs(uuid,bigint[],date,numeric,text) from anon;
