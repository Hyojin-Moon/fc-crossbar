/** Supabase 에러 메시지를 한국어로 바꿔 준다. 매칭 안 되면 원문을 그대로 보여준다. */
// 로그인은 아이디 기반이지만 Supabase 는 내부적으로 email 을 쓰므로
// 메시지에 '이메일' 이라는 단어가 그대로 나온다. 아이디 기준으로 바꿔서 보여준다.
const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': '아이디 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed': '서버의 이메일 인증 설정이 켜져 있습니다. 관리자에게 문의해 주세요.',
  'User already registered': '이미 사용 중인 아이디입니다.',
  'Password should be at least 6 characters.': '비밀번호는 6자 이상이어야 합니다.',
  'Unable to validate email address: invalid format': '아이디 형식이 올바르지 않습니다.',
  'Network request failed': '네트워크에 연결할 수 없습니다.',
  'Anonymous sign-ins are disabled': '아이디를 입력해 주세요.',
};

export function describeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return AUTH_MESSAGES[message] ?? message;
}

/**
 * Supabase(PostgrestError)는 Error 인스턴스가 아니라 평범한 객체다.
 * String(error) 를 쓰면 "[object Object]" 가 그대로 화면에 나온다.
 */
function messageOf(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) return { message: error.message };
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; code?: unknown; hint?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(error),
      code: typeof e.code === 'string' ? e.code : undefined,
    };
  }
  return { message: String(error) };
}

export function describeDbError(error: unknown): string {
  const { message, code } = messageOf(error);

  // 클라이언트가 참조하는 테이블/관계가 DB 에 없다 = 마이그레이션 미실행
  if (code === 'PGRST200' || code === '42P01' || message.includes('Could not find')) {
    return 'DB 스키마가 앱보다 오래되었습니다. supabase/migrations 의 최신 SQL 을 실행해 주세요.';
  }
  if (code === '42501' || message.includes('row-level security')) return '권한이 없습니다.';
  if (code === '23505' || message.includes('duplicate key')) return '이미 등록된 데이터입니다.';
  if (message.includes('Failed to fetch') || message.includes('Network request failed')) {
    return '네트워크에 연결할 수 없습니다.';
  }
  return message;
}
