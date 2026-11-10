-- =====================================================================
-- Päckli – Datenbank-Tests: Jede Prüfung bricht bei einem Fehler mit klarer Meldung ab.
-- =====================================================================
\set ON_ERROR_STOP 1
create function pg_temp.pruefe(ok boolean, was text) returns void language plpgsql as
  $$ begin if not coalesce(ok, false) then raise exception 'FEHLGESCHLAGEN: %', was; end if; raise notice 'OK: %', was; end $$;
create function pg_temp.als(uid text) returns void language plpgsql as $$
begin
  if uid is null then execute 'reset role'; perform set_config('request.jwt.claim.sub', '', false);
  elsif uid = 'anon' then execute 'set role anon'; perform set_config('request.jwt.claim.sub', '', false);
  else execute 'set role authenticated'; perform set_config('request.jwt.claim.sub', uid, false); end if;
end $$;

insert into allowed_emails values ('julia@test.de'), ('markus@test.de'), ('fremd@test.de');
insert into auth.users values ('11111111-1111-1111-1111-111111111111', 'julia@test.de'),
  ('22222222-2222-2222-2222-222222222222', 'markus@test.de'), ('33333333-3333-3333-3333-333333333333', 'fremd@test.de');
do $$ begin insert into auth.users values ('44444444-4444-4444-4444-444444444444', 'nicht@freigeschaltet.de');
  raise exception 'FEHLGESCHLAGEN: nicht freigeschaltete Adresse konnte sich registrieren'; exception when insufficient_privilege then raise notice 'OK: Zugangsliste blockiert fremde Adressen'; end $$;

-- Julia legt eine Liste mit Wünschen an
select pg_temp.als('11111111-1111-1111-1111-111111111111');
select id as liste from create_list('Emmas Geburtstag', 'Emma', 'birthday', (current_date + 30)) \gset
select id as liste2 from create_list('Leons Liste') \gset
select set_config('test.liste2', :'liste2', false) is not null as x \gset
insert into wishes (list_id, title, quantity, priority, created_by) values
  (:'liste', 'Fahrrad', 1, 'heart', auth.uid()), (:'liste', 'Hörspiele', 3, 'nice', auth.uid());
select create_invite(:'liste') as einladung \gset
select pg_temp.als(null);
select guest_token as gast from lists where id = :'liste' \gset
select id as rad from wishes where title = 'Fahrrad' \gset
select id as hoer from wishes where title = 'Hörspiele' \gset

-- Fremde sehen nichts
select pg_temp.als('33333333-3333-3333-3333-333333333333');
select pg_temp.pruefe((select count(*) from lists) = 0 and (select count(*) from wishes) = 0, 'Fremdes Konto sieht keine Listen und Wünsche');
select pg_temp.als('anon');
select pg_temp.pruefe((select count(*) from wishes) = 0, 'Gäste haben keinen direkten Tabellenzugriff');

-- Einladung: einmalig
select pg_temp.als('22222222-2222-2222-2222-222222222222');
select pg_temp.pruefe(accept_invite(:'einladung') = :'liste'::uuid, 'Markus nimmt die Einladung an');
select set_config('test.einladung', :'einladung', false) is not null as x \gset
select pg_temp.als('33333333-3333-3333-3333-333333333333');
do $$ begin perform accept_invite(current_setting('test.einladung')); raise exception 'FEHLGESCHLAGEN: Einladung ein zweites Mal angenommen';
  exception when sqlstate '22023' then raise notice 'OK: Einladung funktioniert kein zweites Mal'; end $$;
select pg_temp.pruefe((select count(*) from lists) = 0, 'Zweiter Empfänger sieht die Liste nicht');

-- Mitbearbeiter darf bearbeiten, aber nicht löschen oder einladen
select pg_temp.als('22222222-2222-2222-2222-222222222222');
update wishes set price_cents = 34900 where id = :'rad';
select pg_temp.pruefe((select price_cents from wishes where id = :'rad') = 34900, 'Mitbearbeiter kann Wünsche bearbeiten');
delete from lists where id = :'liste';
select pg_temp.pruefe((select count(*) from lists where id = :'liste') = 1, 'Mitbearbeiter kann die Liste nicht löschen');
do $$ begin perform create_invite((select id from lists limit 1)); raise exception 'FEHLGESCHLAGEN: Mitbearbeiter konnte einladen';
  exception when insufficient_privilege then raise notice 'OK: Mitbearbeiter kann nicht einladen'; end $$;

-- Gäste: reservieren mit Pflichtnamen, keine Namen sichtbar, keine Überbuchung
select pg_temp.als('anon');
select pg_temp.pruefe(reserve_wish(:'gast', :'rad', 1, '  ')->>'error' = 'name_required', 'Reservieren ohne Namen wird abgelehnt');
select reserve_wish(:'gast', :'rad', 1, 'Oma Gisela')->>'code' as code \gset
select pg_temp.pruefe(:'code' ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$', 'Gast bekommt einen Code');
select pg_temp.pruefe(reserve_wish(:'gast', :'rad', 1, 'Onkel')->>'error' = 'already_taken', 'Vergebener Wunsch kann nicht doppelt reserviert werden');
select pg_temp.pruefe(reserve_wish(:'gast', :'hoer', 4, 'Viel')->>'error' = 'already_taken', 'Mengen-Wunsch kann nicht überbucht werden');
select pg_temp.pruefe(guest_list(:'gast')::text not like '%Oma%', 'Gästeansicht verrät keine Namen');
select pg_temp.pruefe((cancel_reservation('ZZZZ-ZZZZ')->>'ok')::boolean = false, 'Falscher Code hebt nichts auf');
select pg_temp.pruefe((cancel_reservation(lower(:'code'))->>'ok')::boolean, 'Richtiger Code hebt die Reservierung auf');

-- Eltern sehen Namen, Schalter blendet aus, Menge nicht unter Reservierungen
select reserve_wish(:'gast', :'hoer', 2, 'Familie Yilmaz') is not null as x \gset
select pg_temp.als('22222222-2222-2222-2222-222222222222');
select pg_temp.pruefe((select string_agg(guest_name, ',') from reservations) = 'Familie Yilmaz', 'Eltern sehen, wer reserviert hat');
select set_show_reservations(:'liste', false);
select pg_temp.pruefe((select count(*) from reservations) = 0, 'Schalter blendet Reservierungen aus');
select set_show_reservations(:'liste', true);
do $$ begin update wishes set quantity = 1 where title = 'Hörspiele'; raise exception 'FEHLGESCHLAGEN: Menge unter Reservierung gesenkt';
  exception when check_violation then raise notice 'OK: Menge kann nicht unter die Reservierungen sinken'; end $$;
select pg_temp.als('11111111-1111-1111-1111-111111111111');
do $$ begin update wishes set list_id = current_setting('test.liste2')::uuid where title = 'Hörspiele'; raise exception 'FEHLGESCHLAGEN: reservierter Wunsch verschoben';
  exception when check_violation then raise notice 'OK: Reservierte Wünsche bleiben in ihrer Liste'; end $$;
update wishes set list_id = :'liste2' where title = 'Fahrrad';
select pg_temp.pruefe((select list_id from wishes where title = 'Fahrrad') = :'liste2'::uuid, 'Freie Wünsche lassen sich verschieben');
update wishes set list_id = :'liste' where title = 'Fahrrad';

-- Abgeschlossene Listen sind für Gäste pausiert; Erinnerungen nur für den Server
select pg_temp.als('11111111-1111-1111-1111-111111111111');
do $$ begin perform reminder_batch(current_date); raise exception 'FEHLGESCHLAGEN: App kann Erinnerungsdaten lesen';
  exception when insufficient_privilege then raise notice 'OK: App hat keinen Zugriff auf Erinnerungsdaten'; end $$;
update lists set archived_at = now() where id = :'liste';
select pg_temp.als('anon');
select pg_temp.pruefe(guest_list(:'gast') is null, 'Abgeschlossene Liste ist für Gäste nicht erreichbar');
select pg_temp.als('11111111-1111-1111-1111-111111111111');
update lists set archived_at = null where id = :'liste';

-- Bremsklotz: höchstens 10 Reservierungen pro Liste und Minute
insert into wishes (list_id, title, quantity, created_by) values (:'liste', 'Sticker', 20, auth.uid());
select pg_temp.als(null);
select id as sticker from wishes where title = 'Sticker' \gset
delete from rate_events;
select pg_temp.als('anon');
create temp table bremse as select g, reserve_wish(:'gast', :'sticker', 1, 'Gast ' || g)->>'error' as fehler from generate_series(1, 12) g;
select pg_temp.pruefe((select count(*) from bremse where fehler is null) = 10 and (select count(*) from bremse where fehler = 'rate_limited') = 2,
  'Bremsklotz lässt 10 Reservierungen pro Minute zu und stoppt weitere');

-- Fehlerprotokoll: nur schreiben, nie lesen
select log_client_error('Testfehler');
select pg_temp.pruefe((select count(*) from client_errors) = 0, 'Fehlerprotokoll ist aus der App nicht lesbar');
select pg_temp.als(null);
select pg_temp.pruefe((select count(*) from client_errors) = 1, 'Fehler wurde protokolliert');


-- Eltern besorgen, Eltern reservieren, Benachrichtigungen
select pg_temp.als('11111111-1111-1111-1111-111111111111');
insert into wishes (list_id, title, quantity, created_by) values (:'liste', 'Zelt', 1, auth.uid()), (:'liste', 'Puppe', 1, auth.uid());
select pg_temp.als(null);
select id as zelt from wishes where title = 'Zelt' \gset
select id as puppe from wishes where title = 'Puppe' \gset
delete from rate_events;
select clock_timestamp() as vorher \gset
select pg_temp.als('anon');
select pg_temp.als('11111111-1111-1111-1111-111111111111');
update lists set allow_parents_buy = true where id = :'liste';
select pg_temp.als('anon');
select pg_temp.pruefe((reserve_wish(:'gast', :'zelt', 1, 'Oma Gisela', true)->>'ok')::boolean, 'Gast reserviert mit „Bitte besorgt ihr es“');
select pg_temp.als('22222222-2222-2222-2222-222222222222');
select pg_temp.pruefe((select parents_buy from reservations r join wishes w on w.id = r.wish_id where w.title = 'Zelt'), 'Eltern sehen „Eltern besorgen“');
select pg_temp.pruefe((reserve_for_guest(:'puppe', 1, 'Opa Heinz', true)->>'ok')::boolean, 'Eltern reservieren für jemanden');
select pg_temp.pruefe((select entered_by from reservations r join wishes w on w.id = r.wish_id where w.title = 'Puppe') = auth.uid(), 'Eintrag merkt sich, wer ihn gemacht hat');
select pg_temp.pruefe(reserve_for_guest(:'puppe', 1, 'Tante')->>'error' = 'already_taken', 'Auch Eltern können nicht doppelt reservieren');
select pg_temp.als('33333333-3333-3333-3333-333333333333');
do $$ begin perform reserve_for_guest((select id from wishes limit 1), 1, 'X'); raise exception 'FEHLGESCHLAGEN: Fremde konnten reservieren';
  exception when insufficient_privilege then raise notice 'OK: Fremde können nicht für andere reservieren'; end $$;
select pg_temp.als('anon');
select pg_temp.pruefe(guest_list(:'gast')::text not like '%Opa Heinz%' and (guest_list(:'gast')->'wishes')::text not like '%parents_buy%', 'Gäste erfahren weder Namen noch „Eltern besorgen“');

-- Benachrichtigungen: nur für den Server, ohne eigene Einträge
select pg_temp.als('11111111-1111-1111-1111-111111111111');
do $$ begin perform reservation_notices('daily', now() - interval '1 day', now()); raise exception 'FEHLGESCHLAGEN: App kann Benachrichtigungen lesen';
  exception when insufficient_privilege then raise notice 'OK: App hat keinen Zugriff auf Benachrichtigungen'; end $$;
select pg_temp.als(null);
create temp table hinweise as select * from reservation_notices('daily', :'vorher', now());
select pg_temp.pruefe((select count(*) from hinweise where email = 'julia@test.de') = 1
  and (select jsonb_array_length(items) from hinweise where email = 'julia@test.de') = 2, 'Julia erfährt von beiden neuen Reservierungen');
select pg_temp.pruefe((select count(*) from hinweise h, jsonb_array_elements(h.items) i where h.email = 'markus@test.de' and i->>'name' = 'Opa Heinz') = 0
  and (select count(*) from hinweise where email = 'markus@test.de') = 1, 'Markus wird über seinen eigenen Eintrag nicht benachrichtigt');
update profiles set notify_reservations = 'off' where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.pruefe((select count(*) from reservation_notices('daily', :'vorher', now()) where email = 'julia@test.de') = 0, 'Wer „aus“ wählt, bekommt nichts');
update profiles set notify_reservations = 'daily' where id = '11111111-1111-1111-1111-111111111111';
update list_members set show_reservations = false where user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.pruefe((select count(*) from reservation_notices('daily', :'vorher', now()) where email = 'julia@test.de') = 0, 'Ausgeblendete Reservierungen werden nicht verraten');
update list_members set show_reservations = true;

do $$ begin update profiles set notify_reservations = 'instant' where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FEHLGESCHLAGEN: „Sofort“ ließ sich noch einstellen'; exception when check_violation then raise notice 'OK: Benachrichtigungen nur noch täglich oder aus'; end $$;


-- Gruppengeschenke
select pg_temp.als('11111111-1111-1111-1111-111111111111');
do $$ begin insert into wishes (list_id, title, group_gift, created_by) values ((select id from lists where title = 'Emmas Geburtstag'), 'Ohne Preis', true, auth.uid());
  raise exception 'FEHLGESCHLAGEN: Gruppengeschenk ohne Preis angelegt'; exception when check_violation then raise notice 'OK: Gruppengeschenk braucht einen Preis'; end $$;
insert into wishes (list_id, title, price_cents, group_gift, created_by) values (:'liste', 'Kinderfahrrad gemeinsam', 34900, true, auth.uid());
select pg_temp.als(null);
select id as gruppe from wishes where title = 'Kinderfahrrad gemeinsam' \gset
delete from rate_events;
select pg_temp.als('anon');
select pg_temp.pruefe(reserve_wish(:'gast', :'gruppe', 1, 'Oma')->>'error' = 'group_gift', 'Gruppengeschenk lässt sich nicht normal reservieren');
select pg_temp.pruefe(contribute(:'gast', :'gruppe', 300, 'Klein')->>'error' = 'too_little', 'Beitrag unter 5 € wird abgelehnt');
select pg_temp.pruefe(contribute(:'gast', :'gruppe', 40000, 'Viel')->>'error' = 'too_much', 'Mehr als der offene Rest wird abgelehnt');
select contribute(:'gast', :'gruppe', 10000, 'Oma Gisela')->>'code' as beitrag \gset
select pg_temp.pruefe(:'beitrag' ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$', 'Gast steuert 100 € bei und bekommt einen Code');
select pg_temp.pruefe((select (w->>'funded_cents')::int = 10000 and (w->>'contributors')::int = 1 and (w->>'available')::int = 1
  from jsonb_array_elements(guest_list(:'gast')->'wishes') w where w->>'id' = :'gruppe'), 'Gäste sehen Summe und Anzahl');
select pg_temp.pruefe(guest_list(:'gast')::text not like '%Oma Gisela%', 'Gäste sehen keine Namen der Beitragenden');
select pg_temp.pruefe((select sum(quantity) from my_reservations(array[:'beitrag'])) = 0
  and (select sum(amount_cents) from my_reservations(array[:'beitrag'])) = 10000, 'Eigener Beitrag ist mit Betrag abrufbar');

select pg_temp.als('22222222-2222-2222-2222-222222222222');
select pg_temp.pruefe((contribute_for_guest(:'gruppe', 5000, 'Onkel Tobias')->>'ok')::boolean, 'Eltern tragen einen Beitrag für jemanden ein');
do $$ begin update wishes set group_gift = false where title = 'Kinderfahrrad gemeinsam'; raise exception 'FEHLGESCHLAGEN: Umschalten trotz Beiträgen';
  exception when check_violation then raise notice 'OK: Gemeinsam-Schenken lässt sich mit Beiträgen nicht abschalten'; end $$;
select pg_temp.pruefe((select string_agg(guest_name || ':' || amount_cents, ',' order by amount_cents) from reservations where wish_id = :'gruppe') = 'Onkel Tobias:5000,Oma Gisela:10000', 'Eltern sehen Namen und Beträge');

select pg_temp.als(null);
select pg_temp.pruefe((select gift_target(w) - gift_funded(w.id) from wishes w where id = :'gruppe') = 19900, 'Offener Rest wird richtig berechnet (349 − 100 − 50 = 199 €)');
select pg_temp.als('anon');
select pg_temp.pruefe((contribute(:'gast', :'gruppe', 19900, 'Tante Sabine')->>'ok')::boolean, 'Den Rest übernehmen geht');
select pg_temp.pruefe(contribute(:'gast', :'gruppe', 500, 'Noch wer')->>'error' = 'fully_funded', 'Komplett finanziert: keine weiteren Beiträge');
select pg_temp.pruefe((select (w->>'available')::int = 0 from jsonb_array_elements(guest_list(:'gast')->'wishes') w where w->>'id' = :'gruppe'), 'Komplett finanziert gilt als vergeben');
select pg_temp.pruefe((cancel_reservation(:'beitrag')->>'ok')::boolean, 'Gast zieht seinen Beitrag zurück');
select pg_temp.pruefe((select (w->>'funded_cents')::int = 24900 and (w->>'available')::int = 1 from jsonb_array_elements(guest_list(:'gast')->'wishes') w where w->>'id' = :'gruppe'), 'Danach ist wieder etwas offen');
select pg_temp.als(null);
select pg_temp.pruefe((select count(*) from reservation_notices('daily', now() - interval '1 hour', now()) n, jsonb_array_elements(n.items) i where i->>'amount_cents' = '5000') >= 1, 'Tägliche Mail enthält die Beträge');


-- „Bitte besorgt ihr es“ nur mit Erlaubnis der Eltern
select pg_temp.als('11111111-1111-1111-1111-111111111111');
select id as liste3, guest_token as gast3 from create_list('Ohne Besorgen') \gset
select pg_temp.pruefe(not (select allow_parents_buy from lists where id = :'liste3'), 'Neue Listen erlauben „Bitte besorgt ihr es“ zunächst nicht');
insert into wishes (list_id, title, created_by) values (:'liste3', 'Ball', auth.uid()), (:'liste3', 'Kreisel', auth.uid());
select pg_temp.als(null);
select id as ball from wishes where title = 'Ball' and list_id = :'liste3' \gset
select id as kreisel from wishes where title = 'Kreisel' and list_id = :'liste3' \gset
delete from rate_events;
select pg_temp.als('anon');
select pg_temp.pruefe((guest_list(:'gast3')->>'allow_parents_buy')::boolean = false, 'Gästeansicht weiß, dass die Option nicht angeboten wird');
select reserve_wish(:'gast3', :'ball', 1, 'Oma', true) is not null as x \gset
select pg_temp.als(null);
select pg_temp.pruefe(not (select parents_buy from reservations where wish_id = :'ball'), 'Ohne Erlaubnis wird „Bitte besorgt ihr es“ ignoriert');
select pg_temp.als('11111111-1111-1111-1111-111111111111');
update lists set allow_parents_buy = true where id = :'liste3';
select pg_temp.als('anon');
select reserve_wish(:'gast3', :'kreisel', 1, 'Opa', true) is not null as x \gset
select pg_temp.als(null);
select pg_temp.pruefe((select parents_buy from reservations where wish_id = :'kreisel'), 'Mit Erlaubnis wird „Bitte besorgt ihr es“ gespeichert');
select pg_temp.als('11111111-1111-1111-1111-111111111111');
select pg_temp.pruefe((select allow_parents_buy from create_list('Mit Besorgen', null, 'birthday', null, 0, null, true)), 'Beim Anlegen lässt sich die Option gleich einschalten');

\echo 'Alle Datenbank-Tests bestanden.'
