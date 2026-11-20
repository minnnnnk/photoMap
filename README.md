# photoMap

지도에 사진을 핀으로 꽂아 두는 사진 지도 앱입니다.
사진을 고르면 사진에 담긴 위치(GPS)에 핀이 자동으로 놓이고, 위치 정보가 없으면 지도에서 직접 고를 수 있습니다.
iOS와 Android를 모두 지원하고, 국내와 해외 지도를 모두 쓸 수 있습니다.

> 내 핀은 기기 안에만 저장합니다. 공유 앨범만 서버(Supabase)에 올라갑니다.

## 주요 기능

- **사진 핀**: 지도 위에 대표 사진이 동그란 썸네일로 보이고, 사진이 여러 장이면 장수가 표시됩니다.
- **사진 추가**: `+` 버튼을 누르거나 지도를 길게 눌러 시작합니다. 핀 하나에 사진을 최대 20장까지 넣을 수 있습니다.
- **위치 자동 지정**: 사진 EXIF에 담긴 GPS로 핀 위치를 정합니다. 위치 정보가 없으면 지도를 눌러 직접 고릅니다.
- **제목과 메모**: 장소마다 제목과 메모를 남길 수 있습니다.
- **핀 상세**: 사진을 옆으로 넘겨 보면서 촬영 시각, 좌표, 메모를 확인하고 핀을 지울 수 있습니다.
- **핀 수정**: 제목, 메모, 위치를 고치고 사진을 더하거나 뺄 수 있습니다. 사진을 누르면 대표 사진(지도 핀에 보이는 사진)이 바뀝니다.
- **앨범**: 핀을 앨범(예: "2026 제주 여행")에 넣을 수 있습니다. 지도 위쪽에서 앨범을 고르면 그 앨범의 핀만 보이고, 핀들을 촬영 순서대로 점선으로 이어 경로처럼 보여 줍니다. 앨범 버튼을 길게 누르면 이름을 바꾸거나 지울 수 있고, 앨범을 지워도 핀은 남습니다.
- **백업과 복원**: 지도 위쪽의 "백업" 버튼에서 핀·사진·앨범을 백업 파일(.zip) 하나로 만들어 iCloud Drive, Google Drive 등에 보관할 수 있습니다. 새 폰에서 백업 파일을 고르면 이 폰에 없는 핀만 더해서 되살립니다.
- **공유 앨범**: 지도 위쪽 "공유" 버튼에서 이메일로 받은 코드로 로그인하고, 공유 앨범을 만들어 초대 코드를 보내거나 받은 코드로 참여합니다. 앨범 주인은 이름을 바꾸고 멤버를 내보내거나 앨범을 지울 수 있습니다.
- **내 위치에서 시작**: 위치 권한을 허용하면 현재 위치에서 지도가 열리고, 거절하면 서울에서 열립니다.

## 기술 스택

| 구분 | 사용 기술 |
| --- | --- |
| 프레임워크 | Expo SDK 58, React Native 0.88, React 19, TypeScript |
| 화면 이동 | expo-router (파일 기반 라우팅) |
| 지도 | react-native-maps (iOS는 Apple 지도, Android는 Google 지도) |
| 사진 선택 | expo-image-picker |
| 저장 | expo-sqlite (핀·사진 정보), expo-file-system (사진 파일) |
| 위치 | expo-location |
| 백업 | fflate (zip 만들기·읽기), expo-sharing (공유 창) |
| 공유 | Supabase (로그인, Postgres + RLS, 사진 저장소), @supabase/supabase-js |

## 시작하기

### 준비물

- Node.js (개발에는 22 버전을 사용했습니다)
- 휴대폰에 설치한 **Expo Go** 앱 (App Store / Google Play)

### 설치와 실행

```bash
git clone git@github.com:minnnnnk/photoMap.git
cd photoMap
npm install
npx expo start
```

터미널에 QR 코드가 나오면 휴대폰으로 찍어 Expo Go에서 앱을 엽니다.

- iPhone: 기본 카메라 앱으로 찍습니다.
- Android: Expo Go 앱 안에서 찍습니다.

컴퓨터와 휴대폰이 같은 Wi-Fi에 연결되어 있어야 합니다. 연결이 안 되면 `npx expo start --tunnel`로 실행해 보세요.

### 공유 기능 설정 (Supabase)

공유 앨범을 쓰려면 Supabase 프로젝트가 필요합니다. 설정하지 않아도 공유를 뺀 나머지 기능은 그대로 동작합니다.

1. 프로젝트 루트에 `.env.local`을 만들고 Supabase의 Project URL과 **publishable 키**를 넣습니다. 이 파일은 git에 올라가지 않습니다. `secret`·`service_role` 키는 절대 넣지 마세요.
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<프로젝트>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
2. Supabase 대시보드의 **SQL Editor**에서 `supabase/migrations/` 안의 SQL을 실행합니다. 여러 번 실행해도 안전합니다.
3. **Authentication → Emails**의 **Magic Link**와 **Confirm signup** 템플릿에 `{{ .Token }}`을 넣습니다. 로그인 메일에 코드가 담기게 하기 위해서입니다.

Supabase의 기본 메일 발송은 시간당 2통으로 제한됩니다. 로그인은 한 번 하면 유지됩니다.

### 개발 명령어

| 명령어 | 설명 |
| --- | --- |
| `npx expo start` | 개발 서버 실행 |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | 린트 |
| `npx expo install <패키지>` | Expo SDK 버전에 맞는 패키지 설치 (`npm install <패키지>` 대신 사용) |
| `npx expo-doctor` | 의존성과 설정 점검 |

## 프로젝트 구조

```
src/
├── app/                  # 화면 (expo-router: 파일 하나가 화면 하나)
│   ├── _layout.tsx       # 공통 레이아웃: DB 연결, 화면 스택
│   ├── index.tsx         # 지도 화면 (앨범 걸러 보기, 경로 선)
│   ├── backup.tsx        # 백업과 복원 화면 (모달)
│   ├── share/
│   │   ├── index.tsx     # 공유 화면: 로그인, 닉네임, 내 공유 앨범, 만들기·참여
│   │   └── [id].tsx      # 공유 앨범 화면: 초대 코드, 멤버, 이름 바꾸기, 나가기·지우기
│   ├── album/
│   │   └── [id].tsx      # 앨범 편집 화면 (모달)
│   └── pin/
│       ├── new.tsx       # 사진 추가 화면 (모달)
│       └── [id]/
│           ├── index.tsx # 핀 상세 화면
│           └── edit.tsx  # 핀 수정 화면 (모달)
├── components/
│   ├── AlbumPicker.tsx   # 앨범 고르기와 새 앨범 만들기
│   ├── Chip.tsx          # 동그란 선택 버튼
│   ├── PhotoMarker.tsx   # 사진 썸네일 지도 핀
│   └── PinForm.tsx       # 사진 추가·핀 수정 화면이 함께 쓰는 입력 양식
├── db/
│   ├── migrations.ts     # 테이블 생성과 스키마 버전 관리
│   ├── albums.ts         # 앨범 조회, 추가, 이름 변경, 삭제 쿼리
│   ├── backup.ts         # 백업용 전체 읽기, 복원한 행 넣기
│   └── pins.ts           # 핀·사진 조회, 추가, 수정, 삭제 쿼리
└── lib/
    ├── albumActions.ts   # 앨범 만들기·이름 바꾸기·지우기 (이름 검사 포함)
    ├── auth.tsx          # 로그인 상태 (이메일 코드 로그인, 닉네임)
    ├── backup.ts         # 백업 파일 만들기·공유·복원 (파일과 DB 처리)
    ├── backupArchive.ts  # 백업 zip 쓰기·읽기, 목록 검사, 가져올 것 정하기 (Expo 비의존)
    ├── exif.ts           # 사진 EXIF에서 GPS와 촬영 시각 읽기
    ├── photoStorage.ts   # 사진 파일 복사와 삭제
    ├── pinActions.ts     # 핀 저장·수정·삭제 (사진 파일과 DB를 함께 처리)
    ├── shareErrors.ts    # 서버 오류를 한국어 문장으로
    ├── sharedAlbums.ts   # 공유 앨범 만들기·참여·이름 변경·멤버·삭제 (서버)
    ├── supabase.ts       # Supabase 클라이언트
    ├── format.ts         # 날짜와 좌표 표시 형식
    └── types.ts          # 공통 타입

supabase/
└── migrations/           # 서버 스키마 SQL (테이블, RLS 정책, 사진 저장소)
```

## 데이터 저장 방식

모든 데이터는 기기 안에만 저장되고 서버로 보내지 않습니다.

- **사진 파일**: 고른 사진을 앱 전용 폴더(`documents/photos`)에 복사해 둡니다. 휴대폰 앨범의 원본은 건드리지 않으므로, 핀을 지워도 원본 사진은 그대로 남습니다.
- **DB** (SQLite, `photomap.db`)
  - `pins`: 핀의 제목, 메모, 위도·경도, 앨범, 만든 시각과 고친 시각
  - `albums`: 앨범 이름, 만든 시각과 고친 시각. 앨범을 지우면 핀은 남고 앨범에서만 빠집니다.
  - `photos`: 핀에 속한 사진의 파일 이름, 크기, 촬영 시각, 위치(EXIF GPS), 순서. 핀을 지우면 함께 지워집니다.
- DB에는 사진의 전체 경로가 아니라 파일 이름만 저장합니다. iOS에서는 앱을 업데이트하면 앱 폴더 경로가 바뀔 수 있기 때문입니다.
- 나중에 공유와 동기화를 붙이기 쉽도록 ID는 UUID로, 시각은 ISO 8601 문자열로 저장합니다.
- **백업 파일**은 표준 zip입니다. 첫 항목 `backup.json`에 앨범·핀·사진 목록이, `photos/` 폴더에 사진 원본이 들어 있습니다. 사진이 많아도 메모리가 넘치지 않도록 조금씩 쓰고 읽습니다. 복원할 때는 목록을 검사하고(경로를 벗어나는 파일 이름, 범위 밖 좌표 등 거부), 중간에 끊긴 파일이면 아무것도 바꾸지 않고 실패합니다.
- 스키마를 바꿀 때는 `src/db/migrations.ts`의 `DATABASE_VERSION`을 올리고, 그 버전으로 넘어가는 단계를 추가합니다. 단계들은 한 트랜잭션에서 실행되어, 중간에 실패하면 이전 버전 그대로 남습니다.

## 알아 둘 점

- **Android의 사진 위치 정보**: Android 사진 선택기는 사진의 위치 정보를 지우고 넘겨줄 수 있습니다. 이럴 때는 지도에서 위치를 직접 골라야 합니다.
- **웹은 지원하지 않습니다**: react-native-maps가 웹을 지원하지 않기 때문입니다.
- **직접 빌드할 때**: Expo Go에서는 지도 설정이 필요 없습니다. 하지만 앱을 직접 빌드할 때 Android에서 Google 지도를 쓰려면 Google Maps API 키가 필요하고, `react-native-maps` 설정 플러그인으로 넣습니다.

## 작업 흐름

기본 브랜치는 `develop`이고, 모든 변경은 이슈와 PR을 거쳐 들어갑니다.

1. 할 일을 **이슈**로 만듭니다.
2. `develop`에서 브랜치를 땁니다. 이름은 `feat/<이슈 번호>-<짧은 이름>` 형식이고, 버그는 `fix/`, 문서는 `docs/`로 시작합니다.
3. 작업을 커밋하고 푸시한 뒤 `develop`으로 **PR**을 엽니다. PR 본문에 `Closes #<이슈 번호>`를 넣으면 머지될 때 이슈가 함께 닫힙니다.
4. PR에서 **자동 머지**를 켭니다 (`gh pr merge --auto --squash`).
5. GitHub Actions의 CI(`check`: 타입 검사와 린트)가 통과하면 PR이 스쿼시 머지되고 브랜치는 자동으로 지워집니다.

`develop`은 CI 통과를 요구하도록 보호되어 있습니다. CI 설정은 `.github/workflows/ci.yml`에 있습니다.

## 앞으로 할 일

- [x] 핀 수정 (제목·메모·위치 고치기, 사진 추가·빼기, 대표 사진 바꾸기)
- [x] 여러 핀을 앨범으로 묶기 (예: "2026 제주 여행")
- [x] 데이터 백업과 복원 (백업 파일)
- [ ] 다른 사람과 지도 공유
