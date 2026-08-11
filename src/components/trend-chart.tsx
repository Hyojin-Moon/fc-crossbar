import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { Colors, Spacing } from '@/constants/theme';
import { parseLocalDate } from '@/lib/dates';
import type { TrendPoint } from '@/lib/stats';

const PLOT_HEIGHT = 120;
const AXIS_BAND = 22; // x축 라벨 자리. 이걸 빼먹으면 라벨이 잘린다.
const PAD_LEFT = 26;
const PAD_RIGHT = 14;
const PAD_TOP = 14;

/**
 * 경기별 참석 인원 추이. 단일 시리즈이므로 범례를 두지 않는다 (제목이 시리즈를 설명).
 * 모든 점에 숫자를 찍지 않고 마지막 점과 최고점만 직접 라벨을 붙인다.
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [width, setWidth] = useState(0);

  if (points.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {points.length === 0
            ? '기간 내 경기가 없습니다.'
            : '경기가 2회 이상이면 추세를 보여줍니다.'}
        </Text>
      </View>
    );
  }

  const maxValue = Math.max(...points.map((p) => p.attendCount), 1);
  const yMax = Math.max(2, Math.ceil(maxValue / 2) * 2);

  const innerWidth = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const x = (i: number) => PAD_LEFT + stepX * i;
  const y = (v: number) => PAD_TOP + (1 - v / yMax) * (PLOT_HEIGHT - PAD_TOP);

  const maxIndex = points.reduce((best, p, i) => (p.attendCount > points[best].attendCount ? i : best), 0);
  const lastIndex = points.length - 1;
  const labelled = new Set([maxIndex, lastIndex]);

  const polyline = points.map((p, i) => `${x(i)},${y(p.attendCount)}`).join(' ');
  const ticks = [0, yMax / 2, yMax];

  const shortDate = (dateStr: string) => {
    const d = parseLocalDate(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.wrap}>
      {width > 0 ? (
        <Svg width={width} height={PLOT_HEIGHT + AXIS_BAND}>
          {ticks.map((t) => (
            <Line
              key={t}
              x1={PAD_LEFT}
              x2={width - PAD_RIGHT}
              y1={y(t)}
              y2={y(t)}
              stroke={Colors.border}
              strokeWidth={1}
            />
          ))}
          {ticks.map((t) => (
            <SvgText
              key={`tick-${t}`}
              x={PAD_LEFT - 6}
              y={y(t) + 4}
              fontSize={10}
              fill={Colors.muted}
              textAnchor="end">
              {String(t)}
            </SvgText>
          ))}

          <Polyline
            points={polyline}
            fill="none"
            stroke={Colors.navy}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((p, i) => (
            <Circle
              key={p.eventId}
              cx={x(i)}
              cy={y(p.attendCount)}
              r={labelled.has(i) ? 4.5 : 3}
              fill={Colors.navy}
              stroke={Colors.background}
              strokeWidth={2}
            />
          ))}

          {[...labelled].map((i) => (
            <SvgText
              key={`label-${i}`}
              x={x(i)}
              y={y(points[i].attendCount) - 10}
              fontSize={11}
              fontWeight="700"
              fill={Colors.navy}
              textAnchor={i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle'}>
              {String(points[i].attendCount)}
            </SvgText>
          ))}

          {/* x축 라벨은 처음과 끝만. 모든 점에 날짜를 찍으면 겹친다. */}
          <SvgText
            x={PAD_LEFT}
            y={PLOT_HEIGHT + 16}
            fontSize={10}
            fill={Colors.muted}
            textAnchor="start">
            {shortDate(points[0].date)}
          </SvgText>
          <SvgText
            x={width - PAD_RIGHT}
            y={PLOT_HEIGHT + 16}
            fontSize={10}
            fill={Colors.muted}
            textAnchor="end">
            {shortDate(points[lastIndex].date)}
          </SvgText>
        </Svg>
      ) : (
        <View style={{ height: PLOT_HEIGHT + AXIS_BAND }} />
      )}
      <Text style={styles.caption}>
        경기 {points.length}회 · 최고 {points[maxIndex].attendCount}명 ({shortDate(points[maxIndex].date)})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  empty: { paddingVertical: Spacing.four, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.muted },
  caption: { fontSize: 12, color: Colors.textSecondary },
});
