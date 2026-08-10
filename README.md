# FC Crossbar

아마추어 축구팀 내부용 **출석 투표 · 회비 관리** 모바일 앱.
Android APK 직접 배포 방식이며, 백엔드는 Supabase 무료 티어만 사용한다. (운영 비용 0원)

- **프레임워크**: React Native + Expo (SDK 57) + expo-router
- **백엔드**: Supabase (Auth / PostgreSQL / RLS)
- **배포**: EAS Build 로 APK 생성 → GitHub Releases 등으로 팀원에게 링크 공유

---

## 진행 상황

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트 세팅, Supabase 연결, DB 스키마, RLS, Auth | ✅ 완료 |
| 2 | 회원가입 / 로그인 / 자동 로그인 | ✅ 완료 (Phase 1 에 포함) |
| 3 | 일정 및 참석 투표 | ⬜ 예정 |
| 4 | 참석률 통계 | ⬜ 예정 |
| 5 | 관리자 회비 관리 | ⬜ 예정 |
| 6 | Excel / CSV Import·Export | ⬜ 예정 |
| 7 | APK 빌드 및 배포 | ⬜ 예정 (빌드 설정은 준비됨) |

---

## 폴더 구조

```
fc_crossbar/
├── app.json                  Expo 설정 (앱 이름, android.package, versionCode)
├── eas.json                  EAS Build 프로파일 (모두 APK 출력)
├── .env.example              환경변수 템플릿 (복사해서 .env 로 사용)
│
├── supabase/
│   └── migrations/
│       ├── 0001_schema.sql   테이블 · 인덱스 · 헬퍼함수 · 트리거 · 관리자 RPC
│       ├── 0002_rls.sql      Row Level Security 정책 + 테이블 권한
│       └── 0003_seed.sql     Super Admin 지정 + 샘플 데이터
│
└── src/
    ├── app/                  expo-router 파일 기반 라우팅
    │   ├── _layout.tsx       루트: AuthProvider · 스플래시 · Stack
    │   ├── index.tsx         진입점. 세션 유무로 분기
    │   ├── (auth)/
    │   │   ├── _layout.tsx   로그인 상태면 앱으로 리다이렉트
    │   │   ├── sign-in.tsx   로그인
    │   │   └── sign-up.tsx   회원가입
    │   └── (app)/
    │       ├── _layout.tsx   인증 가드 + 역할별 Bottom Tabs
    │       ├── index.tsx     홈
    │       ├── events.tsx    일정 / 투표      (Phase 3)
    │       ├── stats.tsx     참석률 통계      (Phase 4)
    │       ├── finance.tsx   회비  · 관리자 전용 (Phase 5·6)
    │       ├── admin.tsx     관리  · 관리자 전용 (Phase 5)
    │       └── profile.tsx   내 정보 / 로그아웃
    │
    ├── lib/
    │   ├── supabase.ts       Supabase 클라이언트 (세션 영속화 · 토큰 자동 갱신)
    │   ├── auth-context.tsx  세션 + 프로필 전역 상태, 자동 로그인 처리
    │   └── errors.ts         에러 메시지 한국어화
    │
    ├── components/           공용 UI (버튼 · 입력 · 카드 · 헤더)
    ├── constants/theme.ts    색상 · 여백 토큰
    └── types/database.ts     DB 스키마 TypeScript 타입
```

### 탭 구성

| 역할 | 탭 |
|---|---|
| member | 홈 · 일정 · 통계 · 내 정보 |
| admin / super_admin | 홈 · 일정 · 통계 · 회비 · 관리 (내 정보는 “관리”에서 진입) |

탭을 숨기는 것은 UI 편의일 뿐이고, 실제 차단은 Supabase RLS 가 담당한다.

---

## 0. GitHub 연결

```bash
git remote add origin https://github.com/Hyojin-Moon/fc-crossbar.git
git add -A
git commit -m "Phase 1: 프로젝트 세팅 · Supabase 스키마 · RLS · Auth"
git branch -M main
git push -u origin main
```

`.env` 는 `.gitignore` 에 들어 있어 커밋되지 않는다. (`.env.example` 만 올라간다)

---

## 1. Supabase 프로젝트 설정

### 1-1. 프로젝트 생성 옵션

| 항목 | 값 |
|---|---|
| Organization | 무료 조직 선택 |
| GitHub (optional) | **연결하지 않음** — 마이그레이션은 SQL Editor 로 직접 실행한다 |
| Database password | 강력하게 생성 후 **따로 보관**. 앱은 쓰지 않고 DB 직접 접속·백업 때만 필요 |
| Region | **Northeast Asia (Seoul)** |
| Enable Data API | ✅ 켜기 (supabase-js 가 이 API 를 쓴다) |
| Automatically expose new tables | ☐ **끄기** |
| Enable automatic RLS | ✅ **켜기** |
| Postgres Type | Postgres (DEFAULT) |

> `Automatically expose new tables` 를 꺼도 된다. `0002_rls.sql` 이 8개 테이블의 GRANT 를
> 직접 부여하기 때문이다. 켜 두면 그 GRANT 가 중복될 뿐 동작은 같지만, 나중에 만드는 테이블이
> 자동으로 API 에 노출되므로 Supabase 화면의 권장대로 꺼 두는 편이 안전하다.
> 단, 이후 Table Editor 로 테이블을 새로 만들면 **GRANT 를 직접 넣어야** 한다.
>
> 생성 후에는 바꿀 수 없는 항목(Region, Postgres Type)이 있으니 만들기 전에 확인한다.

### 1-2. 마이그레이션 실행

**SQL Editor** 에서 아래 순서대로 실행한다.

| 순서 | 파일 | 시점 |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | 프로젝트 생성 직후 |
| 2 | `supabase/migrations/0002_rls.sql` | 이어서 바로 |
| 3 | `supabase/migrations/0003_seed.sql` | **앱에서 회원가입한 뒤** |

파일 내용을 통째로 복사해 붙여넣고 **Run** 하면 된다. 세 파일 모두 여러 번 실행해도 안전하다.

### 1-3. 인증 설정

**Authentication > Sign In / Providers > Email**

- 팀 내부용이라 이메일 인증 없이 바로 쓰려면 **Confirm email** 을 **끈다**.
- 켜 두면 가입 후 메일 인증을 해야 로그인된다. (무료 티어는 시간당 메일 발송량 제한이 있다)

### 1-4. 키 복사

**Project Settings > Data API** 에서 `Project URL` 과 `anon public` 키를 복사해 `.env` 에 넣는다.

> ⚠️ `service_role` 키는 앱에 절대 넣지 않는다. 클라이언트는 `anon` 키만 사용하고,
> 실제 보호는 RLS 정책이 담당한다.

---

## 2. 로컬 실행

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 설정
cp .env.example .env
#    .env 를 열어 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 를 채운다

# 3) 개발 서버 실행
npx expo start -c        # -c : 캐시 초기화 (환경변수 바꾼 뒤에는 필수)
```

터미널의 QR 코드를 안드로이드 폰의 **Expo Go** 앱으로 찍으면 바로 실행된다.
(Android Studio 설치는 필요 없다.)

- 안드로이드 에뮬레이터로 열기: `npm run android` — Android Studio 필요
- 웹 브라우저로 열기: `npm run web`
- 타입 검사: `npm run typecheck`

---

## 3. 관리자 계정 설정

`super_admin` 은 **앱에서 부여할 수 없다.** SQL 로만 지정된다.

```sql
-- 1) 먼저 앱에서 정상적으로 회원가입한다 (profiles 행이 트리거로 자동 생성됨)
-- 2) Supabase SQL Editor 에서 실행
update public.profiles p
set    role = 'super_admin', status = 'active'
from   auth.users u
where  u.id = p.user_id
  and  u.email = '본인이메일@example.com';
```

앱을 재시작(또는 “내 정보” 진입)하면 회비 · 관리 탭이 나타난다.

이후 **일반 관리자(admin) 임명/해임은 super_admin 이 앱에서** 할 수 있다 (Phase 5).
내부적으로는 `admin_set_member_role()` RPC 가 서버에서 권한을 다시 검증한다.

### 권한 요약

| | member | admin | super_admin |
|---|---|---|---|
| 일정 조회 / 본인 투표 | ✅ | ✅ | ✅ |
| 일정 생성·수정·삭제, 투표 마감 | ❌ | ✅ | ✅ |
| 회원 활성화 / 비활성화 | ❌ | ✅ (member 대상만) | ✅ |
| 회비 · 지출 조회 및 관리 | ❌ | ✅ | ✅ |
| admin 임명 / 해임 | ❌ | ❌ | ✅ |
| super_admin 계정 수정·삭제 | ❌ | ❌ | ✅ |
| 시스템 설정 · 활동 로그 | ❌ | ❌ | ✅ |

### 권한이 코드가 아니라 DB 로 지켜지는 이유

1. **RLS 정책** — 모든 테이블에 적용. 회비/지출은 `is_admin()` 인 사람만 읽힌다.
2. **컬럼 단위 권한** — `authenticated` 롤에서 `profiles` 의 UPDATE 권한을 회수하고
   `name / nickname / phone` 만 다시 부여했다. 앱에서 `role` 을 직접 UPDATE 하는 것이
   SQL 레벨에서 불가능하다.
3. **트리거** — `protect_profile_privileges()` 가 role/status 변경을 한 번 더 검사한다.
4. **RPC** — 권한 변경·회원 삭제는 `SECURITY DEFINER` 함수를 통해서만 가능하고,
   함수 내부에서 호출자의 role 을 다시 확인한 뒤 `admin_audit_logs` 에 기록한다.

---

## 4. 샘플 데이터

`supabase/migrations/0003_seed.sql` 의 3번 블록을 실행하면
지난 일정 6개 + 예정 일정 2개, 회원별 투표, 최근 3개월 회비, 지출 4건이 생성된다.

관리자 계정이 하나도 없으면 실행이 건너뛰어지므로 **super_admin 지정을 먼저** 해야 한다.
운영 DB 에서는 실행하지 않는다.

---

## 5. APK 빌드

Google Play 등록 없이 APK 파일을 직접 배포한다.

### 방법 A. EAS Build 클라우드 (권장 — 로컬 SDK 불필요)

```bash
npm install -g eas-cli
eas login                  # Expo 계정 (무료)
eas init                   # 프로젝트 연결. app.json 에 projectId 가 추가된다
eas build -p android --profile preview
```

- 빌드가 끝나면 터미널과 <https://expo.dev> 대시보드에 **APK 다운로드 링크**가 나온다.
- `eas.json` 의 세 프로파일 모두 `buildType: "apk"` 로 설정되어 있어 AAB 가 아닌 APK 가 나온다.
- 서명 키는 첫 빌드 때 EAS 가 자동 생성해 보관한다. (`eas credentials` 로 확인/다운로드)
- 무료 계정은 빌드 대기열이 느리고 월 빌드 횟수 제한이 있다.

**환경변수 주의**: `.env` 는 git 에 올라가지 않으므로 클라우드 빌드에는 값이 전달되지 않는다.
아래 중 하나로 등록한다.

```bash
# EAS 서버에 등록 (권장)
eas env:create --name EXPO_PUBLIC_SUPABASE_URL      --value "https://xxxx.supabase.co" --environment preview,production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJhbG..."                --environment preview,production
```

또는 `eas.json` 의 각 프로파일에 `"env": { ... }` 로 직접 적어도 된다.
anon key 는 공개돼도 되는 값이라 어느 쪽이든 무방하다.

### 방법 B. 로컬 빌드

사전 준비:

- **JDK 17** (현재 개발 환경은 JDK 11 이라 그대로는 빌드가 실패한다)
  ```bash
  brew install --cask zulu@17
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)
  ```
- **Android Studio** 설치 후 SDK Platform 35 + Build-Tools 설치, `ANDROID_HOME` 설정

```bash
# EAS 로컬 빌드 (권장)
eas build -p android --profile preview --local

# 또는 순수 Gradle
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
```

### APK 생성 위치

| 방법 | 경로 |
|---|---|
| EAS 클라우드 | expo.dev 대시보드의 다운로드 링크 |
| `--local` | 프로젝트 루트의 `build-*.apk` |
| Gradle | `android/app/build/outputs/apk/release/app-release.apk` |

### 서명된 APK

- **EAS 사용 시**: 별도 작업 불필요. 첫 빌드에서 keystore 가 자동 생성·보관된다.
  백업하려면 `eas credentials` → Android → Keystore → Download.
- **직접 서명할 경우**:
  ```bash
  keytool -genkeypair -v -keystore fc-crossbar.jks -alias fc-crossbar \
          -keyalg RSA -keysize 2048 -validity 10000
  ```
  `.jks` 파일은 `.gitignore` 에 이미 포함되어 있다. **분실하면 기존 설치본을 덮어쓸 수 없으니 반드시 백업**한다.

---

## 6. 팀원 배포

### GitHub Releases 이용 (권장)

```bash
git tag v1.0.0
git push origin v1.0.0
gh release create v1.0.0 ./fc-crossbar-v1.0.0.apk \
  --title "FC Crossbar v1.0.0" \
  --notes "참석 투표 기능 추가"
```

팀 카톡방에 Release 페이지 링크를 공유하면 각자 APK 를 받아 설치한다.

새 버전을 낼 때는 세 곳을 함께 올린다.

- `app.json` → `expo.version` (예: `1.0.1`)
- `app.json` → `expo.android.versionCode` (정수, **반드시 증가**. 안 올리면 덮어쓰기 설치가 안 된다)
- git 태그

### 안드로이드에서 “알 수 없는 앱 설치” 허용

스토어를 거치지 않은 APK 는 기본적으로 차단된다. 최초 1회만 허용하면 된다.

1. 링크로 APK 를 다운로드한다.
2. 파일을 탭하면 **“이 출처의 앱 설치 차단됨”** 안내가 뜬다.
3. **설정** 을 누르거나
   → `설정 > 앱 > 특별한 앱 접근 > 알 수 없는 앱 설치` 로 이동
4. 방금 사용한 앱(**Chrome**, **내 파일**, **카카오톡** 등)을 골라 **이 출처 허용** 을 켠다.
5. 뒤로 가서 다시 설치를 누른다.
6. Play 프로텍트 경고가 나오면 **무시하고 설치** 를 선택한다.

> 기기 제조사에 따라 메뉴 이름이 조금씩 다르다.
> 삼성: `설정 > 보안 및 개인 정보 보호 > 기타 보안 설정 > 알 수 없는 앱 설치`

---

## 7. 데이터베이스 요약

| 테이블 | 설명 | 접근 |
|---|---|---|
| `profiles` | 회원 (id 와 user_id 분리, 다른 FK 는 모두 `profiles.id` 참조) | 활성 회원 조회 가능 |
| `events` | 경기 / 모임 | 조회: 전체 · 쓰기: 관리자 |
| `event_votes` | 참석 투표 (`event_id + member_id` UNIQUE) | 본인 투표만 쓰기 |
| `vote_options` | 투표 선택지 (참석/불참/미정 + 확장용 지각/조기귀가/게스트) | 조회: 전체 |
| `membership_payments` | 회비 납부 (`member_id + year + month` UNIQUE) | 관리자 전용 |
| `expenses` | 회비 지출 | 관리자 전용 |
| `app_settings` | 팀 설정 | 쓰기: super_admin |
| `admin_audit_logs` | 관리자 활동 로그 | 조회: super_admin |

주요 함수

| 함수 | 용도 |
|---|---|
| `current_profile_id()` / `current_user_role()` / `is_admin()` / `is_super_admin()` | RLS 헬퍼. `SECURITY DEFINER` 라 정책 안에서 써도 재귀가 나지 않는다 |
| `is_vote_open(event_id)` | 투표 기간 판정 |
| `get_attendance_stats(from_date, to_date)` | 기간별 회원 참석률 (`include_attendance_stats = false` 인 일정 제외) |
| `admin_set_member_role()` / `admin_set_member_status()` / `admin_delete_member()` | 서버 측 권한 재검증 후 회원 관리 |

### 확장 포인트

- **가입 승인제**: `alter table public.profiles alter column status set default 'pending';`
  → 신규 가입자는 승인 대기 화면을 보게 되고, 관리자가 `active` 로 바꿔야 이용 가능.
- **투표 선택지 추가**: `vote_options` 에서 `is_active = true` 로 바꾸고
  해당 `events.allowed_votes` 배열에 코드를 넣으면 된다. 스키마 변경 불필요.
- **참석자 명단 비공개**: `events.attendee_list_visible = false` 로 두면
  RLS 가 본인 투표 외에는 가려 준다.
- **Push 알림**: `expo-notifications` + Expo Push Service (무료) 로 추가 가능.
  토큰 저장용 컬럼/테이블만 추가하면 된다.

---

## 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 앱 실행 시 `EXPO_PUBLIC_SUPABASE_URL ... 설정되지 않았습니다` | `.env` 가 없거나 값이 비어 있음. 채운 뒤 `npx expo start -c` 로 캐시 초기화 재시작 |
| 로그인은 되는데 “회원 정보를 찾을 수 없습니다” | `0001_schema.sql` 의 `on_auth_user_created` 트리거 미적용. SQL 재실행 후 재가입 |
| 쿼리가 빈 배열만 반환 | RLS 차단. `0002_rls.sql` 실행 여부와 본인 `status = 'active'` 확인 |
| `infinite recursion detected in policy` (42P17) | 정책에서 `profiles` 를 직접 SELECT 함. 반드시 헬퍼 함수를 사용 |
| APK 설치 후 실행하자마자 종료 | 빌드 시 환경변수 누락. `eas env:list` 로 확인 |
| 새 APK 가 “설치되지 않음” | `android.versionCode` 를 올리지 않았거나 서명 키가 다름 |
