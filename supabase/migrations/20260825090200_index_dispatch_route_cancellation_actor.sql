create index if not exists dispatch_runs_cancelled_by_idx
  on public.dispatch_runs (cancelled_by)
  where cancelled_by is not null;
