-- Nime lukustamine: õpetaja saab nimekirja koha lukku panna. Lukus nimega saab telefoni siduda ainult õpetaja
-- loal (sama tee, mis telefoni vahetusel: sidumine jääb ootele, õpetaja vajutab „Luba“ või „Keela“).
-- Mõeldud nt õpilasele, kes koolis ei käi, et keegi teine tema nime endale ei valiks.
-- Juba seotud telefoni lukk ei puuduta: see märgib kohaloleku nagu enne.

alter table kohalolek.grp add column if not exists locked text[] not null default '{}';

create or replace function public.koh_lock(p_code text, p_auth text, p_group uuid, p_slot text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  g kohalolek.grp;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  select * into g from kohalolek.grp where id = p_group and workspace_id = v_ws;
  if g.id is null or not (p_slot = any (g.slots)) then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  -- uus loend tehakse kehtivatest kohtadest, nii kaovad ühtlasi nimekirjast eemaldatud õpilaste lukud
  update kohalolek.grp
  set locked = array(
    select x from unnest(g.slots) x
    where (x = any (g.locked) and x <> p_slot) or (x = p_slot and coalesce(p_on, false)))
  where id = g.id;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.koh_lock(text, text, uuid, text, boolean) from public;
grant execute on function public.koh_lock(text, text, uuid, text, boolean) to anon;

-- Sidumine: lukus nimi läheb ootele ka siis, kui see on vaba. Vastuses `why`: 'locked' või 'taken'.
-- Lisaks: kui telefon seotakse lõpuks teise (vaba) nimega, kustub tema varasem ootel soov (enne jäi see
-- õpetaja lehele rippuma).
create or replace function public.koh_bind(p_session text, p_device text, p_slot text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s kohalolek.session;
  g kohalolek.grp;
  v_dev text := kohalolek.h(p_device);
  v_at timestamptz;
  v_mine text;
  v_owner text;
begin
  select * into s from kohalolek.session where id = p_session;
  if s.id is null then return jsonb_build_object('status', 'unknown'); end if;
  if s.ended_at is not null then return jsonb_build_object('status', 'ended'); end if;
  select at into v_at from kohalolek.arrival
  where session_id = s.id and round = s.round and device = v_dev and at > clock_timestamp() - interval '10 minutes';
  if v_at is null then return jsonb_build_object('status', 'expired'); end if;
  select * into g from kohalolek.grp where id = s.group_id;
  if not (p_slot = any (g.slots)) then return jsonb_build_object('status', 'error'); end if;

  select slot into v_mine from kohalolek.binding where group_id = g.id and device = v_dev;
  if v_mine is not null then
    insert into kohalolek.checkin (session_id, round, slot, device, at) values (s.id, s.round, v_mine, v_dev, v_at)
    on conflict (session_id, round, slot) do nothing;
    return jsonb_build_object('status', 'ok', 'slot', v_mine, 'at', kohalolek.ms(v_at), 'round', s.round);
  end if;

  select device into v_owner from kohalolek.binding where group_id = g.id and slot = p_slot;
  if v_owner is not null or p_slot = any (g.locked) then
    insert into kohalolek.claim (session_id, device, slot, at) values (s.id, v_dev, p_slot, v_at)
    on conflict (session_id, device) do update set slot = excluded.slot, at = excluded.at, denied = false;
    return jsonb_build_object('status', 'pending', 'slot', p_slot,
                              'why', case when v_owner is null then 'locked' else 'taken' end);
  end if;

  insert into kohalolek.binding (group_id, slot, device) values (g.id, p_slot, v_dev);
  insert into kohalolek.checkin (session_id, round, slot, device, at, fresh)
  values (s.id, s.round, p_slot, v_dev, v_at, true)
  on conflict (session_id, round, slot) do nothing;
  delete from kohalolek.claim where session_id = s.id and device = v_dev;
  return jsonb_build_object('status', 'ok', 'slot', p_slot, 'at', kohalolek.ms(v_at), 'round', s.round);
end $$;

-- Sisselogimine: iga rühma juures lukus kohad.
create or replace function public.koh_ws_login(p_code text, p_auth text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  return jsonb_build_object(
    'ok', true,
    'now', kohalolek.ms(clock_timestamp()),
    'settings_enc', (select w.settings_enc from kohalolek.workspace w where w.id = v_ws),
    'retain_days', (select w.retain_days from kohalolek.workspace w where w.id = v_ws),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'label', g.label, 'roster_enc', g.roster_enc, 'slots', to_jsonb(g.slots),
        'locked', to_jsonb(g.locked),
        'bound', (select coalesce(jsonb_agg(b.slot), '[]'::jsonb) from kohalolek.binding b where b.group_id = g.id),
        'open', (select s.id from kohalolek.session s where s.group_id = g.id and s.ended_at is null
                 order by s.created_at desc limit 1),
        'last', (select kohalolek.ms(max(s.start_at)) from kohalolek.session s where s.group_id = g.id)
      ) order by g.label)
      from kohalolek.grp g where g.workspace_id = v_ws), '[]'::jsonb)
  );
end $$;

-- Tunni seis: lisandub locked.
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
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'blob', n.blob) order by n.created_at)
      from kohalolek.note n where n.session_id = s.id), '[]'::jsonb),
    'bound', (select coalesce(jsonb_agg(b.slot), '[]'::jsonb) from kohalolek.binding b where b.group_id = s.group_id),
    'locked', (select to_jsonb(g.locked) from kohalolek.grp g where g.id = s.group_id),
    'picking', (
      select count(*) from kohalolek.arrival a
      where a.session_id = s.id and a.round = s.round and a.at > clock_timestamp() - interval '10 minutes'
        and not exists (select 1 from kohalolek.binding b where b.group_id = s.group_id and b.device = a.device)
        and not exists (select 1 from kohalolek.claim c where c.session_id = s.id and c.device = a.device))
  );
end $$;

notify pgrst, 'reload schema';
