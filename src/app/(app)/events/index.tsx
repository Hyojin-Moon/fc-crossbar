import { Screen } from '@/components/ui';

/**
 * 일정 목록은 홈으로 합쳤다. 이 탭은 숨겨져 있고 상세·폼·출석 체크만 쓴다.
 * 여기에 <Redirect> 를 두면 안 된다 — events/[id] 로 push 할 때 스택의 첫 화면인
 * 이 파일도 같이 마운트돼서 홈으로 되돌려 버리고, popToTopOnBlur 때문에
 * 다른 탭으로 이동할 때도 리다이렉트가 다시 튄다.
 */
export default function EventsIndex() {
  return <Screen>{null}</Screen>;
}
