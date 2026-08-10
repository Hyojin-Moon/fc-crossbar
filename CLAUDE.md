# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Expo 는 최근에 크게 바뀌었다.** 코드를 쓰기 전에 반드시 해당 버전 문서를 확인할 것:
> <https://docs.expo.dev/versions/v57.0.0/>

## 프로젝트 개요

아마추어 축구팀 내부용 출석 투표 · 회비 관리 앱. **Expo SDK 57 (React Native 0.86) + expo-router**,
백엔드는 **Supabase 무료 티어**(Auth / PostgreSQL / RLS)만 사용한다. 운영 비용 0원이 제약조건이다.

Play Store 에 올리지 않고 **APK 를 직접 배포**한다 (EAS Build → GitHub Releases → 팀원이 수동 설치).
iOS 는 현재 대상이 아니다. 유료 서비스나 서버는 추가하지 않는다.

| Phase | 내용 | 상태 |
|---|---|---|
| 1 | 프로젝트 세팅, Supabase 연결, DB 스키마, RLS, Auth | ✅ 완료 |
| 2 | 회원가입 / 로그인 / 자동 로그인 | ✅ 완료 (Phase 1 에 포함) |
| 3 | 일정 및 참석 투표 | ✅ 완료 |
| 4 | 참석률 통계 | ⬜ 예정 |
| 5 | 관리자 회비 관리 | ⬜ 예정 |
| 6 | Excel / CSV Import·Export | ⬜ 예정 |
| 7 | APK 빌드 및 배포 | ⬜ 예정 (빌드 설정은 준비됨) |

`src/app/(app)/{stats,finance}.tsx` 는 아직 `PlaceholderScreen` 자리표시자다.
각 Phase 를 끝낼 때마다 앱이 실행 가능한 상태를 유지한다.

## 명령어

```bash
npm run start          # 개발 서버 (환경변수 변경 후에는 npx expo start -c 로 캐시 초기화)
npm run android        # 안드로이드 에뮬레이터 (Android Studio 필요)
npm run web
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
npm run build:apk      # EAS 클라우드 빌드 (preview 프로파일, APK 출력)
npm run build:apk:local

# 변경 후 검증: 타입체크 + 실제 번들 성공 여부까지 확인하는 것이 가장 확실하다
npx tsc --noEmit && npx expo export -p android --output-dir /tmp/export-check
```

테스트 러너는 없다.

`experiments.typedRoutes` 가 켜져 있는데 라우트 타입(`.expo/types`)은 **개발 서버가 한 번 돌아야**
생성된다. 즉 서버를 띄운 적 없는 상태의 `tsc --noEmit` 은 `href` 문자열을 검사하지 못한다.
`npx expo start` 를 한 번 돌린 뒤 typecheck 를 다시 하면 실제 라우트까지 검증된다.

`.env` 가 없으면 `src/lib/supabase.ts` 가 import 시점에 throw 하며 앱이 뜨지 않는다.
`cp .env.example .env` 후 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 를 채운다.
Expo 는 `EXPO_PUBLIC_` 접두사가 붙은 값만 클라이언트에 노출한다.

---

# 초기 세팅

## 1. Supabase 프로젝트 생성

| 항목 | 값 |
|---|---|
| Organization | 무료 조직 선택 |
| GitHub (optional) | **연결하지 않음** — Supabase GitHub 연동은 마이그레이션 파일명이 타임스탬프 접두사여야 한다. 여기서는 SQL Editor 로 직접 실행 |
| Database password | 강력하게 생성 후 **따로 보관**. 앱은 쓰지 않고 DB 직접 접속·백업 때만 필요 |
| Region | **Northeast Asia (Seoul)** |
| Enable Data API | ✅ 켜기 (supabase-js 가 이 API 를 쓴다) |
| Automatically expose new tables | ☐ **끄기** |
| Enable automatic RLS | ✅ **켜기** |
| Postgres Type | Postgres (DEFAULT) |

`Automatically expose new tables` 를 꺼도 되는 이유는 `0002_rls.sql` 이 8개 테이블의 GRANT 를
직접 부여하기 때문이다. 켜 두면 그 GRANT 가 중복될 뿐 동작은 같다. 다만 이후 Table Editor 로
테이블을 새로 만들면 **GRANT 를 직접 넣어야** 한다.

Region 과 Postgres Type 은 생성 후 변경할 수 없다.

## 2. 마이그레이션 실행

**SQL Editor** 에 파일 내용을 통째로 붙여넣고 Run 한다.

`0001` / `0002` / `0004` 는 여러 번 실행해도 안전하다.
`0003` 의 샘플 데이터 블록은 **일정이 하나도 없을 때만** 동작하도록 가드가 걸려 있다 —
`events` / `expenses` 는 PK 가 `gen_random_uuid()` 라서 `on conflict do nothing` 이 걸리지 않고,
가드가 없으면 재실행마다 일정 8개와 지출 4건이 복제된다.

> **SQL Editor 의 `Limit 100 rows` 를 `No limit` 으로 바꿔야 한다.**
> 이 옵션이 켜져 있으면 쿼리를 `select * from ( ... ) limit 100` 으로 감싸기 때문에
> `UPDATE` / `INSERT` / `ALTER` / `DO $$ ... $$` 가 전부 `42601 syntax error` 로 실패한다.
> 에러가 실제보다 뒤쪽 라인(예: `LINE 5`)을 가리키는 게 이 증상의 표식이다.

| 순서 | 파일 | 내용 | 시점 |
|---|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | 테이블 · 인덱스 · 헬퍼함수 · 트리거 · 관리자 RPC | 프로젝트 생성 직후 |
| 2 | `supabase/migrations/0002_rls.sql` | RLS 정책 + 테이블 권한 | 이어서 바로 |
| 3 | `supabase/migrations/0003_seed.sql` | Super Admin 지정 + 샘플 데이터 | **앱에서 회원가입한 뒤** |
| — | `supabase/migrations/0004_login_id.sql` | `profiles.login_id` 추가 | **0001 을 이미 실행해 둔 DB 에서만.** 내용이 0001 에 반영되어 있어 새로 만드는 DB 는 불필요 |

## 3. 인증 설정 — Confirm email 은 반드시 꺼야 한다

**Authentication > Sign In / Providers > Email** → **Confirm email** **OFF**

선택 사항이 아니다. 로그인이 아이디 기반이라 계정 이메일이 `<아이디>@fccrossbar.local`
이고 실제 수신 가능한 주소가 아니다. 켜 두면 **아무도 가입을 완료할 수 없다.**
그 상태에서 가입을 시도하면 앱이 "서버의 이메일 인증 설정이 켜져 있어 가입을 완료할 수
없습니다" 라고 안내한다 (`sign-up.tsx` 의 `needsEmailConfirm` 분기).

## 4. 키 복사 후 로컬 실행

**Project Settings > Data API** 에서 `Project URL` 과 `anon public` 키를 복사한다.

```bash
npm install
cp .env.example .env     # EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 채우기
npx expo start -c        # -c : 캐시 초기화 (환경변수 바꾼 뒤에는 필수)
```

터미널의 QR 코드를 안드로이드 폰의 **Expo Go** 앱으로 찍으면 실행된다.
개발만 할 거면 Android Studio 는 필요 없다.

> `service_role` 키는 앱에 절대 넣지 않는다. 클라이언트는 `anon` 키만 쓰고 보호는 RLS 가 담당한다.

## 5. 관리자 계정 지정

`super_admin` 은 앱에서 부여할 수 없고 SQL 로만 지정된다.

```sql
-- 1) 먼저 앱에서 회원가입한다 (profiles 행이 트리거로 자동 생성됨)
-- 2) Supabase SQL Editor 에서 실행
update public.profiles
set    role = 'super_admin', status = 'active'
where  login_id = '본인아이디';
```

앱을 재시작하면 회비 · 관리 탭이 나타난다.
이후 일반 관리자(admin) 임명/해임은 super_admin 이 앱에서 할 수 있다 (Phase 5).

## 6. 샘플 데이터

`0003_seed.sql` 의 3번 블록을 실행하면 지난 일정 6개 + 예정 일정 2개, 회원별 투표,
최근 3개월 회비, 지출 4건이 생성된다. 관리자 계정이 없으면 실행이 건너뛰어지므로
**super_admin 지정을 먼저** 해야 한다. 운영 DB 에서는 실행하지 않는다.

---

# 아키텍처

## 폴더 구조

```
├── app.json                  Expo 설정 (앱 이름, android.package, versionCode)
├── eas.json                  EAS Build 프로파일 (모두 APK 출력)
├── supabase/migrations/      0001_schema / 0002_rls / 0003_seed
└── src/
    ├── app/                  expo-router 파일 기반 라우팅
    │   ├── _layout.tsx       루트: AuthProvider · 스플래시 · Stack
    │   ├── index.tsx         진입점. 세션 유무로 분기
    │   ├── (auth)/           sign-in · sign-up
    │   └── (app)/            인증 가드 + 역할별 Bottom Tabs
    │       ├── index.tsx     홈 (진행 중인 투표 카드 + 예정·최근 일정)
    │       ├── events/       일정 탭 (안에 Stack)
    │       │   ├── index.tsx  목록 (예정 / 지난 경기)
    │       │   ├── [id].tsx   상세 · 참석 현황 명단 · 관리자 작업
    │       │   └── form.tsx   생성/수정 (?id= 있으면 수정) · 관리자 전용
    │       ├── stats.tsx     참석률 통계        (Phase 4)
    │       ├── finance.tsx   회비 · 관리자 전용 (Phase 5·6)
    │       ├── admin.tsx     관리 · 관리자 전용 (Phase 5)
    │       └── profile.tsx   내 정보 / 로그아웃
    ├── lib/                  supabase · auth-context · errors · events · members
    │                         dates · login-id · vote-options
    ├── components/           공용 UI (버튼 · 입력 · 카드 · 헤더)
    ├── constants/theme.ts    색상 · 여백 토큰
    └── types/database.ts     DB 스키마 TypeScript 타입
```

## 권한 모델 — 여기가 이 프로젝트의 핵심

역할은 `super_admin` / `admin` / `member` 세 단계이고, **UI 숨김은 편의일 뿐 실제 차단은 DB 4겹**이다.
새 기능을 붙일 때 이 구조를 우회하지 말 것.

1. **RLS 정책** (`0002_rls.sql`) — 모든 테이블. 회비/지출은 `is_admin()` 만 읽힌다.
2. **컬럼 단위 GRANT** (`0001_schema.sql` 하단) — `authenticated` 롤에서 `profiles` 의 UPDATE 를
   회수하고 `name / nickname / phone` 만 다시 부여했다. RLS 의 `WITH CHECK` 로는 "이전 값과 비교"가
   불가능해서, 클라이언트가 자기 `role` 을 UPDATE 하는 것은 SQL 권한 레벨에서 막는다.
   → `profiles` 에 사용자가 직접 수정할 컬럼을 추가하면 **GRANT 목록도 같이 고쳐야** 한다.
3. **트리거** `protect_profile_privileges()` — role/status 변경을 한 번 더 검사.
   `auth.uid() is null` (SQL Editor / service_role) 이면 통과시킨다.
4. **RPC** `admin_set_member_role` / `admin_set_member_status` / `admin_delete_member` —
   `SECURITY DEFINER` 로 서버에서 호출자 role 을 재검증하고 `admin_audit_logs` 에 남긴다.
   권한 변경은 반드시 이 경로로만.

| | member | admin | super_admin |
|---|---|---|---|
| 일정 조회 / 본인 투표 | ✅ | ✅ | ✅ |
| 일정 생성·수정·삭제, 투표 마감 | ❌ | ✅ | ✅ |
| 회원 활성화 / 비활성화 | ❌ | ✅ (member 대상만) | ✅ |
| 회비 · 지출 조회 및 관리 | ❌ | ✅ | ✅ |
| admin 임명 / 해임 | ❌ | ❌ | ✅ |
| super_admin 계정 수정·삭제 | ❌ | ❌ | ✅ |
| 시스템 설정 · 활동 로그 | ❌ | ❌ | ✅ |

**RLS 정책 안에서 `profiles` 를 직접 SELECT 하면 무한 재귀(42P17)가 난다.**
반드시 `current_profile_id()` / `current_user_role()` / `is_admin()` / `is_super_admin()`
(`SECURITY DEFINER`, `search_path` 고정) 헬퍼를 쓴다.

## 로그인은 아이디 기반이다 (이메일 아님)

팀원이 이메일을 타이핑하지 않도록, 화면에서는 **아이디 + 비밀번호**만 받는다.
Supabase Auth 가 email 형식을 요구하므로 `src/lib/login-id.ts` 가 아이디 뒤에
`@fccrossbar.local` 을 붙여 계정을 만든다. 메일 발송도, 인증도 하지 않는다.
(Supabase 가 이 도메인을 받아주는지는 실제 프로젝트에서 확인했다)

- 아이디 규칙: 영문 소문자·숫자로 시작, `a-z0-9._-`, 3~20자 (`validateLoginId`)
- 아이디는 항상 소문자로 정규화한다 (`normalizeLoginId`) — 대소문자 구분 안 함
- 중복은 `auth.users.email` UNIQUE 가 먼저 잡아 `User already registered` 를 돌려준다.
  `profiles.login_id` 의 unique index 는 안전망이다.
- `profiles.login_id` 는 화면 표시용 사본이다. 클라이언트는 `auth.users` 를 읽을 수
  없으므로, 관리자 화면에서 아이디를 보여주려면 이 컬럼이 필요하다.
  사용자가 바꿀 수 없다 (컬럼 GRANT 에 없음).
- 도메인 문자열은 `src/lib/login-id.ts` 와 SQL(`handle_new_user`, `0004_login_id.sql`)
  **양쪽에 하드코딩**되어 있다. 바꾸려면 둘 다 고쳐야 한다.

**비밀번호 재설정은 자동화할 수 없다** (받을 메일함이 없다).
잊은 사람은 Supabase Dashboard → Authentication → Users → 해당 계정 → 비밀번호 변경으로
super_admin 이 처리한다. Phase 5 에서 관리자용 초기화 기능을 넣을지는 미정.

## `Alert.alert` 을 쓰지 않는다

`react-native-web` 의 `Alert` 는 **본문이 빈 스텁**이다 (`class Alert { static alert() {} }`).
웹에서는 다이얼로그가 뜨지 않고 버튼의 `onPress` 도 호출되지 않아, 확인이 필요한 동작
(로그아웃, 일정 삭제, 투표 마감)이 조용히 먹통이 된다. 안내 메시지도 안 보인다.

- 확인이 필요하면 `confirmAsync()` (`src/lib/confirm.ts`) — 웹에서는 `window.confirm` 으로 우회
- 단순 안내·성공·실패 메시지는 `useToast()` (`src/components/toast.tsx`)

## 인증 · 라우팅 흐름

`src/lib/auth-context.tsx` 가 세션과 프로필을 들고 있는 유일한 소스다.
`getSession()` 으로 저장된 세션을 복원하고 `onAuthStateChange` 를 구독한다.
refresh 최종 실패 시 `SIGNED_OUT` 이 와서 자동으로 로그인 화면으로 돌아간다.

`src/lib/supabase.ts` 의 세 가지가 자동 로그인을 성립시킨다 — AsyncStorage 영속화,
`autoRefreshToken`, 그리고 **`AppState` 리스너로 `startAutoRefresh`/`stopAutoRefresh` 토글**.
마지막 항목이 빠지면 앱을 오래 백그라운드에 뒀다 복귀했을 때 토큰이 만료된 채 남는다.
`expo-secure-store` 는 Android 값 2048 바이트 제한 때문에 의도적으로 쓰지 않는다.

라우팅 가드는 그룹 레이아웃의 `<Redirect>` 로 처리한다 (명령형 navigate 금지 — 마운트 전 이동 문제).

- `src/app/index.tsx` — 세션 유무로 분기
- `src/app/(auth)/_layout.tsx` — 세션 있으면 `(app)` 으로
- `src/app/(app)/_layout.tsx` — 세션 없으면 로그인으로, `status !== 'active'` 면 `BlockedNotice`

탭은 `expo-router/js-tabs` 의 `Tabs` 를 쓴다 (`expo-router` 루트의 `Tabs` 는 deprecated,
`unstable-native-tabs` 는 스타일 제어가 어렵다). 역할별 탭 노출은 `options.href` 를
`undefined`(표시) / `null`(숨김) 로 토글한다.

| 역할 | 탭 |
|---|---|
| member | 홈 · 일정 · 통계 · 내 정보 |
| admin / super_admin | 홈 · 일정 · 통계 · 회비 · 관리 (내 정보는 "관리"에서 진입) |

## 일정 · 투표 (Phase 3)

**투표 창 상태는 `getVoteWindow()` 하나로만 판단한다** (`src/lib/events.ts`).
`is_vote_open()` SQL 함수와 같은 세 조건(`status`, `vote_open_at`, `vote_deadline`)을 쓴다.
화면과 DB 판단이 갈리면 "버튼은 눌리는데 저장은 RLS 로 거부되는" 상태가 된다.
세 상태(`before` / `open` / `closed`)를 모두 렌더링해야 한다 — 샘플 데이터에 셋 다 들어 있다.

**투표 마감은 `status = 'closed'` 로만 한다.** `vote_deadline` 을 과거로 당기거나 투표를
지우지 않는다. `is_vote_open()` 이 읽는 값이 `status` 이고, 마감 후에도 참석 현황은 보여야 한다.

**투표 버튼은 `events.allowed_votes` × `vote_options` 로 그린다.** 참석/불참/미정을
하드코딩하지 않는다 (`optionsForEvent()`). 참석률 집계 기준은 `counts_as_attendance`.

**저장은 upsert** (`event_votes` 의 `event_id,member_id` UNIQUE). PostgREST upsert 는
`INSERT ... ON CONFLICT DO UPDATE` 라서 INSERT 의 WITH CHECK 와 UPDATE 의 USING/WITH CHECK 를
모두 통과해야 한다. 6가지 경로(최초 투표 / 변경 / 시작 전 / 마감 후 / 남의 투표 / 삭제)를
Postgres 에서 검증했다.

**날짜는 반드시 `src/lib/dates.ts` 를 쓴다.** `event_date` 는 `date` 컬럼이라 "한국 달력의
하루"를 뜻한다. `new Date().toISOString().slice(0,10)` 으로 오늘을 구하면 00:00~09:00 KST
사이에 오늘 경기가 '지난 경기'로 분류된다. `todayLocalISO()` 를 쓴다.
SQL 에서 `(date + time)::timestamptz` 도 같은 함정이다 (세션 TZ 가 UTC) —
`(date + time) at time zone 'Asia/Seoul'` 로 쓴다.

**화면 갱신은 `useFocusEffect`** 로 한다. 캐시 계층이 없어서 홈 → 상세 → 투표 → 뒤로 갈 때
포커스마다 다시 읽어야 인원수가 맞는다.

**주의**: 임베드 select(`events` + `votes:event_votes(...)`)로 센 인원수는 RLS 로 필터된
결과다. `attendee_list_visible = false` 로 두면 회원에게는 본인 투표만 보여서 "참석 1명"이
된다. 명단 비공개 기능을 실제로 쓸 거라면 인원수를 RPC 로 옮겨야 한다.

## 데이터베이스

| 테이블 | 설명 | 접근 |
|---|---|---|
| `profiles` | 회원 (`id` 와 `user_id` 분리, `login_id` = 로그인 아이디) | 활성 회원 조회 가능 |
| `events` | 경기 / 모임 | 조회: 전체 · 쓰기: 관리자 |
| `event_votes` | 참석 투표 (`event_id + member_id` UNIQUE) | 본인 투표만 쓰기 |
| `vote_options` | 투표 선택지 (참석/불참/미정 + 확장용 지각/조기귀가/게스트) | 조회: 전체 |
| `membership_payments` | 회비 납부 (`member_id + year + month` UNIQUE) | 관리자 전용 |
| `expenses` | 회비 지출 | 관리자 전용 |
| `app_settings` | 팀 설정 | 쓰기: super_admin |
| `admin_audit_logs` | 관리자 활동 로그 | 조회: super_admin |

| 함수 | 용도 |
|---|---|
| `current_profile_id()` / `current_user_role()` / `is_admin()` / `is_super_admin()` | RLS 헬퍼 |
| `is_vote_open(event_id)` | 투표 기간 판정 |
| `get_attendance_stats(from_date, to_date)` | 기간별 회원 참석률 |
| `admin_set_member_role()` / `admin_set_member_status()` / `admin_delete_member()` | 서버 측 권한 재검증 후 회원 관리 |

### 스키마 설계 의도

- `profiles` 는 `id` 와 `user_id` 를 **분리**한다. 다른 테이블의 FK 는 전부 `profiles.id` 를 가리킨다.
  흔한 `id = auth.users.id` 패턴으로 "개선"하지 말 것.
- 회원가입 시 `on_auth_user_created` 트리거가 `raw_user_meta_data` 로 `profiles` 행을 만든다.
  클라이언트는 `signUp({ options: { data: {...} } })` 로 값을 넘긴다.
- **투표 선택지는 CHECK 제약이 아니라 `vote_options` 테이블**이다. 지각/조기귀가/게스트는 이미
  `is_active = false` 로 들어 있어, 스키마 변경 없이 활성화 + `events.allowed_votes` 배열 수정만으로 켠다.
  참석률 집계 여부는 `vote_options.counts_as_attendance` 가 결정한다.
- `get_attendance_stats()` 는 `SECURITY INVOKER`(기본)라 호출자 RLS 가 그대로 걸린다.
  `include_attendance_stats = false` 인 일정과 **아직 치르지 않은 미래 일정**을 모수에서 뺀다.
- `src/types/database.ts` 는 손으로 관리한다. 스키마를 바꾸면 같이 고칠 것.

### 확장 포인트

- **가입 승인제**: `alter table public.profiles alter column status set default 'pending';`
  → 신규 가입자는 승인 대기 화면(`BlockedNotice`)을 보게 되고, 관리자가 `active` 로 바꿔야 이용 가능.
- **투표 선택지 추가**: `vote_options` 에서 `is_active = true` 로 바꾸고
  해당 `events.allowed_votes` 배열에 코드를 넣는다. 스키마 변경 불필요.
- **참석자 명단 비공개**: `events.attendee_list_visible = false` 로 두면 RLS 가 본인 투표 외에는 가린다.
- **Push 알림**: `expo-notifications` + Expo Push Service (무료). 토큰 저장용 테이블만 추가하면 된다.

## SQL 변경 시 검증 방법

`supabase/migrations/*.sql` 은 사용자가 Supabase SQL Editor 에 직접 붙여넣어 실행한다.
로컬에 psql 이 없으므로, 스키마를 고쳤다면 Docker 로 검증한 뒤 넘긴다.

```sql
-- 스텁: Supabase 환경 흉내내기 (auth 스키마와 롤이 없으면 마이그레이션이 돌지 않는다)
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid $$;
create role anon; create role authenticated; create role service_role;
```

`postgres:17-alpine` 컨테이너에 위 스텁 + 0001 + 0002 를 넣고,
`begin; set local "test.user_id" = '<uuid>'; set local role authenticated;` 로 특정 회원을 흉내내
RLS 를 실제로 확인할 수 있다. 세 마이그레이션 모두 **재실행 가능(idempotent)** 해야 한다.

## UI

`src/constants/theme.ts` 의 토큰만 쓴다 (흰 배경 + 다크 네이비, 다크모드 미지원 —
`app.json` 의 `userInterfaceStyle: "light"`). 공용 컴포넌트는 `src/components/ui.tsx`.

투표 UX 가 이 앱의 존재 이유다: **버튼 1탭에 즉시 저장 + Toast**, 확인 다이얼로그를 끼우지 않는다.
앱 켜서 투표까지 10초를 넘기지 않는 것이 설계 기준이다.

---

# APK 빌드와 배포

Google Play 등록 없이 APK 파일을 직접 배포한다.

## 방법 A. EAS Build 클라우드 (권장 — 로컬 SDK 불필요)

```bash
npm install -g eas-cli
eas login                  # Expo 계정 (무료)
eas init                   # 프로젝트 연결. app.json 에 projectId 가 추가된다
eas build -p android --profile preview
```

- 빌드가 끝나면 터미널과 <https://expo.dev> 대시보드에 **APK 다운로드 링크**가 나온다.
- `eas.json` 의 세 프로파일 모두 `buildType: "apk"` 라서 AAB 가 아닌 APK 가 나온다.
- 서명 키는 첫 빌드 때 EAS 가 자동 생성해 보관한다. (`eas credentials` 로 확인/다운로드)
- 무료 계정은 빌드 대기열이 느리고 월 빌드 횟수 제한이 있다.

**환경변수 주의**: `.env` 는 git 에 올라가지 않으므로 클라우드 빌드에 값이 전달되지 않는다.

```bash
eas env:create --name EXPO_PUBLIC_SUPABASE_URL      --value "https://xxxx.supabase.co" --environment preview,production
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJhbG..."                --environment preview,production
```

또는 `eas.json` 의 각 프로파일에 `"env": { ... }` 로 직접 적어도 된다.
anon key 는 공개돼도 되는 값이라 어느 쪽이든 무방하다.

## 방법 B. 로컬 빌드

사전 준비:

- **JDK 17** — 이 개발 환경은 JDK 11 이라 그대로는 빌드가 실패한다.
  ```bash
  brew install --cask zulu@17
  export JAVA_HOME=$(/usr/libexec/java_home -v 17)
  ```
- **Android Studio** 설치 후 SDK Platform 35 + Build-Tools 설치, `ANDROID_HOME` 설정

```bash
eas build -p android --profile preview --local   # 권장

# 또는 순수 Gradle
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
```

## APK 생성 위치

| 방법 | 경로 |
|---|---|
| EAS 클라우드 | expo.dev 대시보드의 다운로드 링크 |
| `--local` | 프로젝트 루트의 `build-*.apk` |
| Gradle | `android/app/build/outputs/apk/release/app-release.apk` |

직접 서명할 경우:

```bash
keytool -genkeypair -v -keystore fc-crossbar.jks -alias fc-crossbar \
        -keyalg RSA -keysize 2048 -validity 10000
```

`.jks` 는 `.gitignore` 에 포함되어 있다. **분실하면 기존 설치본을 덮어쓸 수 없으니 반드시 백업**한다.

## 팀원에게 배포

```bash
git tag v1.0.0 && git push origin v1.0.0
gh release create v1.0.0 ./fc-crossbar-v1.0.0.apk \
  --title "FC Crossbar v1.0.0" --notes "참석 투표 기능 추가"
```

팀 단톡방에 Release 페이지 링크를 공유하면 각자 받아 설치한다.

새 버전을 낼 때는 세 곳을 함께 올린다.

- `app.json` → `expo.version` (예: `1.0.1`)
- `app.json` → `expo.android.versionCode` (정수, **반드시 증가**. 안 올리면 덮어쓰기 설치가 안 된다)
- git 태그

## 안드로이드 "알 수 없는 앱 설치" 허용 (팀원 안내용)

스토어를 거치지 않은 APK 는 기본적으로 차단된다. 최초 1회만 허용하면 된다.

1. 링크로 APK 를 다운로드한다.
2. 파일을 탭하면 **"이 출처의 앱 설치 차단됨"** 안내가 뜬다.
3. **설정** 을 누르거나 → `설정 > 앱 > 특별한 앱 접근 > 알 수 없는 앱 설치` 로 이동
4. 방금 사용한 앱(Chrome, 내 파일, 카카오톡 등)을 골라 **이 출처 허용** 을 켠다.
5. 뒤로 가서 다시 설치를 누른다.
6. Play 프로텍트 경고가 나오면 **무시하고 설치** 를 선택한다.

> 삼성: `설정 > 보안 및 개인 정보 보호 > 기타 보안 설정 > 알 수 없는 앱 설치`

---

# 문제 해결

| 증상 | 원인 / 해결 |
|---|---|
| 앱 실행 시 `EXPO_PUBLIC_SUPABASE_URL ... 설정되지 않았습니다` | `.env` 가 없거나 비어 있음. 채운 뒤 `npx expo start -c` 로 캐시 초기화 재시작 |
| 로그인은 되는데 "회원 정보를 찾을 수 없습니다" | `0001_schema.sql` 의 `on_auth_user_created` 트리거 미적용. SQL 재실행 후 재가입 |
| 가입 시 "서버의 이메일 인증 설정이 켜져 있어..." | Authentication > Email > **Confirm email** 을 끈다 |
| `column profiles.login_id does not exist` | `0004_login_id.sql` 미실행 |
| SQL Editor 에서 `42601 syntax error at or near "update"` | `Limit 100 rows` 를 `No limit` 으로 바꾼다 |
| 라우트가 중복됐다는 개발 서버 에러 | `foo.tsx` 와 `foo/` 디렉터리는 공존할 수 없다. `tsc` 는 못 잡는다 |
| 투표 버튼을 눌렀는데 `row-level security policy` 토스트 | 투표 기간이 아니다. `getVoteWindow()` 가 `open` 인지 확인 |
| 쿼리가 빈 배열만 반환 | RLS 차단. `0002_rls.sql` 실행 여부와 본인 `status = 'active'` 확인 |
| `infinite recursion detected in policy` (42P17) | 정책에서 `profiles` 를 직접 SELECT 함. 헬퍼 함수를 쓸 것 |
| `permission denied for table profiles` | 의도된 동작. `role`/`status` 는 RPC 로만 변경 가능 |
| APK 설치 후 실행하자마자 종료 | 빌드 시 환경변수 누락. `eas env:list` 로 확인 |
| 새 APK 가 "설치되지 않음" | `android.versionCode` 를 올리지 않았거나 서명 키가 다름 |
