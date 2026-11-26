-- Tunnimärkmed: märkused ja kiitused tunni ajal + tööruumi seaded (märkuste tüübid).
-- Kõik sisu on krüpteeritud õpetaja brauseris: server näeb ainult seda, mitu märget tunnis on ja millal need tehti.
-- Kes, mille eest ja mis sõnastusega, on loetav ainult õpetaja võtmega.

create table if not exists kohalolek.note (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references kohalolek.session on delete cascade,
  blob text not null check (char_length(blob) < 4000),
  created_at timestamptz not null default now()
);
create index if not exists note_session_idx on kohalolek.note (session_id);
alter table kohalolek.note enable row level security;

alter table kohalolek.workspace add column if not exists settings_enc text check (char_length(settings_enc) < 20000);

create or replace function public.koh_note_add(p_code text, p_auth text, p_session text, p_blob text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
  v_id uuid;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  if p_blob is null or char_length(p_blob) >= 4000 or (select count(*) from kohalolek.note where session_id = s.id) >= 2000 then
    return jsonb_build_object('ok', false, 'err', 'size');
  end if;
  insert into kohalolek.note (session_id, blob) values (s.id, p_blob) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.koh_note_del(p_code text, p_auth text, p_session text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  delete from kohalolek.note where id = p_id and session_id = s.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.koh_ws_settings(p_code text, p_auth text, p_settings text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  if p_settings is not null and char_length(p_settings) >= 20000 then return jsonb_build_object('ok', false, 'err', 'size'); end if;
  update kohalolek.workspace set settings_enc = p_settings where id = v_ws;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.koh_note_add(text, text, text, text) from public;
revoke all on function public.koh_note_del(text, text, text, uuid) from public;
revoke all on function public.koh_ws_settings(text, text, text) from public;
grant execute on function public.koh_note_add(text, text, text, text), public.koh_note_del(text, text, text, uuid),
  public.koh_ws_settings(text, text, text) to anon;

-- Sisselogimine: lisandub settings_enc.
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
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'label', g.label, 'roster_enc', g.roster_enc, 'slots', to_jsonb(g.slots),
        'bound', (select coalesce(jsonb_agg(b.slot), '[]'::jsonb) from kohalolek.binding b where b.group_id = g.id),
        'open', (select s.id from kohalolek.session s where s.group_id = g.id and s.ended_at is null
                 order by s.created_at desc limit 1),
        'last', (select kohalolek.ms(max(s.start_at)) from kohalolek.session s where s.group_id = g.id)
      ) order by g.label)
      from kohalolek.grp g where g.workspace_id = v_ws), '[]'::jsonb)
  );
end $$;

-- Tunni seis: lisandub notes.
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
    'picking', (
      select count(*) from kohalolek.arrival a
      where a.session_id = s.id and a.round = s.round and a.at > clock_timestamp() - interval '10 minutes'
        and not exists (select 1 from kohalolek.binding b where b.group_id = s.group_id and b.device = a.device)
        and not exists (select 1 from kohalolek.claim c where c.session_id = s.id and c.device = a.device))
  );
end $$;

notify pgrst, 'reload schema';
