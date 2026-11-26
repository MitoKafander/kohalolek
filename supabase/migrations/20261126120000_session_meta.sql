-- Tunni lisaandmed Tahvli kande jaoks: algustund, tundide arv, kande liik, õppe maht.
-- Ei sisalda isikuandmeid; hoitakse lihttekstina.

alter table kohalolek.session add column if not exists meta jsonb not null default '{}'::jsonb;

create or replace function public.koh_session_meta(p_code text, p_auth text, p_session text, p_meta jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  if p_meta is null or jsonb_typeof(p_meta) <> 'object' or octet_length(p_meta::text) > 2000 then
    return jsonb_build_object('ok', false, 'err', 'size');
  end if;
  update kohalolek.session set meta = p_meta where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.koh_session_meta(text, text, text, jsonb) from public;
grant execute on function public.koh_session_meta(text, text, text, jsonb) to anon;

-- Sama mis enne, lisandub väli `meta`.
create or replace function public.koh_session_state(p_code text, p_auth text, p_session text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  return jsonb_build_object(
    'ok', true,
    'now', kohalolek.ms(clock_timestamp()),
    'session', jsonb_build_object(
      'id', s.id, 'group_id', s.group_id, 'seed', s.seed, 'teacher', s.teacher,
      'start_at', kohalolek.ms(s.start_at), 'ontime_min', s.ontime_min, 'round', s.round, 'rounds', s.rounds,
      'ended_at', kohalolek.ms(s.ended_at), 'meta', s.meta),
    'checkins', coalesce((
      select jsonb_agg(jsonb_build_object('r', c.round, 's', c.slot, 'at', kohalolek.ms(c.at),
                                          'qr', c.device is not null, 'fresh', c.fresh)
                       order by c.at)
      from kohalolek.checkin c where c.session_id = s.id), '[]'::jsonb),
    'marks', coalesce((
      select jsonb_object_agg(m.slot, m.status) from kohalolek.mark m where m.session_id = s.id), '{}'::jsonb),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object('device', c.device, 'slot', c.slot, 'at', kohalolek.ms(c.at))
                       order by c.created_at)
      from kohalolek.claim c where c.session_id = s.id and not c.denied), '[]'::jsonb),
    'bound', (select coalesce(jsonb_agg(b.slot), '[]'::jsonb) from kohalolek.binding b where b.group_id = s.group_id),
    'picking', (
      select count(*) from kohalolek.arrival a
      where a.session_id = s.id and a.round = s.round and a.at > clock_timestamp() - interval '10 minutes'
        and not exists (select 1 from kohalolek.binding b where b.group_id = s.group_id and b.device = a.device)
        and not exists (select 1 from kohalolek.claim c where c.session_id = s.id and c.device = a.device))
  );
end $$;

notify pgrst, 'reload schema';
