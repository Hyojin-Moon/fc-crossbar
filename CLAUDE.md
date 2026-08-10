# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Expo 는 최근에 크게 바뀌었다.** 코드를 쓰기 전에 반드시 해당 버전 문서를 확인할 것:
> <https://docs.expo.dev/versions/v57.0.0/>

## 프로젝트 개요

아마추어 축구팀 내부용 출석 투표 · 회비 관리 앱. **Expo SDK 57 (React Native 0.86) + expo-router**,
백엔드는 **Supabase 무료 티어**(Auth / PostgreSQL / RLS)만 사용한다. 운영 비용 0원이 제약조건이다.

Play Store 에 올리지 않고 **APK 를 직접 배포**한다 (EAS Build → GitHub Releases → 팀원이 수동 설치).
iOS 는 현재 대상이 아니다. 유료 서비스나 서버는 추가하지 않는다.

Phase 1·2(세팅 · 스키마 · RLS · Auth · 로그인/자동로그인) 완료. Phase 3~7 은 미구현이며
`src/app/(app)/{events,stats,finance}.tsx` 는 `PlaceholderScreen` 자리표시자다.
Phase 계획과 배포 절차는 `README.md` 참고.

## 명령어

```bash
npm run start          # 개발 서버 (환경변수 변경 후에는 npx expo start -c 로 캐시 초기화)
npm run android        # 안드로이드 에뮬레이터 (Android Studio 필요)
npm run typecheck      # tsc --noEmit
npm run lint           # expo lint
npm run build:apk      # EAS 클라우드 빌드 (preview 프로파일, APK 출력)
npm run build:apk:local

# 변경 후 검증: 타입체크 + 실제 번들 성공 여부까지 확인하는 것이 가장 확실하다
npx tsc --noEmit && npx expo export -p android --output-dir /tmp/export-check
```

테스트 러너는 없다.

`.env` 가 없으면 `src/lib/supabase.ts` 가 import 시점에 throw 하며 앱이 뜨지 않는다.
`cp .env.example .env` 후 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 를 채운다.
Expo 는 `EXPO_PUBLIC_` 접두사가 붙은 값만 클라이언트에 노출한다.

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

## 아키텍처

### 권한 모델 — 여기가 이 프로젝트의 핵심

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

`super_admin` 은 앱에서 부여할 수 없다. SQL 로만 지정된다 (`0003_seed.sql` 1번).

**RLS 정책 안에서 `profiles` 를 직접 SELECT 하면 무한 재귀(42P17)가 난다.**
반드시 `current_profile_id()` / `current_user_role()` / `is_admin()` / `is_super_admin()`
(`SECURITY DEFINER`, `search_path` 고정) 헬퍼를 쓴다.

### 인증 · 라우팅 흐름

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

### 스키마 설계 의도

- `profiles` 는 `id` 와 `user_id` 를 **분리**한다. 다른 테이블의 FK 는 전부 `profiles.id` 를 가리킨다.
  흔한 `id = auth.users.id` 패턴으로 "개선"하지 말 것.
- 회원가입 시 `on_auth_user_created` 트리거가 `raw_user_meta_data` 로 `profiles` 행을 만든다.
  클라이언트는 `signUp({ options: { data: {...} } })` 로 값을 넘긴다.
- **투표 선택지는 CHECK 제약이 아니라 `vote_options` 테이블**이다. 지각/조기귀가/게스트는 이미
  `is_active = false` 로 들어 있어, 스키마 변경 없이 활성화 + `events.allowed_votes` 배열 수정만으로 켠다.
  참석률 집계 여부는 `vote_options.counts_as_attendance` 가 결정한다.
- `get_attendance_stats(from_date, to_date)` 는 `SECURITY INVOKER`(기본)라 호출자 RLS 가 그대로 걸린다.
  `include_attendance_stats = false` 인 일정과 **아직 치르지 않은 미래 일정**을 모수에서 뺀다.
- `src/types/database.ts` 는 손으로 관리한다. 스키마를 바꾸면 같이 고칠 것.

### UI

`src/constants/theme.ts` 의 토큰만 쓴다 (흰 배경 + 다크 네이비, 다크모드 미지원 —
`app.json` 의 `userInterfaceStyle: "light"`). 공용 컴포넌트는 `src/components/ui.tsx`.

투표 UX 가 이 앱의 존재 이유다: **버튼 1탭에 즉시 저장 + Toast**, 확인 다이얼로그를 끼우지 않는다.
앱 켜서 투표까지 10초를 넘기지 않는 것이 설계 기준이다.

## 버전 올릴 때

`app.json` 의 `expo.version` 과 `expo.android.versionCode`(정수, 반드시 증가)를 함께 올린다.
versionCode 를 안 올리면 기존 설치본 위에 덮어쓰기가 안 된다.
