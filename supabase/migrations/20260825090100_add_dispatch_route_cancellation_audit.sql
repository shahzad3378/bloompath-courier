alter table public.dispatch_runs
  add column if not exists cancelled_by uuid null references public.profiles(id) on delete restrict,
  add column if not exists cancelled_at timestamptz null;

alter table public.dispatch_runs
  drop constraint if exists dispatch_runs_timestamps_consistent;

alter table public.dispatch_runs
  add constraint dispatch_runs_timestamps_consistent check (
    (
      status = 'draft'
      and handed_over_by is null
      and handed_over_at is null
      and completed_at is null
      and cancelled_by is null
      and cancelled_at is null
    )
    or (
      status = 'handed_over'
      and handed_over_by is not null
      and handed_over_at is not null
      and completed_at is null
      and cancelled_by is null
      and cancelled_at is null
    )
    or (
      status = 'completed'
      and handed_over_by is not null
      and handed_over_at is not null
      and completed_at is not null
      and cancelled_by is null
      and cancelled_at is null
    )
    or (
      status = 'cancelled'
      and handed_over_by is null
      and handed_over_at is null
      and completed_at is null
      and cancelled_by is not null
      and cancelled_at is not null
    )
  );
