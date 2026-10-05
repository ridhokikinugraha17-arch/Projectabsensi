-- =====================================================================
-- Sistem Absensi - schema lengkap (aman dijalankan berulang)
-- Supabase: SQL Editor > New query > tempel semua > Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. PROFILES (role admin/user) + helper is_admin()
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  role text not null default 'user' check (role in ('admin','user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

-- Profil dibuat otomatis setiap ada akun baru
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Isi profil untuk akun yang sudah ada sebelumnya
insert into public.profiles (id, full_name, email)
select id, split_part(email, '@', 1), email from auth.users
on conflict (id) do nothing;

-- Jika belum ada admin sama sekali, akun TERTUA dijadikan admin
-- (diasumsikan akun admin yang Anda buat manual di Authentication > Users).
-- Setelah ada admin, bagian ini tidak melakukan apa-apa.
update public.profiles set role = 'admin'
where id = (select id from auth.users order by created_at asc limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

alter table public.profiles enable row level security;
drop policy if exists "profil sendiri atau admin" on public.profiles;
drop policy if exists "ubah profil sendiri" on public.profiles;

create policy "profil sendiri atau admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "ubah profil sendiri" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- User tidak boleh mengubah role / is_active miliknya sendiri
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 2. TABEL LAMA (absensi kelas oleh admin) - disesuaikan dengan script.js
--    script.js memakai kolom npm, nama, kelas pada tabel absensi.
-- ---------------------------------------------------------------------
create table if not exists public.mahasiswa (
  id uuid primary key default gen_random_uuid(),
  npm text not null unique,
  nama text not null,
  kelas text not null,
  prodi text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.absensi (
  id uuid primary key default gen_random_uuid(),
  mahasiswa_id uuid references public.mahasiswa(id) on delete cascade,
  npm text,
  nama text,
  kelas text,
  tanggal date not null,
  status text not null check (status in ('Hadir','Izin','Sakit','Alpa')),
  created_at timestamptz not null default now()
);

alter table public.absensi add column if not exists npm text;
alter table public.absensi add column if not exists nama text;
alter table public.absensi add column if not exists kelas text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'absensi' and column_name = 'mahasiswa_id'
  ) then
    alter table public.absensi alter column mahasiswa_id drop not null;
  end if;
end $$;

create index if not exists absensi_tanggal_idx on public.absensi (tanggal);
create index if not exists absensi_npm_idx on public.absensi (npm);
create index if not exists mahasiswa_kelas_idx on public.mahasiswa (kelas);

alter table public.mahasiswa enable row level security;
alter table public.absensi enable row level security;

drop policy if exists "akses mahasiswa" on public.mahasiswa;
drop policy if exists "akses absensi" on public.absensi;
drop policy if exists "admin mahasiswa" on public.mahasiswa;
drop policy if exists "admin absensi" on public.absensi;

-- Sekarang hanya ADMIN yang boleh mengelola data kelas
create policy "admin mahasiswa" on public.mahasiswa
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin absensi" on public.absensi
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. ATTENDANCE_QR (sesi absensi + QR) dan ATTENDANCE (absen mandiri)
-- ---------------------------------------------------------------------
create table if not exists public.attendance_qr (
  id uuid primary key default gen_random_uuid(),
  qr_code text not null unique,
  title text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  radius integer not null default 100 check (radius between 10 and 5000),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  late_after_minutes integer not null default 15 check (late_after_minutes >= 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (expires_at > starts_at)
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nama text,
  email text,
  tanggal date not null,
  waktu time not null,
  status text not null check (status in ('Hadir','Terlambat')),
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  distance double precision,
  qr_code text,
  qr_id uuid references public.attendance_qr(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, tanggal)
);

create index if not exists attendance_user_tanggal_idx on public.attendance (user_id, tanggal desc);
create index if not exists attendance_tanggal_idx on public.attendance (tanggal);
create index if not exists attendance_qr_expires_idx on public.attendance_qr (expires_at);

alter table public.attendance_qr enable row level security;
alter table public.attendance enable row level security;

drop policy if exists "qr admin" on public.attendance_qr;
drop policy if exists "absensi sendiri atau admin" on public.attendance;

-- Hanya admin yang boleh melihat/membuat QR (user tidak bisa "mengintip" kode QR)
create policy "qr admin" on public.attendance_qr
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- User hanya melihat absensinya sendiri, admin melihat semua.
-- TIDAK ada policy insert: absensi hanya bisa masuk lewat fungsi submit_attendance().
create policy "absensi sendiri atau admin" on public.attendance
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------
-- 4. FUNGSI SERVER (validasi QR + radius dilakukan di server)
-- ---------------------------------------------------------------------
create or replace function public.haversine_m(lat1 double precision, lon1 double precision,
                                              lat2 double precision, lon2 double precision)
returns double precision
language sql immutable
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  )));
$$;

-- Cek QR (dipakai halaman scan sebelum mengambil GPS)
create or replace function public.check_qr(p_code text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  q public.attendance_qr;
  sudah boolean;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into q from public.attendance_qr where qr_code = trim(p_code);
  if not found then return json_build_object('ok', false, 'code', 'invalid'); end if;
  if not q.is_active then return json_build_object('ok', false, 'code', 'inactive'); end if;
  if now() < q.starts_at then return json_build_object('ok', false, 'code', 'not_started'); end if;
  if now() > q.expires_at then return json_build_object('ok', false, 'code', 'expired'); end if;

  select exists (
    select 1 from public.attendance
    where user_id = auth.uid()
      and tanggal = (now() at time zone 'Asia/Jakarta')::date
  ) into sudah;

  return json_build_object(
    'ok', true, 'title', q.title,
    'latitude', q.latitude, 'longitude', q.longitude, 'radius', q.radius,
    'starts_at', q.starts_at, 'expires_at', q.expires_at, 'already', sudah
  );
end;
$$;

-- Simpan absensi: validasi ulang QR, masa berlaku, radius, dan absen ganda
create or replace function public.submit_attendance(
  p_code text, p_lat double precision, p_lng double precision, p_accuracy double precision default null
)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  q public.attendance_qr;
  prof public.profiles;
  jarak double precision;
  stat text;
  tgl date := (now() at time zone 'Asia/Jakarta')::date;
  wkt time := date_trunc('second', now() at time zone 'Asia/Jakarta')::time;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = auth.uid();
  if found and not prof.is_active then
    return json_build_object('ok', false, 'code', 'inactive_user');
  end if;

  select * into q from public.attendance_qr where qr_code = trim(p_code);
  if not found then return json_build_object('ok', false, 'code', 'invalid'); end if;
  if not q.is_active then return json_build_object('ok', false, 'code', 'inactive'); end if;
  if now() < q.starts_at then return json_build_object('ok', false, 'code', 'not_started'); end if;
  if now() > q.expires_at then return json_build_object('ok', false, 'code', 'expired'); end if;

  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return json_build_object('ok', false, 'code', 'bad_location');
  end if;

  jarak := public.haversine_m(q.latitude, q.longitude, p_lat, p_lng);
  if jarak > q.radius then
    return json_build_object('ok', false, 'code', 'out_of_radius',
                             'distance', round(jarak::numeric, 1), 'radius', q.radius);
  end if;

  if exists (select 1 from public.attendance where user_id = auth.uid() and tanggal = tgl) then
    return json_build_object('ok', false, 'code', 'already');
  end if;

  stat := case when now() > q.starts_at + make_interval(mins => q.late_after_minutes)
               then 'Terlambat' else 'Hadir' end;

  begin
    insert into public.attendance
      (user_id, nama, email, tanggal, waktu, status, latitude, longitude, accuracy, distance, qr_code, qr_id)
    values
      (auth.uid(),
       coalesce(prof.full_name, ''),
       coalesce(prof.email, (select email from auth.users where id = auth.uid())),
       tgl, wkt, stat, p_lat, p_lng, p_accuracy, jarak, q.qr_code, q.id);
  exception when unique_violation then
    return json_build_object('ok', false, 'code', 'already');
  end;

  return json_build_object('ok', true, 'status', stat, 'tanggal', tgl, 'waktu', wkt,
                           'distance', round(jarak::numeric, 1), 'radius', q.radius, 'title', q.title);
end;
$$;

-- Statistik dashboard user
create or replace function public.my_stats()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'total', (select count(*) from public.attendance where user_id = auth.uid()),
    'this_month', (select count(*) from public.attendance
                   where user_id = auth.uid()
                     and tanggal >= date_trunc('month', now() at time zone 'Asia/Jakarta')::date),
    'late', (select count(*) from public.attendance where user_id = auth.uid() and status = 'Terlambat'),
    'absent', (select count(*) from public.attendance_qr q
               where q.is_active and q.expires_at < now()
                 and q.starts_at >= coalesce((select created_at from public.profiles where id = auth.uid()), '-infinity'::timestamptz)
                 and not exists (select 1 from public.attendance a
                                 where a.user_id = auth.uid() and a.qr_id = q.id))
  );
$$;

revoke all on function public.check_qr(text) from public, anon;
revoke all on function public.submit_attendance(text, double precision, double precision, double precision) from public, anon;
revoke all on function public.my_stats() from public, anon;
grant execute on function public.check_qr(text) to authenticated;
grant execute on function public.submit_attendance(text, double precision, double precision, double precision) to authenticated;
grant execute on function public.my_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 5. MANUAL: jadikan akun tertentu sebagai admin (jika perlu)
-- ---------------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'email-admin@anda.com';
-- Cek hasilnya:
-- select email, role from public.profiles order by created_at;
