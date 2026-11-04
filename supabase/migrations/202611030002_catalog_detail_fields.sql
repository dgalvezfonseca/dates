alter table public.date_catalog
  add column if not exists objective text not null default '',
  add column if not exists steps jsonb not null default '[]'::jsonb,
  add column if not exists enjoyment_tips text not null default '';

alter table public.date_catalog
  add constraint date_catalog_steps_shape
  check (jsonb_typeof(steps) = 'array' and (jsonb_array_length(steps) = 0 or jsonb_array_length(steps) between 3 and 6));
