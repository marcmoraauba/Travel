import RNDateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, space, useColors } from '../theme';

/**
 * Campo de fecha ("YYYY-MM-DD") u hora ("HH:MM") con el selector nativo:
 * en iOS el selector compacto en línea; en Android el diálogo del sistema al pulsar.
 * Los valores entran y salen como texto, igual que se guardan en la BD.
 */

const pad = (n: number) => String(n).padStart(2, '0');

function toDate(value: string, mode: 'date' | 'time'): Date {
  if (mode === 'date') {
    const [y, m, d] = value.split('-').map(Number);
    return y ? new Date(y, m - 1, d, 12) : new Date();
  }
  const [h, min] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(min) ? min : 0, 0, 0);
  return d;
}

function fromDate(date: Date, mode: 'date' | 'time'): string {
  return mode === 'date'
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function display(value: string, mode: 'date' | 'time') {
  if (mode === 'time') return value;
  return toDate(value, 'date').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

export function PickerField({
  label,
  value,
  mode,
  onChange,
  minimumDate,
}: {
  label: string;
  value: string;
  mode: 'date' | 'time';
  onChange: (v: string) => void;
  minimumDate?: string;
}) {
  const c = useColors();
  const date = toDate(value, mode);
  const min = minimumDate ? toDate(minimumDate, 'date') : undefined;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <View style={[styles.box, { backgroundColor: c.surface, borderColor: c.border }]}>
          <RNDateTimePicker
            value={date}
            mode={mode}
            display="compact"
            locale="es-ES"
            minuteInterval={mode === 'time' ? 5 : undefined}
            minimumDate={min}
            accentColor={c.primary}
            onValueChange={(_, d) => onChange(fromDate(d, mode))}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${display(value, mode)}`}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: date,
              mode,
              is24Hour: true,
              minimumDate: min,
              onValueChange: (_, d) => onChange(fromDate(d, mode)),
            })
          }
          style={({ pressed }) => [styles.box, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={{ color: c.text, fontSize: 16 }}>{display(value, mode)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md, flex: 1 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: space.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  box: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, justifyContent: 'center' },
});
