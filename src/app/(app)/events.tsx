import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function EventsScreen() {
  return (
    <PlaceholderScreen
      title="일정 / 투표"
      phase="Phase 3"
      items={[
        '경기·모임 목록',
        '참석 / 불참 / 미정 투표 (1탭 저장)',
        '참석 현황 및 참석자 명단',
        '관리자: 일정 생성 · 수정 · 삭제 · 투표 마감',
      ]}
    />
  );
}
