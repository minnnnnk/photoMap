import { MAX_ALBUM_NAME } from './albumActions';
import { requireSupabase, SHARED_PHOTO_BUCKET } from './supabase';

export type SharedAlbum = {
  id: string;
  name: string;
  ownerId: string;
  inviteCode: string;
  memberCount: number;
  createdAt: string;
};

export type SharedAlbumMember = {
  userId: string;
  nickname: string;
  role: 'owner' | 'member';
  joinedAt: string;
};

type AlbumRow = {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  album_members: { count: number }[];
};

const ALBUM_COLUMNS = 'id, name, owner_id, invite_code, created_at, album_members(count)';

const toAlbum = (r: AlbumRow): SharedAlbum => ({
  id: r.id,
  name: r.name,
  ownerId: r.owner_id,
  inviteCode: r.invite_code,
  memberCount: r.album_members[0]?.count ?? 0,
  createdAt: r.created_at,
});

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('앨범 이름을 적어 주세요');
  return trimmed.slice(0, MAX_ALBUM_NAME);
}

/** 내가 멤버인 공유 앨범 (최근에 만든 것부터) */
export async function listSharedAlbums(): Promise<SharedAlbum[]> {
  const { data, error } = await requireSupabase()
    .from('shared_albums')
    .select(ALBUM_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as AlbumRow[]).map(toAlbum);
}

export async function getSharedAlbum(
  id: string,
): Promise<{ album: SharedAlbum; members: SharedAlbumMember[] } | null> {
  const client = requireSupabase();
  const { data, error } = await client.from('shared_albums').select(ALBUM_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { data: memberRows, error: memberError } = await client
    .from('album_members')
    .select('user_id, role, joined_at')
    .eq('album_id', id)
    .order('joined_at');
  if (memberError) throw memberError;

  const ids = memberRows.map((m) => m.user_id as string);
  const { data: profiles, error: profileError } = await client
    .from('profiles')
    .select('id, nickname')
    .in('id', ids);
  if (profileError) throw profileError;
  const nicknames = new Map(profiles.map((p) => [p.id as string, p.nickname as string]));

  return {
    album: toAlbum(data as AlbumRow),
    members: memberRows.map((m) => ({
      userId: m.user_id as string,
      nickname: nicknames.get(m.user_id as string) ?? '(닉네임 없음)',
      role: m.role as 'owner' | 'member',
      joinedAt: m.joined_at as string,
    })),
  };
}

export async function createSharedAlbum(name: string): Promise<SharedAlbum> {
  // 주인과 초대 코드는 서버 트리거가 정한다.
  const { data, error } = await requireSupabase()
    .from('shared_albums')
    .insert({ name: cleanName(name) })
    .select('id, name, owner_id, invite_code, created_at')
    .single();
  if (error) throw error;
  return toAlbum({ ...(data as Omit<AlbumRow, 'album_members'>), album_members: [{ count: 1 }] });
}

/** 초대 코드로 참여하고 앨범 ID를 돌려준다. */
export async function joinSharedAlbum(code: string): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) throw new Error('초대 코드를 적어 주세요');
  const { data, error } = await requireSupabase().rpc('join_album', { p_code: trimmed });
  if (error) throw error;
  return data as string;
}

export async function renameSharedAlbum(id: string, name: string): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('shared_albums')
    .update({ name: cleanName(name) })
    .eq('id', id)
    .select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('이름을 바꿀 권한이 없어요');
}

/** 멤버를 앨범에서 뺀다. 나 자신이면 나가기, 주인이 남을 빼면 내보내기. */
export async function removeMember(albumId: string, userId: string): Promise<void> {
  const { data, error } = await requireSupabase()
    .from('album_members')
    .delete()
    .eq('album_id', albumId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  if (data.length === 0) throw new Error('멤버를 뺄 권한이 없어요');
}

/** 앨범 폴더의 사진 파일을 모두 지운 뒤 앨범을 지운다 (주인만). 핀·사진·멤버 행은 DB가 함께 지운다. */
export async function deleteSharedAlbum(id: string): Promise<void> {
  const client = requireSupabase();
  const bucket = client.storage.from(SHARED_PHOTO_BUCKET);
  const PAGE = 1000;
  for (;;) {
    const { data: files, error } = await bucket.list(id, { limit: PAGE });
    if (error) throw error;
    if (files.length === 0) break;
    const { error: removeError } = await bucket.remove(files.map((f) => `${id}/${f.name}`));
    if (removeError) throw removeError;
    if (files.length < PAGE) break;
  }
  const { data, error } = await client.from('shared_albums').delete().eq('id', id).select('id');
  if (error) throw error;
  if (data.length === 0) throw new Error('앨범을 지울 권한이 없어요');
}
