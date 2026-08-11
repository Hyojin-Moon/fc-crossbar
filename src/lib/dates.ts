/**
 * 날짜 유틸.
 *
 * 중요: events.event_date 는 timestamptz 가 아니라 date 다. 즉 "한국 달력의 하루"를
 * 뜻하는 값이라 UTC 로 변환해서 비교하면 안 된다.
 * new Date().toISOString().slice(0,10) 을 쓰면 00:00~09:00(KST) 사이에는 UTC 기준
 * 전날이 나와서 오늘 경기가 '지난 경기'로 분류된다. 반드시 todayLocalISO() 를 쓴다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function todayLocalISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function toLocalISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM-DD' 를 로컬 자정 Date 로. (Date('YYYY-MM-DD') 는 UTC 자정으로 파싱되므로 직접 만든다) */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function formatEventDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

export function formatEventDateLong(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;
}

export function formatTime(time: string | null): string {
  return time ? time.slice(0, 5) : '';
}

export function formatTimeRange(start: string | null, end: string | null): string {
  const s = formatTime(start);
  const e = formatTime(end);
  if (s && e) return `${s} ~ ${e}`;
  return s || e;
}

export function formatDeadline(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function daysFromToday(dateStr: string): number {
  const target = parseLocalDate(dateStr).getTime();
  const today = parseLocalDate(todayLocalISO()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function relativeDayLabel(dateStr: string): string {
  const diff = daysFromToday(dateStr);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  return diff > 0 ? `D-${diff}` : `${-diff}일 전`;
}

export function timeLeftLabel(iso: string | null): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '마감됨';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}분 남음`;
  if (hours < 24) return `${hours}시간 남음`;
  return `${Math.floor(hours / 24)}일 남음`;
}

export function toTimeString(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function timeStringToDate(time: string | null, fallbackHour = 20): Date {
  const d = new Date();
  if (time) {
    const [h, m] = time.split(':').map(Number);
    d.setHours(h ?? fallbackHour, m ?? 0, 0, 0);
  } else {
    d.setHours(fallbackHour, 0, 0, 0);
  }
  return d;
}
