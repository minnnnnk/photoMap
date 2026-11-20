-- photoMap 공유 기능 서버 스키마
-- Supabase 대시보드의 SQL Editor에 통째로 붙여 넣고 실행한다. 여러 번 실행해도 안전하다.
--
-- 구조
--   profiles       사용자 닉네임
--   shared_albums  공유 앨범 (owner_id = 만든 사람, invite_code = 초대 코드)
--   album_members  앨범 멤버 (owner 1명 + member 여러 명)
--   shared_pins    공유 앨범의 핀 (author_id = 올린 사람)
--   shared_photos  공유 핀의 사진 (사진 파일은 저장소 버킷 shared-photos의 {album_id}/{photo_id}.{확장자})
--
-- 보안 원칙
--   - 모든 테이블에 RLS를 켜고, 앨범 멤버만 그 앨범의 내용을 볼 수 있다.
--   - 핀·사진은 올린 사람만 고칠 수 있고, 올린 사람이나 앨범 주인이 지울 수 있다.
--   - 멤버 추가는 초대 코드로 참여하는 함수(join_album)로만 가능하다.
--   - 소유자·작성자·초대 코드처럼 클라이언트가 정하면 안 되는 값은 트리거가 정한다.

create schema if not exists private;

-- =====================================================================
-- 테이블
-- =====================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null check (char_length(btrim(nickname)) between 1 and 20),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.shared_albums (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  owner_id     uuid not null references auth.users (id) on delete cascade,
  invite_code  text not null unique,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.album_members (
  album_id   uuid not null references public.shared_albums (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (album_id, user_id)
);
create index if not exists album_members_user_id_idx on public.album_members (user_id);

create table if not exists public.shared_pins (
  id          uuid primary key,
  album_id    uuid not null references public.shared_albums (id) on delete cascade,
  author_id   uuid references auth.users (id) on delete set null,
  title       text not null default '' check (char_length(title) <= 80),
  memo        text not null default '' check (char_length(memo) <= 5000),
  latitude    double precision not null check (latitude between -90 and 90),
  longitude   double precision not null check (longitude between -180 and 180),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists shared_pins_album_id_idx on public.shared_pins (album_id);

create table if not exists public.shared_photos (
  id            uuid primary key,
  pin_id        uuid not null references public.shared_pins (id) on delete cascade,
  album_id      uuid not null references public.shared_albums (id) on delete cascade,
  storage_path  text not null unique,
  width         integer,
  height        integer,
  taken_at      text,
  latitude      double precision check (latitude between -90 and 90),
  longitude     double precision check (longitude between -180 and 180),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists shared_photos_pin_id_idx on public.shared_photos (pin_id, sort_order);
create index if not exists shared_photos_album_id_idx on public.shared_photos (album_id);

-- =====================================================================
-- 권한 확인 함수 (RLS 정책에서 사용, 정책끼리 서로 참조해 생기는 재귀를 피하려고 security definer)
-- =====================================================================

create or replace function private.is_album_member(p_album_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.album_members m
    where m.album_id = p_album_id and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_album_owner(p_album_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shared_albums a
    where a.id = p_album_id and a.owner_id = (select auth.uid())
  );
$$;

-- 저장소 경로의 첫 폴더(문자열)로 확인한다. 잘못된 경로여도 uuid 변환 오류 없이 false가 된다.
create or replace function private.is_album_member_by_folder(p_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.album_members m
    where m.album_id::text = p_folder and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_album_owner_by_folder(p_folder text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shared_albums a
    where a.id::text = p_folder and a.owner_id = (select auth.uid())
  );
$$;

-- 나와 같은 앨범에 있는 사용자인지 (닉네임을 볼 수 있는지)
create or replace function private.shares_album_with(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.album_members mine
    join public.album_members theirs on theirs.album_id = mine.album_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

revoke all on function
  private.is_album_member(uuid),
  private.is_album_owner(uuid),
  private.is_album_member_by_folder(text),
  private.is_album_owner_by_folder(text),
  private.shares_album_with(uuid)
from public, anon;
grant usage on schema private to authenticated;
grant execute on function
  private.is_album_member(uuid),
  private.is_album_owner(uuid),
  private.is_album_member_by_folder(text),
  private.is_album_owner_by_folder(text),
  private.shares_album_with(uuid)
to authenticated;

-- =====================================================================
-- 트리거: 클라이언트가 정하면 안 되는 값을 서버가 정한다
-- =====================================================================

create or replace function private.profiles_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.nickname := btrim(new.nickname);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.albums_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.owner_id := auth.uid();
  -- 10자리 16진수 초대 코드 (약 1조 가지)
  new.invite_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  new.name := btrim(new.name);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.albums_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.album_members (album_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return null;
end;
$$;

create or replace function private.albums_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 이름만 바꿀 수 있다.
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.invite_code := old.invite_code;
  new.created_at := old.created_at;
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.pins_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.author_id := auth.uid();
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.pins_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 다른 앨범으로 옮기거나 작성자를 바꿀 수 없다.
  new.id := old.id;
  new.album_id := old.album_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.photos_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 앨범은 핀에서 가져오고, 저장소 경로가 그 앨범 폴더 안인지 확인한다.
  select p.album_id into new.album_id from public.shared_pins p where p.id = new.pin_id;
  if new.album_id is null then
    raise exception 'pin not found' using errcode = '23503';
  end if;
  if new.storage_path not like new.album_id::text || '/%' or new.storage_path like '%..%' then
    raise exception 'storage_path must be inside the album folder' using errcode = '22023';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create or replace function private.photos_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- 순서 등 부가 정보만 바꿀 수 있다.
  new.id := old.id;
  new.pin_id := old.pin_id;
  new.album_id := old.album_id;
  new.storage_path := old.storage_path;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists profiles_before_write on public.profiles;
create trigger profiles_before_write before insert or update on public.profiles
  for each row execute function private.profiles_before_write();

drop trigger if exists albums_before_insert on public.shared_albums;
create trigger albums_before_insert before insert on public.shared_albums
  for each row execute function private.albums_before_insert();

drop trigger if exists albums_after_insert on public.shared_albums;
create trigger albums_after_insert after insert on public.shared_albums
  for each row execute function private.albums_after_insert();

drop trigger if exists albums_before_update on public.shared_albums;
create trigger albums_before_update before update on public.shared_albums
  for each row execute function private.albums_before_update();

drop trigger if exists pins_before_insert on public.shared_pins;
create trigger pins_before_insert before insert on public.shared_pins
  for each row execute function private.pins_before_insert();

drop trigger if exists pins_before_update on public.shared_pins;
create trigger pins_before_update before update on public.shared_pins
  for each row execute function private.pins_before_update();

drop trigger if exists photos_before_insert on public.shared_photos;
create trigger photos_before_insert before insert on public.shared_photos
  for each row execute function private.photos_before_insert();

drop trigger if exists photos_before_update on public.shared_photos;
create trigger photos_before_update before update on public.shared_photos
  for each row execute function private.photos_before_update();

-- =====================================================================
-- 초대 코드로 참여 (멤버를 추가하는 유일한 방법)
-- =====================================================================

create or replace function public.join_album(p_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_album_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select a.id into v_album_id
  from public.shared_albums a
  where a.invite_code = upper(btrim(p_code));
  if v_album_id is null then
    raise exception 'invite code not found' using errcode = 'P0002';
  end if;
  insert into public.album_members (album_id, user_id, role)
  values (v_album_id, auth.uid(), 'member')
  on conflict (album_id, user_id) do nothing;
  return v_album_id;
end;
$$;

revoke all on function public.join_album(text) from public, anon;
grant execute on function public.join_album(text) to authenticated;

-- =====================================================================
-- 테이블 권한과 RLS 정책
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.shared_albums enable row level security;
alter table public.album_members enable row level security;
alter table public.shared_pins enable row level security;
alter table public.shared_photos enable row level security;

revoke all on table
  public.profiles, public.shared_albums, public.album_members, public.shared_pins, public.shared_photos
from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.shared_albums to authenticated;
grant select, delete on table public.album_members to authenticated;
grant select, insert, update, delete on table public.shared_pins to authenticated;
grant select, insert, update, delete on table public.shared_photos to authenticated;

-- profiles: 나 자신과 같은 앨범 멤버의 닉네임만 볼 수 있고, 내 것만 만들고 고칠 수 있다.
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_album_with(id));
drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- shared_albums: 멤버가 보고, 누구나 만들 수 있고(주인은 트리거가 정함), 주인만 이름을 바꾸고 지운다.
-- select에 owner_id 조건도 두는 이유: insert ... returning 시점에는 주인 멤버 행이 아직 없다.
drop policy if exists "albums_select" on public.shared_albums;
create policy "albums_select" on public.shared_albums for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_album_member(id));
drop policy if exists "albums_insert" on public.shared_albums;
create policy "albums_insert" on public.shared_albums for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists "albums_update" on public.shared_albums;
create policy "albums_update" on public.shared_albums for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "albums_delete" on public.shared_albums;
create policy "albums_delete" on public.shared_albums for delete to authenticated
  using (owner_id = (select auth.uid()));

-- album_members: 멤버끼리 서로 보고, 멤버는 스스로 나가고, 주인은 다른 멤버를 내보낸다. 주인 행은 지울 수 없다.
drop policy if exists "members_select" on public.album_members;
create policy "members_select" on public.album_members for select to authenticated
  using (private.is_album_member(album_id));
drop policy if exists "members_delete" on public.album_members;
create policy "members_delete" on public.album_members for delete to authenticated
  using (
    role <> 'owner'
    and (user_id = (select auth.uid()) or private.is_album_owner(album_id))
  );

-- shared_pins: 멤버가 보고 올리며, 올린 사람만 고치고, 올린 사람이나 주인이 지운다.
drop policy if exists "pins_select" on public.shared_pins;
create policy "pins_select" on public.shared_pins for select to authenticated
  using (private.is_album_member(album_id));
drop policy if exists "pins_insert" on public.shared_pins;
create policy "pins_insert" on public.shared_pins for insert to authenticated
  with check (private.is_album_member(album_id) and author_id = (select auth.uid()));
drop policy if exists "pins_update" on public.shared_pins;
create policy "pins_update" on public.shared_pins for update to authenticated
  using (author_id = (select auth.uid()) and private.is_album_member(album_id))
  with check (author_id = (select auth.uid()));
drop policy if exists "pins_delete" on public.shared_pins;
create policy "pins_delete" on public.shared_pins for delete to authenticated
  using (
    private.is_album_member(album_id)
    and (author_id = (select auth.uid()) or private.is_album_owner(album_id))
  );

-- shared_photos: 멤버가 보고, 핀을 올린 사람만 사진을 더하거나 고치며, 핀 작성자나 주인이 지운다.
drop policy if exists "photos_select" on public.shared_photos;
create policy "photos_select" on public.shared_photos for select to authenticated
  using (private.is_album_member(album_id));
drop policy if exists "photos_insert" on public.shared_photos;
create policy "photos_insert" on public.shared_photos for insert to authenticated
  with check (
    private.is_album_member(album_id)
    and exists (
      select 1 from public.shared_pins p
      where p.id = pin_id and p.author_id = (select auth.uid())
    )
  );
drop policy if exists "photos_update" on public.shared_photos;
create policy "photos_update" on public.shared_photos for update to authenticated
  using (
    exists (
      select 1 from public.shared_pins p
      where p.id = pin_id and p.author_id = (select auth.uid())
    )
  );
drop policy if exists "photos_delete" on public.shared_photos;
create policy "photos_delete" on public.shared_photos for delete to authenticated
  using (
    exists (
      select 1 from public.shared_pins p
      where p.id = pin_id
        and (p.author_id = (select auth.uid()) or private.is_album_owner(p.album_id))
    )
  );

-- =====================================================================
-- 사진 저장소: 비공개 버킷 shared-photos, 경로 {album_id}/{photo_id}.{확장자}
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-photos', 'shared-photos', false, 31457280,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shared_photos_storage_select" on storage.objects;
create policy "shared_photos_storage_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'shared-photos'
    and private.is_album_member_by_folder((storage.foldername(name))[1])
  );
drop policy if exists "shared_photos_storage_insert" on storage.objects;
create policy "shared_photos_storage_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shared-photos'
    and private.is_album_member_by_folder((storage.foldername(name))[1])
  );
drop policy if exists "shared_photos_storage_delete" on storage.objects;
create policy "shared_photos_storage_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'shared-photos'
    and (
      owner_id = (select auth.uid()::text)
      or private.is_album_owner_by_folder((storage.foldername(name))[1])
    )
  );
