import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { parseLocalDate, toLocalISODate, toTimeString } from '@/lib/dates';

type Props = {
  label: string;
  mode: 'date' | 'time';
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: string;
};

export function DateTimeInput({ label, mode, value, onChange, placeholder, hint }: Props) {
  const [showPicker, setShowPicker] = useState(false);

  const pickerValue = (() => {
    if (mode === 'date') {
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseLocalDate(value) : new Date();
    }
    const d = new Date();
    if (/^\d{1,2}:\d{2}$/.test(value)) {
      const [h, m] = value.split(':').map(Number);
      d.setHours(h, m, 0, 0);
    }
    return d;
  })();

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? (mode === 'date' ? 'YYYY-MM-DD' : 'HH:MM')}
          placeholderTextColor={Colors.muted}
          keyboardType={Platform.OS === 'web' ? 'default' : 'numbers-and-punctuation'}
          style={styles.input}
        />
        {Platform.OS !== 'web' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} 선택`}
            onPress={() => setShowPicker(true)}
            style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.7 }]}>
            <Ionicons
              name={mode === 'date' ? 'calendar-outline' : 'time-outline'}
              size={20}
              color={Colors.navy}
            />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {showPicker ? (
        <DateTimePicker
          value={pickerValue}
          mode={mode}
          is24Hour
          onChange={(event, selected) => {
            setShowPicker(false);
            if (event.type === 'dismissed' || !selected) return;
            onChange(mode === 'date' ? toLocalISODate(selected) : toTimeString(selected));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  input: {
    flex: 1,
    // 웹에서 <input> 은 고유 너비를 가지며 flex 아이템의 min-width 기본값이 auto 라
    // 이걸 0 으로 내려주지 않으면 두 칸 배치에서 컨테이너를 밀고 나간다.
    minWidth: 0,
    minHeight: 50,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  iconButton: {
    width: 50,
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  hint: { fontSize: 12, color: Colors.muted },
});
