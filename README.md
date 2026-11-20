# photoMap

지도에 사진을 핀으로 꽂아 두는 사진 지도 앱입니다.
사진을 고르면 사진에 담긴 위치(GPS)에 핀이 자동으로 놓이고, 위치 정보가 없으면 지도에서 직접 고를 수 있습니다.
iOS와 Android를 모두 지원하고, 국내와 해외 지도를 모두 쓸 수 있습니다.

> 지금은 혼자 쓰는 기록용 앱이라 데이터를 기기 안에만 저장합니다. 공유 기능은 나중에 추가할 예정입니다.

## 주요 기능

- **사진 핀**: 지도 위에 대표 사진이 동그란 썸네일로 보이고, 사진이 여러 장이면 장수가 표시됩니다.
- **사진 추가**: `+` 버튼을 누르거나 지도를 길게 눌러 시작합니다. 핀 하나에 사진을 최대 20장까지 넣을 수 있습니다.
- **위치 자동 지정**: 사진 EXIF에 담긴 GPS로 핀 위치를 정합니다. 위치 정보가 없으면 지도를 눌러 직접 고릅니다.
- **제목과 메모**: 장소마다 제목과 메모를 남길 수 있습니다.
- **핀 상세**: 사진을 옆으로 넘겨 보면서 촬영 시각, 좌표, 메모를 확인하고 핀을 지울 수 있습니다.
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

## 시작하기

### 준비물

- Node.js (개발에는 22 버전을 사용했습니다)
- 휴대폰에 설치한 **Expo Go** 앱 (App Store / Google Play)

### 설치와 실행

```bash
git clone git@github.com:minnnnnk/photoMap.git
cd photoMap
git switch develop
npm install
npx expo start
```

터미널에 QR 코드가 나오면 휴대폰으로 찍어 Expo Go에서 앱을 엽니다.

- iPhone: 기본 카메라 앱으로 찍습니다.
- Android: Expo Go 앱 안에서 찍습니다.

컴퓨터와 휴대폰이 같은 Wi-Fi에 연결되어 있어야 합니다. 연결이 안 되면 `npx expo start --tunnel`로 실행해 보세요.

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
│   ├── index.tsx         # 지도 화면
│   └── pin/
│       ├── new.tsx       # 사진 추가 화면 (모달)
│       └── [id].tsx      # 핀 상세 화면
├── components/
│   └── PhotoMarker.tsx   # 사진 썸네일 지도 핀
├── db/
│   ├── migrations.ts     # 테이블 생성과 스키마 버전 관리
│   └── pins.ts           # 핀·사진 조회, 추가, 삭제 쿼리
└── lib/
    ├── exif.ts           # 사진 EXIF에서 GPS와 촬영 시각 읽기
    ├── photoStorage.ts   # 사진 파일 복사와 삭제
    ├── pinActions.ts     # 핀 저장과 삭제 (사진 파일과 DB를 함께 처리)
    ├── format.ts         # 날짜와 좌표 표시 형식
    └── types.ts          # 공통 타입
```

## 데이터 저장 방식

모든 데이터는 기기 안에만 저장되고 서버로 보내지 않습니다.

- **사진 파일**: 고른 사진을 앱 전용 폴더(`documents/photos`)에 복사해 둡니다. 휴대폰 앨범의 원본은 건드리지 않으므로, 핀을 지워도 원본 사진은 그대로 남습니다.
- **DB** (SQLite, `photomap.db`)
  - `pins`: 핀의 제목, 메모, 위도·경도, 만든 시각과 고친 시각
  - `photos`: 핀에 속한 사진의 파일 이름, 크기, 촬영 시각, 순서. 핀을 지우면 함께 지워집니다.
- DB에는 사진의 전체 경로가 아니라 파일 이름만 저장합니다. iOS에서는 앱을 업데이트하면 앱 폴더 경로가 바뀔 수 있기 때문입니다.
- 나중에 공유와 동기화를 붙이기 쉽도록 ID는 UUID로, 시각은 ISO 8601 문자열로 저장합니다.
- 스키마를 바꿀 때는 `src/db/migrations.ts`의 `DATABASE_VERSION`을 올리고, 그 버전으로 넘어가는 단계를 추가합니다.

## 알아 둘 점

- **Android의 사진 위치 정보**: Android 사진 선택기는 사진의 위치 정보를 지우고 넘겨줄 수 있습니다. 이럴 때는 지도에서 위치를 직접 골라야 합니다.
- **웹은 지원하지 않습니다**: react-native-maps가 웹을 지원하지 않기 때문입니다.
- **직접 빌드할 때**: Expo Go에서는 지도 설정이 필요 없습니다. 하지만 앱을 직접 빌드할 때 Android에서 Google 지도를 쓰려면 Google Maps API 키가 필요하고, `react-native-maps` 설정 플러그인으로 넣습니다.

## 브랜치

모든 작업은 `develop` 브랜치에서 합니다.

## 앞으로 할 일

- [ ] 핀 수정 (제목·메모 고치기, 사진 추가·빼기)
- [ ] 여러 핀을 앨범으로 묶기 (예: "2026 제주 여행")
- [ ] 클라우드 백업
- [ ] 다른 사람과 지도 공유
