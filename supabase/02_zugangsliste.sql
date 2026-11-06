-- =====================================================================
-- Päckchen – Zugangsliste: Nur freigeschaltete E-Mail-Adressen können ein Konto anlegen.
-- Gilt nur für Eltern-Konten. Gäste brauchen kein Konto und sind nicht betroffen.
-- Bestehende Konten funktionieren weiter.
-- =====================================================================
create table public.allowed_emails (
  email    text primary key check (email = lower(trim(email)) and email like '%@%'),
  note     text,
  added_at timestamptz not null default now()
);

-- Kein Zugriff aus der App. Pflege nur im Supabase-Dashboard (Table Editor oder SQL Editor).
alter table public.allowed_emails enable row level security;

create function public.check_allowed_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_emails where email = lower(trim(new.email))) then
    raise exception 'signup_not_allowed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.check_allowed_email() from public, anon, authenticated;

create trigger before_auth_user_created before insert on auth.users
  for each row execute function public.check_allowed_email();

-- Zum Abschalten, wenn Päckchen später für alle offen sein soll:
--   drop trigger before_auth_user_created on auth.users;
