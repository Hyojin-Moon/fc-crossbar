/**
 * 이 앱은 이메일 대신 아이디로 로그인한다.
 * Supabase Auth 는 email 형식을 요구하므로, 아이디 뒤에 내부 도메인을 붙여
 * 계정을 만든다. 이 도메인으로는 메일을 보내지 않으며 인증도 하지 않는다.
 *
 * 주의: 이 도메인 값은 SQL 쪽(handle_new_user 트리거, 0004_login_id.sql)에도
 * 하드코딩되어 있다. 바꾸려면 양쪽을 함께 고쳐야 한다.
 */
export const INTERNAL_EMAIL_DOMAIN = 'fccrossbar.local';

const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,19}$/;

/** 공백 제거 + 소문자화. 대소문자를 구분하지 않기 위해 로그인·가입 양쪽에서 쓴다. */
export function normalizeLoginId(loginId: string): string {
  return loginId.trim().toLowerCase();
}

export function loginIdToEmail(loginId: string): string {
  return `${normalizeLoginId(loginId)}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function emailToLoginId(email: string | undefined): string {
  if (!email) return '';
  const suffix = `@${INTERNAL_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

export function validateLoginId(loginId: string): string | null {
  const id = normalizeLoginId(loginId);
  if (!id) return '아이디를 입력해 주세요.';
  if (id.length < 3) return '아이디는 3자 이상이어야 합니다.';
  if (id.length > 20) return '아이디는 20자 이하여야 합니다.';
  if (!LOGIN_ID_PATTERN.test(id)) {
    return '아이디는 영문 소문자와 숫자로 시작하고, 영문·숫자·마침표·밑줄·하이픈만 쓸 수 있습니다.';
  }
  return null;
}
