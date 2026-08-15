import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Typography, Weight } from '@/constants/theme';
import type { StatRow } from '@/lib/match-stats';
import type { StatType } from '@/types/database';

type Props = {
  rows: StatRow[];
  types: StatType[];
  /** 본인 행을 강조한다 */
  meId?: string | null;
  /** 정렬 기준 stat code */
  sortBy: string;
  onSortChange: (code: string) => void;
};

/**
 * 회원 × 스탯 항목 가로 표.
 *
 * 항목이 `stat_types` 데이터라서 열 개수가 고정되어 있지 않다. 이름 열은 고정하고
 * 항목 열만 좌우로 스크롤시킨다 — 항목이 늘어나도 누구 기록인지 안 놓친다.
 * 스탯이 하나도 없는 회원은 넣지 않는다 (0만 가득한 표가 된다).
 */
export function StatTable({ rows, types, meId, sortBy, onSortChange }: Props) {
  const codes = types.map((t) => t.code);
  const listed = rows.filter((r) => codes.some((c) => (r.totals[c] ?? 0) > 0));

  const sorted = [...listed].sort((a, b) =>
    sortBy === 'name'
      ? a.name.localeCompare(b.name, 'ko')
      : (b.totals[sortBy] ?? 0) - (a.totals[sortBy] ?? 0) || a.name.localeCompare(b.name, 'ko')
  );

  if (sorted.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.fixed}>
        <Pressable onPress={() => onSortChange('name')} style={styles.headCell}>
          <Text style={[styles.headText, sortBy === 'name' && styles.headTextActive]}>이름</Text>
        </Pressable>
        {sorted.map((row, index) => {
          const isMe = row.memberId === meId;
          return (
            <View key={row.memberId} style={[styles.bodyCell, isMe && styles.meRow]}>
              <Text style={styles.rank}>{sortBy === 'name' ? '' : index + 1}</Text>
              <Text style={[styles.name, isMe && styles.nameMe]} numberOfLines={1}>
                {row.name}
              </Text>
              {isMe ? (
                <View style={styles.meBadge}>
                  <Text style={styles.meBadgeText}>나</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.flex}>
        <View>
          <View style={styles.headRow}>
            {types.map((type) => (
              <Pressable
                key={type.code}
                accessibilityRole="button"
                accessibilityState={{ selected: sortBy === type.code }}
                onPress={() => onSortChange(type.code)}
                style={[styles.statHead, sortBy === type.code && styles.statHeadActive]}>
                <Text style={[styles.headText, sortBy === type.code && styles.headTextActive]}>
                  {type.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {sorted.map((row) => (
            <View
              key={row.memberId}
              style={[styles.bodyRow, row.memberId === meId && styles.meRow]}>
              {types.map((type) => {
                const value = row.totals[type.code] ?? 0;
                return (
                  <Text
                    key={type.code}
                    style={[
                      styles.statCell,
                      value === 0 && styles.statCellZero,
                      sortBy === type.code && value > 0 && styles.statCellSorted,
                    ]}>
                    {value === 0 ? '·' : value}
                  </Text>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const ROW_HEIGHT = 34;
const HEAD_HEIGHT = 28;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row' },
  flex: { flex: 1 },
  fixed: { width: 128 },
  headRow: { flexDirection: 'row', height: HEAD_HEIGHT },
  bodyRow: { flexDirection: 'row', height: ROW_HEIGHT, alignItems: 'center' },
  headCell: { height: HEAD_HEIGHT, justifyContent: 'center' },
  bodyCell: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingRight: Spacing.two,
  },
  statHead: {
    width: 46,
    height: HEAD_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  statHeadActive: { backgroundColor: Colors.navy },
  headText: { ...Typography.caption, fontWeight: Weight.bold, color: Colors.muted },
  headTextActive: { color: Colors.textOnNavy },
  rank: {
    width: 16,
    ...Typography.caption,
    fontWeight: Weight.bold,
    color: Colors.muted,
    fontVariant: ['tabular-nums'],
  },
  name: { flex: 1, minWidth: 0, ...Typography.body, color: Colors.text },
  nameMe: { fontWeight: Weight.bold },
  meRow: { backgroundColor: '#F0F6FF' },
  meBadge: { backgroundColor: Colors.navy, borderRadius: 4, paddingHorizontal: Spacing.one, paddingVertical: Spacing.half },
  meBadgeText: { ...Typography.micro, fontWeight: Weight.bold, color: Colors.textOnNavy },
  statCell: {
    width: 46,
    textAlign: 'center',
    ...Typography.body,
    fontWeight: Weight.bold,
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  statCellZero: { color: Colors.border, fontWeight: Weight.regular },
  statCellSorted: { color: Colors.navy, fontWeight: Weight.bold },
});
