import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';

/**
 * CSV 만들기 + 저장/공유.
 *
 * XLSX 대신 CSV 를 쓰는 이유: xlsx 라이브러리는 1MB 이상이라 APK 가 커지고,
 * BOM 을 붙인 UTF-8 CSV 는 Excel 에서 한글이 깨지지 않고 그대로 열린다.
 * 진짜 .xlsx 가 필요해지면 의존성 하나만 추가하면 된다.
 */

/** Excel 이 UTF-8 로 인식하게 하는 BOM. 이게 없으면 한글이 깨진다. */
const BOM = '﻿';

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // 쉼표 · 따옴표 · 줄바꿈이 있으면 따옴표로 감싸고 내부 따옴표는 두 번 쓴다 (RFC 4180)
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(',')];
  for (const row of rows) lines.push(row.map(escapeCell).join(','));
  // Excel 호환을 위해 CRLF
  return BOM + lines.join('\r\n') + '\r\n';
}

export type SaveResult = { shared: boolean; uri: string };

/**
 * 웹은 브라우저 다운로드, 네이티브는 캐시에 쓴 뒤 공유 시트를 띄운다.
 * (앱이 직접 '다운로드 폴더'에 쓰려면 저장소 권한이 필요해서 공유 시트를 쓴다.
 *  카카오톡·드라이브·메일로 바로 보낼 수 있어 팀 운영에는 오히려 편하다)
 */
export async function saveCsv(filename: string, content: string): Promise<SaveResult> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { shared: false, uri: filename };
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create({ overwrite: true, intermediates: true });
  file.write(content);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: filename,
      UTI: 'public.comma-separated-values-text',
    });
    return { shared: true, uri: file.uri };
  }
  return { shared: false, uri: file.uri };
}

/** fc-crossbar_회비납부_2026-08.csv 형태의 파일명 */
export function csvFilename(kind: string, suffix?: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = suffix ?? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `fc-crossbar_${kind}_${stamp}.csv`;
}
