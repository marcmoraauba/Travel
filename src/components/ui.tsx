import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { radius, space, useColors } from '../theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.primary : 'transparent';
  const fg = variant === 'primary' ? c.primaryText : variant === 'danger' ? c.danger : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'primary' ? bg : fg, opacity: pressed || disabled ? 0.6 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.md }}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, { color: c.text, backgroundColor: c.surface, borderColor: c.border }, props.style]}
      />
      {hint ? <Text style={[styles.hint, { color: c.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={[styles.label, { color: c.muted }]}>{label}</Text> : null}
      <View style={[styles.segmented, { borderColor: c.border, backgroundColor: c.surface }]}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(o.value)}
              style={[styles.segment, active && { backgroundColor: c.primary }]}
            >
              <Text style={{ color: active ? c.primaryText : c.text, fontWeight: '600' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Card({ children, onPress, style }: { children: ReactNode; onPress?: () => void; style?: ViewStyle }) {
  const c = useColors();
  const content = <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, { color: c.text }]}>{children}</Text>
      {right}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  const c = useColors();
  return <Text style={[{ color: c.muted, fontSize: 14 }, style]}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 17, fontWeight: '600' }}>{children}</Text>;
}

export function Badge({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'primary' | 'warning' }) {
  const c = useColors();
  const bg = tone === 'primary' ? c.primary : tone === 'warning' ? c.warningBg : c.border;
  const fg = tone === 'primary' ? c.primaryText : c.text;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.notice, { backgroundColor: c.warningBg }]}>
      <Text style={{ color: c.text, fontSize: 14 }}>{children}</Text>
    </View>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Text style={{ color: c.text, fontSize: 18, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: c.muted, textAlign: 'center', marginTop: space.sm, marginBottom: space.lg }}>{text}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: space.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 12, marginTop: space.xs },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.lg, marginBottom: space.sm },
  section: { fontSize: 20, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: space.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  notice: { borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  empty: { alignItems: 'center', padding: space.xl, marginTop: space.xl },
});
