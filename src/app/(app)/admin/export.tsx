import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { describeDbError } from '@/lib/errors';
import { EXPORT_LABEL, exportCsv, type ExportKind } from '@/lib/export-data';
import { PERIOD_LABELS, type PeriodKey } from '@/lib/stats';

const KINDS: ExportKind[] = ['members', 'payments', 'expenses', 'attendance'];
const PERIODS: PeriodKey[] = ['recent3m', 'recent6m', 'thisYear', 'lastYear', 'all'];

export default function ExportScreen() {
  const toast = useToast();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [period, setPeriod] = useState<PeriodKey>('all');

  const run = async (kind: ExportKind) => {
    if (busy) return;
    setBusy(kind);
    try {
      const result = await exportCsv(kind, period);
      toast(
        result.shared
          ? '내보냈습니다.'
          : Platform.OS === 'web'
            ? '다운로드했습니다.'
            : `저장했습니다: ${result.uri}`
      );
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="데이터 내보내기"
        subtitle="CSV · 관리자 전용"
        right={
          <Pressable
            accessibilityLabel="뒤로"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="close" size={20} color={Colors.textOnNavy} />
          </Pressable>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>참석률 기간</SectionTitle>
          <Muted>참석률 통계에만 적용됩니다.</Muted>
          <View style={styles.chips}>
            {PERIODS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPeriod(p)}
                style={[styles.chip, period === p && styles.chipActive]}>
                <Text style={[styles.chipText, period === p && styles.chipTextActive]}>
                  {PERIOD_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {KINDS.map((kind) => (
          <Pressable
            key={kind}
            onPress={() => void run(kind)}
            disabled={busy !== null}
            style={({ pressed }) => [
              styles.row,
              busy !== null && { opacity: 0.5 },
              pressed && { opacity: 0.7 },
            ]}>
            <View style={styles.icon}>
              {busy === kind ? (
                <ActivityIndicator color={Colors.navy} />
              ) : (
                <Ionicons name="download-outline" size={20} color={Colors.navy} />
              )}
            </View>
            <View style={styles.text}>
              <Text style={styles.title}>{EXPORT_LABEL[kind].title}</Text>
              <Text style={styles.subtitle}>{EXPORT_LABEL[kind].description}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
          </Pressable>
        ))}

        <Card>
          <SectionTitle>파일 형식</SectionTitle>
          <Muted>
            UTF-8 BOM 이 붙은 CSV 입니다. Excel · 구글 스프레드시트에서 바로 열리고 한글이 깨지지
            않습니다.
          </Muted>
          <Muted>
            {Platform.OS === 'web'
              ? '브라우저 다운로드 폴더에 저장됩니다.'
              : '공유 시트가 열립니다. 카카오톡 · 드라이브 · 메일로 바로 보낼 수 있습니다.'}
          </Muted>
        </Card>

        <Card>
          <SectionTitle>업로드는 아직 없습니다</SectionTitle>
          <Muted>
            엑셀 업로드는 컬럼 형식을 정한 뒤 추가합니다. 내려받은 CSV 를 그대로 다시 올리는
            형식으로 맞추면 검증도 단순해집니다.
          </Muted>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.surface },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.navySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.textOnNavy },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textSecondary },
});
