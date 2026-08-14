import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { Card, EmptyState, InlineLoader, ListRow, Screen, ScreenScroll } from '@/components/ui';
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
    <Screen>
      <ScreenHeader title="관리자 활동 로그" subtitle={`최근 ${logs.length}건`} onBack={() => router.back()} />
      <ScreenScroll>
        {loading ? (
          <InlineLoader />
        ) : logs.length === 0 ? (
          <Card>
            <EmptyState
              icon="time-outline"
              message="기록이 없습니다. 권한 변경 · 상태 변경 · 회원 삭제가 일어나면 여기에 남습니다. (RPC 안에서 서버가 직접 기록하므로 앱에서 지울 수 없습니다)"
            />
          </Card>
        ) : (
          <Card>
            {logs.map((log, index) => (
              <ListRow
                key={log.id}
                first={index === 0}
                title={ACTION_LABEL[log.action] ?? log.action}
                trailing={formatStamp(log.created_at)}
                meta={`${log.actor?.name ?? '(삭제된 계정)'}${
                  log.actor?.login_id ? ` (${log.actor.login_id})` : ''
                }${(() => {
                  const detail = describeAuditDetail(log.action, log.detail);
                  return detail ? ` · ${detail}` : '';
                })()}`}
              />
            ))}
          </Card>
        )}
      </ScreenScroll>
    </Screen>
  );
}
