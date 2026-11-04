-- The platform event trigger calls this function; API clients must not invoke it directly.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
