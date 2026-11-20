-- photoMap 공유 핀 수정 함수
-- 20261120000000_shared_albums.sql 다음에 SQL Editor에서 실행한다. 여러 번 실행해도 안전하다.
--
-- 핀 수정은 제목·메모·위치 변경, 사진 빼기, 순서 바꾸기, 새 사진 추가가 한꺼번에 일어난다.
-- 앱에서 하나씩 보내다 중간에 끊기면 반쯤 바뀐 핀이 남으므로, 이 함수가 한 트랜잭션으로 처리한다.
-- security invoker라서 RLS가 그대로 적용된다 (핀 작성자만 성공).
-- 새 사진 파일은 앱이 미리 저장소에 올려 두고, 빠진 사진의 저장 경로는 돌려받아 앱이 저장소에서 지운다.

create or replace function public.update_shared_pin(
  p_pin_id      uuid,
  p_title       text,
  p_memo        text,
  p_latitude    double precision,
  p_longitude   double precision,
  -- 남길 기존 사진과 새 순서: [{"id": "...", "sort_order": 0}, ...]
  p_keep        jsonb,
  -- 새 사진 행: [{"id", "storage_path", "width", "height", "taken_at", "latitude", "longitude", "sort_order"}, ...]
  p_new_photos  jsonb
)
returns text[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
  v_removed text[];
begin
  update public.shared_pins
  set title = p_title, memo = p_memo, latitude = p_latitude, longitude = p_longitude
  where id = p_pin_id;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'pin not found or not allowed' using errcode = '42501';
  end if;

  with removed as (
    delete from public.shared_photos ph
    where ph.pin_id = p_pin_id
      and ph.id not in (
        select (k ->> 'id')::uuid from jsonb_array_elements(coalesce(p_keep, '[]'::jsonb)) k
      )
    returning ph.storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_removed from removed;

  update public.shared_photos ph
  set sort_order = (k ->> 'sort_order')::int
  from jsonb_array_elements(coalesce(p_keep, '[]'::jsonb)) k
  where ph.pin_id = p_pin_id and ph.id = (k ->> 'id')::uuid;

  -- album_id는 photos_before_insert 트리거가 핀에서 채운다.
  insert into public.shared_photos
    (id, pin_id, album_id, storage_path, width, height, taken_at, latitude, longitude, sort_order)
  select
    (x ->> 'id')::uuid,
    p_pin_id,
    null,
    x ->> 'storage_path',
    (x ->> 'width')::int,
    (x ->> 'height')::int,
    x ->> 'taken_at',
    (x ->> 'latitude')::double precision,
    (x ->> 'longitude')::double precision,
    (x ->> 'sort_order')::int
  from jsonb_array_elements(coalesce(p_new_photos, '[]'::jsonb)) x;

  return v_removed;
end;
$$;

revoke all on function public.update_shared_pin(uuid, text, text, double precision, double precision, jsonb, jsonb)
  from public, anon;
grant execute on function public.update_shared_pin(uuid, text, text, double precision, double precision, jsonb, jsonb)
  to authenticated;
