/** Supabase 에러 메시지를 한국어로 바꿔 준다. 매칭 안 되면 원문을 그대로 보여준다. */
const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed': '이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.',
  'User already registered': '이미 가입된 이메일입니다.',
  'Password should be at least 6 characters.': '비밀번호는 6자 이상이어야 합니다.',
  'Unable to validate email address: invalid format': '이메일 형식이 올바르지 않습니다.',
  'Network request failed': '네트워크에 연결할 수 없습니다.',
};

export function describeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return AUTH_MESSAGES[message] ?? message;
}

export function describeDbError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('row-level security')) return '권한이 없습니다.';
  if (message.includes('duplicate key')) return '이미 등록된 데이터입니다.';
  return message;
}
