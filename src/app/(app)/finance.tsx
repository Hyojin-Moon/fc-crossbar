import { PlaceholderScreen } from '@/components/placeholder-screen';

export default function FinanceScreen() {
  return (
    <PlaceholderScreen
      title="회비"
      subtitle="관리자 전용"
      phase="Phase 5 · 6"
      items={[
        '회비 대시보드 (잔액 · 이번 달 입금/지출/미납)',
        '월별 회원 납부 상태 관리',
        '지출 내역 등록 및 카테고리 분류',
        'CSV / XLSX 업로드 · 다운로드',
      ]}
    />
  );
}
