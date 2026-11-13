-- =====================================================================
-- Päckli – Funktionsrechte nachschärfen (zweite Sicherungsschicht)
-- Einmal im Supabase SQL Editor ausführen.
--
-- Supabase gibt neu angelegte Funktionen standardmäßig für alle frei. Diese Funktionen prüfen
-- zwar innen selbst, wer sie aufruft, sollen aber für nicht angemeldete Besucher gar nicht erst
-- aufrufbar sein. Gäste brauchen nur guest_list, reserve_wish, contribute, cancel_reservation,
-- my_reservations und log_client_error.
-- =====================================================================
revoke execute on function public.allow_email(text, uuid),
  public.reserve_for_guest(uuid, int, text, boolean),
  public.contribute_for_guest(uuid, int, text),
  public.pending_access_requests(),
  public.decide_access(uuid, boolean),
  public.is_admin()
  from public, anon;
grant execute on function public.allow_email(text, uuid),
  public.reserve_for_guest(uuid, int, text, boolean),
  public.contribute_for_guest(uuid, int, text),
  public.pending_access_requests(),
  public.decide_access(uuid, boolean),
  public.is_admin()
  to authenticated;

-- Gäste-Funktionen: Gäste und Angemeldete ja, sonst niemand
revoke execute on function public.reserve_wish(text, uuid, int, text, boolean), public.contribute(text, uuid, int, text),
  public.my_reservations(text[]) from public;
grant execute on function public.reserve_wish(text, uuid, int, text, boolean), public.contribute(text, uuid, int, text),
  public.my_reservations(text[]) to anon, authenticated;
