import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function StatsScreen() {
  return (
    <PlaceholderScreen
      title="참석률 통계"
      phase="Phase 4"
      items={[
        '기간 필터 (1/3/6개월, 올해, 작년, 전체, 사용자 지정)',
        '팀 평균 참석률 · 평균 참석 인원 · 최고 참석률 회원',
        '회원별 참석 / 불참 / 미정 / 미투표 / 참석률',
        'Bar · Line 차트',
      ]}
    />
  );
}
