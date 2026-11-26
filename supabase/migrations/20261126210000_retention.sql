-- Säilitustähtaeg: tunnid koos skaneeringute, käsitsi paranduste ja märkmetega kustutatakse serverist
-- N päeva pärast tundi (tööruumi seade, vaikimisi 7). Ametlik kirje on Tahvlis; siin on ainult tööks vajalik koopia.
-- Rühmade nimekirjad ja telefonide sidumised jäävad alles, kuni õpetaja rühma kustutab.

alter table kohalolek.workspace add column if not exists retain_days int not null default 7
  check (retain_days between 1 and 400);

create or replace function kohalolek.cleanup() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  with gone as (
    delete from kohalolek.session s
    using kohalolek.grp g, kohalolek.workspace w
    where g.id = s.group_id and w.id = g.workspace_id
      and coalesce(s.ended_at, s.start_at) < now() - make_interval(days => w.retain_days)
    returning s.id)
  select count(*) into v_n from gone;
  return jsonb_build_object('ok', true, 'deleted_sessions', v_n);
end $$;
revoke all on function kohalolek.cleanup() from public;

-- Avalik käivitaja (ei võta sisendit, kustutab ainult tähtaja ületanud tunnid): varuks GitHubi töövoole.
create or replace function public.koh_cleanup() returns jsonb
language sql security definer set search_path = '' as $$ select kohalolek.cleanup() $$;

create or replace function public.koh_ws_retention(p_code text, p_auth text, p_days int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ws uuid := kohalolek.ws(p_code, p_auth);
begin
  if v_ws is null then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  if p_days is null or p_days < 1 or p_days > 400 then return jsonb_build_object('ok', false, 'err', 'range'); end if;
  update kohalolek.workspace set retain_days = p_days where id = v_ws;
  return jsonb_build_object('ok', true, 'retain_days', p_days);
end $$;

revoke all on function public.koh_cleanup() from public;
revoke all on function public.koh_ws_retention(text, text, int) from public;
grant execute on function public.koh_cleanup(), public.koh_ws_retention(text, text, int) to anon;

-- Sisselogimine: lisandub retain_days.
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
        'bound', (select coalesce(jsonb_agg(b.slot), '[]'::jsonb) from kohalolek.binding b where b.group_id = g.id),
        'open', (select s.id from kohalolek.session s where s.group_id = g.id and s.ended_at is null
                 order by s.created_at desc limit 1),
        'last', (select kohalolek.ms(max(s.start_at)) from kohalolek.session s where s.group_id = g.id)
      ) order by g.label)
      from kohalolek.grp g where g.workspace_id = v_ws), '[]'::jsonb)
  );
end $$;

-- Õpilase skaneering: vastuses on säilitustähtaeg, et õpilase leht saaks seda näidata.
create or replace function public.koh_checkin(p_session text, p_token text, p_device text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s kohalolek.session;
  g kohalolek.grp;
  v_dev text;
  v_w bigint := floor(extract(epoch from clock_timestamp()) / 10);
  v_at timestamptz;
  v_slot text;
  v_retain int;
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
  select w.retain_days into v_retain from kohalolek.workspace w where w.id = g.workspace_id;

  insert into kohalolek.arrival (session_id, round, device) values (s.id, s.round, v_dev)
  on conflict (session_id, round, device) do nothing;
  select at into v_at from kohalolek.arrival where session_id = s.id and round = s.round and device = v_dev;

  select slot into v_slot from kohalolek.binding where group_id = g.id and device = v_dev;
  if v_slot is not null then
    insert into kohalolek.checkin (session_id, round, slot, device, at) values (s.id, s.round, v_slot, v_dev, v_at)
    on conflict (session_id, round, slot) do nothing;
    return jsonb_build_object('status', 'ok', 'slot', v_slot, 'at', kohalolek.ms(v_at), 'round', s.round,
                              'list_enc', g.list_enc, 'retain_days', v_retain);
  end if;
  return jsonb_build_object(
    'status', 'bind', 'list_enc', g.list_enc, 'round', s.round, 'retain_days', v_retain,
    'taken', (select coalesce(jsonb_agg(b.slot), '[]'::jsonb) from kohalolek.binding b where b.group_id = g.id));
end $$;

-- Igaöine kustutamine andmebaasi enda ajastajaga (kui pg_cron on saadaval).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('kohalolek-cleanup', '23 1 * * *', 'select kohalolek.cleanup()');
  end if;
end $$;

notify pgrst, 'reload schema';
