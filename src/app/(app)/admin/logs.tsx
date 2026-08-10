import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, Muted, SectionTitle } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { ACTION_LABEL, describeAuditDetail, fetchAuditLogs, type AuditLogRow } from '@/lib/admin';
import { describeDbError } from '@/lib/errors';

function formatStamp(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export default function AuditLogsScreen() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLogs(await fetchAuditLogs(100));
    } catch (e) {
      toast(describeDbError(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="관리자 활동 로그"
        subtitle={`최근 ${logs.length}건`}
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
        {loading ? (
          <ActivityIndicator color={Colors.navy} style={styles.loader} />
        ) : logs.length === 0 ? (
          <Card>
            <SectionTitle>기록이 없습니다</SectionTitle>
            <Muted>
              권한 변경 · 상태 변경 · 회원 삭제가 일어나면 여기에 남습니다.
              (RPC 안에서 서버가 직접 기록하므로 앱에서 지울 수 없습니다)
            </Muted>
          </Card>
        ) : (
          <Card>
            {logs.map((log) => (
              <View key={log.id} style={styles.row}>
                <View style={styles.rowTop}>
                  <Text style={styles.action}>{ACTION_LABEL[log.action] ?? log.action}</Text>
                  <Text style={styles.stamp}>{formatStamp(log.created_at)}</Text>
                </View>
                <Text style={styles.meta}>
                  {log.actor?.name ?? '(삭제된 계정)'}
                  {log.actor?.login_id ? ` (${log.actor.login_id})` : ''}
                  {(() => {
                    const detail = describeAuditDetail(log.action, log.detail);
                    return detail ? ` · ${detail}` : '';
                  })()}
                </Text>
              </View>
            ))}
          </Card>
        )}
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
  loader: { marginTop: Spacing.five },
  row: {
    paddingVertical: Spacing.two + 2,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 2,
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  action: { fontSize: 14, fontWeight: '700', color: Colors.text },
  stamp: { fontSize: 12, color: Colors.muted },
  meta: { fontSize: 12, color: Colors.textSecondary },
});
