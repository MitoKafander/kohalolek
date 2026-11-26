-- Kohalolek: QR-põhise kohaloleku vahendaja.
--
-- Põhimõte: server ei hoia ühtegi nime loetaval kujul. Rühma nimekiri on krüpteeritud õpetaja
-- brauseris (roster_enc = õpetaja võtmega, list_enc = rühma võtmega, mis liigub QR-koodis).
-- Server näeb ainult juhuslikke kohakoode (slot), seadmekoodi räsi ja kellaaegu.
--
-- Tabelid on skeemis `kohalolek`, mida API ei näita. Kogu ligipääs käib `public.koh_*`
-- funktsioonide kaudu (SECURITY DEFINER), mida tohib kutsuda anon-roll.

create schema if not exists kohalolek;
revoke all on schema kohalolek from public;
revoke all on schema kohalolek from anon, authenticated;

create table kohalolek.workspace (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{2,31}$'),
  auth_hash text not null,
  created_at timestamptz not null default now()
);

create table kohalolek.invite (
  code_hash text primary key,
  note text,
  uses_left int not null default 1,
  created_at timestamptz not null default now()
);

create table kohalolek.grp (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kohalolek.workspace on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  roster_enc text not null check (char_length(roster_enc) < 200000),
  list_enc text not null check (char_length(list_enc) < 100000),
  slots text[] not null default '{}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on kohalolek.grp (workspace_id);

create table kohalolek.binding (
  group_id uuid not null references kohalolek.grp on delete cascade,
  slot text not null,
  device text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, slot),
  unique (group_id, device)
);

create table kohalolek.session (
  id text primary key,
  group_id uuid not null references kohalolek.grp on delete cascade,
  seed text not null,
  teacher text check (char_length(teacher) <= 40),
  start_at timestamptz not null,
  ontime_min int not null default 5 check (ontime_min between 0 and 60),
  round int not null default 1,
  rounds jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);
create index on kohalolek.session (group_id, created_at desc);

create table kohalolek.arrival (
  session_id text not null references kohalolek.session on delete cascade,
  round int not null,
  device text not null,
  at timestamptz not null default now(),
  primary key (session_id, round, device)
);

create table kohalolek.checkin (
  session_id text not null references kohalolek.session on delete cascade,
  round int not null,
  slot text not null,
  device text,
  at timestamptz not null,
  fresh boolean not null default false,
  primary key (session_id, round, slot)
);

create table kohalolek.claim (
  session_id text not null references kohalolek.session on delete cascade,
  device text not null,
  slot text not null,
  at timestamptz not null,
  denied boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (session_id, device)
);

create table kohalolek.mark (
  session_id text not null references kohalolek.session on delete cascade,
  slot text not null,
  status text not null check (status in ('K', 'H', 'P')),
  updated_at timestamptz not null default now(),
  primary key (session_id, slot)
);

alter table kohalolek.workspace enable row level security;
alter table kohalolek.invite enable row level security;
alter table kohalolek.grp enable row level security;
alter table kohalolek.binding enable row level security;
alter table kohalolek.session enable row level security;
alter table kohalolek.arrival enable row level security;
alter table kohalolek.checkin enable row level security;
alter table kohalolek.claim enable row level security;
alter table kohalolek.mark enable row level security;

-- ---------- abifunktsioonid (ei ole API-s nähtavad) ----------

create function kohalolek.h(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p, ''), 'utf8')), 'hex')
$$;

create function kohalolek.ms(p timestamptz) returns bigint
language sql immutable set search_path = '' as $$
  select (extract(epoch from p) * 1000)::bigint
$$;

-- Vahetuv kood: 10 s aken, sõltub sessiooni saladusest ja kontrolli numbrist.
create function kohalolek.token(p_seed text, p_round int, p_w bigint) returns text
language sql immutable set search_path = '' as $$
  select left(encode(sha256(convert_to(p_seed || ':' || p_round || ':' || p_w, 'utf8')), 'hex'), 8)
$$;

create function kohalolek.ws(p_code text, p_auth text) returns uuid
language sql stable set search_path = '' as $$
  select id from kohalolek.workspace
  where code = lower(coalesce(p_code, '')) and auth_hash = kohalolek.h(p_auth)
$$;

-- Sessioon, mis kuulub selle tööruumi alla (muidu null).
create function kohalolek.own_session(p_ws uuid, p_session text) returns kohalolek.session
language sql stable set search_path = '' as $$
  select s.* from kohalolek.session s join kohalolek.grp g on g.id = s.group_id
  where s.id = p_session and g.workspace_id = p_ws
$$;

revoke all on all functions in schema kohalolek from public;
revoke all on all functions in schema kohalolek from anon, authenticated;

-- ---------- õpetaja funktsioonid ----------

create function public.koh_ws_create(p_code text, p_auth text, p_invite text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text := lower(coalesce(p_code, ''));
  v_inv text := kohalolek.h(p_invite);
begin
  if v_code !~ '^[a-z0-9][a-z0-9_-]{2,31}$' then
    return jsonb_build_object('ok', false, 'err', 'code');
  end if;
  if p_auth is null or p_auth !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'err', 'auth');
  end if;
  if exists (select 1 from kohalolek.workspace where code = v_code) then
    return jsonb_build_object('ok', false, 'err', 'taken');
  end if;
  update kohalolek.invite set uses_left = uses_left - 1 where code_hash = v_inv and uses_left > 0;
  if not found then
    return jsonb_build_object('ok', false, 'err', 'invite');
  end if;
  insert into kohalolek.workspace (code, auth_hash) values (v_code, kohalolek.h(p_auth));
  return jsonb_build_object('ok', true);
end $$;

create function public.koh_ws_login(p_code text, p_auth text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  return jsonb_build_object(
    'ok', true,
    'now', kohalolek.ms(clock_timestamp()),
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

create function public.koh_group_save(
  p_code text, p_auth text, p_id uuid, p_label text, p_roster_enc text, p_list_enc text, p_slots text[]
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  v_id uuid;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  if coalesce(array_length(p_slots, 1), 0) > 200 then return jsonb_build_object('ok', false, 'err', 'size'); end if;
  if p_id is null then
    if (select count(*) from kohalolek.grp where workspace_id = v_ws) >= 100 then
      return jsonb_build_object('ok', false, 'err', 'size');
    end if;
    insert into kohalolek.grp (workspace_id, label, roster_enc, list_enc, slots)
    values (v_ws, p_label, p_roster_enc, p_list_enc, coalesce(p_slots, '{}'))
    returning id into v_id;
  else
    update kohalolek.grp
    set label = p_label, roster_enc = p_roster_enc, list_enc = p_list_enc,
        slots = coalesce(p_slots, '{}'), updated_at = now()
    where id = p_id and workspace_id = v_ws
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
    delete from kohalolek.binding where group_id = v_id and not (slot = any (coalesce(p_slots, '{}')));
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.koh_group_delete(p_code text, p_auth text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  delete from kohalolek.grp where id = p_id and workspace_id = v_ws;
  return jsonb_build_object('ok', found);
end $$;

create function public.koh_session_start(
  p_code text, p_auth text, p_group uuid, p_start_at timestamptz, p_ontime int, p_teacher text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  v_id text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  v_seed text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_now timestamptz := clock_timestamp();
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  if not exists (select 1 from kohalolek.grp where id = p_group and workspace_id = v_ws) then
    return jsonb_build_object('ok', false, 'err', 'notfound');
  end if;
  update kohalolek.session set ended_at = v_now where group_id = p_group and ended_at is null;
  insert into kohalolek.session (id, group_id, seed, teacher, start_at, ontime_min, rounds)
  values (v_id, p_group, v_seed, left(p_teacher, 40), coalesce(p_start_at, v_now),
          least(greatest(coalesce(p_ontime, 5), 0), 60),
          jsonb_build_array(jsonb_build_object('n', 1, 'at', kohalolek.ms(v_now))));
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create function public.koh_session_state(p_code text, p_auth text, p_session text) returns jsonb
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
      'ended_at', kohalolek.ms(s.ended_at)),
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

create function public.koh_session_update(
  p_code text, p_auth text, p_session text, p_start_at timestamptz, p_ontime int
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  update kohalolek.session
  set start_at = coalesce(p_start_at, start_at),
      ontime_min = least(greatest(coalesce(p_ontime, ontime_min), 0), 60)
  where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- Uus kontroll: kõik skaneerivad uuesti, eelmiste kontrollide tulemused jäävad alles.
create function public.koh_session_round(p_code text, p_auth text, p_session text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null or s.ended_at is not null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  update kohalolek.session
  set round = round + 1,
      rounds = rounds || jsonb_build_object('n', round + 1, 'at', kohalolek.ms(clock_timestamp()))
  where id = s.id;
  return jsonb_build_object('ok', true, 'round', s.round + 1);
end $$;

create function public.koh_session_end(p_code text, p_auth text, p_session text, p_end boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  if coalesce(p_end, true) then
    update kohalolek.session set ended_at = coalesce(ended_at, clock_timestamp()) where id = s.id;
  else
    update kohalolek.session set ended_at = clock_timestamp() where group_id = s.group_id and ended_at is null;
    update kohalolek.session set ended_at = null where id = s.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.koh_session_delete(p_code text, p_auth text, p_session text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  delete from kohalolek.session where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

create function public.koh_sessions(p_code text, p_auth text, p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  return jsonb_build_object('ok', true, 'sessions', coalesce((
    select jsonb_agg(x.j order by x.start_at desc) from (
      select s.start_at, jsonb_build_object(
        'id', s.id, 'start_at', kohalolek.ms(s.start_at), 'ended_at', kohalolek.ms(s.ended_at),
        'teacher', s.teacher, 'round', s.round,
        'present', (select count(*) from kohalolek.checkin c where c.session_id = s.id and c.round = 1)) as j
      from kohalolek.session s join kohalolek.grp g on g.id = s.group_id
      where s.group_id = p_group and g.workspace_id = v_ws
      order by s.start_at desc limit 200) x), '[]'::jsonb));
end $$;

-- Õpetaja käsitsi parandus: K = kohal, H = hilines, P = puudus, null = automaatne.
create function public.koh_mark(p_code text, p_auth text, p_session text, p_slot text, p_status text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  if p_status is null then
    delete from kohalolek.mark where session_id = s.id and slot = p_slot;
  elsif p_status in ('K', 'H', 'P') then
    insert into kohalolek.mark (session_id, slot, status) values (s.id, p_slot, p_status)
    on conflict (session_id, slot) do update set status = excluded.status, updated_at = now();
  else
    return jsonb_build_object('ok', false, 'err', 'status');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create function public.koh_unbind(p_code text, p_auth text, p_group uuid, p_slot text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  delete from kohalolek.binding b using kohalolek.grp g
  where b.group_id = g.id and g.id = p_group and g.workspace_id = v_ws and b.slot = p_slot;
  return jsonb_build_object('ok', true);
end $$;

-- Uus telefon küsib juba seotud nime: õpetaja lubab või keelab.
create function public.koh_claim_resolve(
  p_code text, p_auth text, p_session text, p_device text, p_approve boolean
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
  s kohalolek.session;
  c kohalolek.claim;
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  s := kohalolek.own_session(v_ws, p_session);
  if s.id is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  select * into c from kohalolek.claim where session_id = s.id and device = p_device;
  if c.device is null then return jsonb_build_object('ok', false, 'err', 'notfound'); end if;
  if coalesce(p_approve, false) then
    delete from kohalolek.binding where group_id = s.group_id and (slot = c.slot or device = c.device);
    insert into kohalolek.binding (group_id, slot, device) values (s.group_id, c.slot, c.device);
    insert into kohalolek.checkin (session_id, round, slot, device, at, fresh)
    values (s.id, s.round, c.slot, c.device, c.at, true)
    on conflict (session_id, round, slot) do nothing;
    delete from kohalolek.claim where session_id = s.id and device = c.device;
  else
    update kohalolek.claim set denied = true where session_id = s.id and device = c.device;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- õpilase funktsioonid ----------

create function public.koh_checkin(p_session text, p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s kohalolek.session;
  g kohalolek.grp;
  v_dev text;
  v_w bigint := floor(extract(epoch from clock_timestamp()) / 10);
  v_at timestamptz;
  v_slot text;
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9-]{16,64}$' then
    return jsonb_build_object('status', 'error');
  end if;
  v_dev := kohalolek.h(p_device);
  select * into s from kohalolek.session where id = p_session;
  if s.id is null then return jsonb_build_object('status', 'unknown'); end if;
  if s.ended_at is not null then return jsonb_build_object('status', 'ended'); end if;
  if p_token is null or p_token not in (
    kohalolek.token(s.seed, s.round, v_w), kohalolek.token(s.seed, s.round, v_w - 1),
    kohalolek.token(s.seed, s.round, v_w - 2)) then
    return jsonb_build_object('status', 'expired');
  end if;
  if (select count(*) from kohalolek.arrival where session_id = s.id and round = s.round) > 400 then
    return jsonb_build_object('status', 'error');
  end if;
  select * into g from kohalolek.grp where id = s.group_id;

  insert into kohalolek.arrival (session_id, round, device) values (s.id, s.round, v_dev)
  on conflict (session_id, round, device) do nothing;
  select at into v_at from kohalolek.arrival where session_id = s.id and round = s.round and device = v_dev;

  select slot into v_slot from kohalolek.binding where group_id = g.id and device = v_dev;
  if v_slot is not null then
    insert into kohalolek.checkin (session_id, round, slot, device, at) values (s.id, s.round, v_slot, v_dev, v_at)
    on conflict (session_id, round, slot) do nothing;
    return jsonb_build_object('status', 'ok', 'slot', v_slot, 'at', kohalolek.ms(v_at), 'round', s.round,
                              'list_enc', g.list_enc);
  end if;
  return jsonb_build_object(
    'status', 'bind', 'list_enc', g.list_enc, 'round', s.round,
    'taken', (select coalesce(jsonb_agg(b.slot), '[]'::jsonb) from kohalolek.binding b where b.group_id = g.id));
end $$;

-- Esimene kord: telefon seotakse nimekirja kohaga. Lubatud ainult kohe pärast kehtivat skaneeringut.
create function public.koh_bind(p_session text, p_device text, p_slot text) returns jsonb
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
  if v_owner is not null then
    insert into kohalolek.claim (session_id, device, slot, at) values (s.id, v_dev, p_slot, v_at)
    on conflict (session_id, device) do update set slot = excluded.slot, at = excluded.at, denied = false;
    return jsonb_build_object('status', 'pending', 'slot', p_slot);
  end if;

  insert into kohalolek.binding (group_id, slot, device) values (g.id, p_slot, v_dev);
  insert into kohalolek.checkin (session_id, round, slot, device, at, fresh)
  values (s.id, s.round, p_slot, v_dev, v_at, true)
  on conflict (session_id, round, slot) do nothing;
  return jsonb_build_object('status', 'ok', 'slot', p_slot, 'at', kohalolek.ms(v_at), 'round', s.round);
end $$;

-- Õpilase leht küsib, kas ootel sidumine on lubatud.
create function public.koh_status(p_session text, p_device text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s kohalolek.session;
  v_dev text := kohalolek.h(p_device);
  v_slot text;
  v_at timestamptz;
  c kohalolek.claim;
begin
  select * into s from kohalolek.session where id = p_session;
  if s.id is null then return jsonb_build_object('status', 'unknown'); end if;
  select slot into v_slot from kohalolek.binding where group_id = s.group_id and device = v_dev;
  if v_slot is not null then
    select at into v_at from kohalolek.checkin where session_id = s.id and round = s.round and slot = v_slot;
    if v_at is not null then
      return jsonb_build_object('status', 'ok', 'slot', v_slot, 'at', kohalolek.ms(v_at), 'round', s.round);
    end if;
  end if;
  select * into c from kohalolek.claim where session_id = s.id and device = v_dev;
  if c.device is not null then
    return jsonb_build_object('status', case when c.denied then 'denied' else 'pending' end, 'slot', c.slot);
  end if;
  return jsonb_build_object('status', 'none');
end $$;

-- ---------- õigused ----------

revoke all on all functions in schema public from public;
grant usage on schema public to anon;
grant execute on function
  public.koh_ws_create(text, text, text),
  public.koh_ws_login(text, text),
  public.koh_group_save(text, text, uuid, text, text, text, text[]),
  public.koh_group_delete(text, text, uuid),
  public.koh_session_start(text, text, uuid, timestamptz, int, text),
  public.koh_session_state(text, text, text),
  public.koh_session_update(text, text, text, timestamptz, int),
  public.koh_session_round(text, text, text),
  public.koh_session_end(text, text, text, boolean),
  public.koh_session_delete(text, text, text),
  public.koh_sessions(text, text, uuid),
  public.koh_mark(text, text, text, text, text),
  public.koh_unbind(text, text, uuid, text),
  public.koh_claim_resolve(text, text, text, text, boolean),
  public.koh_checkin(text, text, text),
  public.koh_bind(text, text, text),
  public.koh_status(text, text)
to anon;
