import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, CircleAlert, Search, X } from 'lucide-react-native';

// FPT's orange is reserved for actions. A darker orange keeps white button text readable.
export const C = { bg: '#f2f5f8', white: '#fff', ink: '#172033', muted: '#626b79', line: '#e5eaf0', accent: '#c64b0b', brand: '#ef6418', soft: '#fff0e5', green: '#236644', greenBg: '#eaf5ee', red: '#a52b32', redBg: '#fff0f0', amber: '#8c5412', amberBg: '#fff4df', control: '#cbd3dd' };
export type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning';
export function toneColors(tone: Tone) {
  return tone === 'accent' ? { color: C.accent, backgroundColor: C.soft } : tone === 'positive' ? { color: C.green, backgroundColor: C.greenBg } : tone === 'negative' ? { color: C.red, backgroundColor: C.redBg } : tone === 'warning' ? { color: C.amber, backgroundColor: C.amberBg } : { color: C.muted, backgroundColor: C.bg };
}
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const colors = toneColors(tone);
  return <View style={[u.badge, { backgroundColor: colors.backgroundColor }]}><Text style={[u.badgeText, { color: colors.color }]}>{label}</Text></View>;
}
export function Action({ title, onPress, secondary = false, disabled = false, busy = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy }} onPress={onPress} disabled={disabled || busy}
    style={({ pressed }) => [u.button, secondary ? u.secondary : u.primary, (disabled || busy) && u.disabled, pressed && u.pressed]}>
    {busy && <ActivityIndicator color={secondary ? C.ink : C.white} />}<Text style={[u.buttonText, { color: secondary ? C.ink : C.white }]}>{title}</Text>
  </Pressable>;
}
export function Title({ title, detail }: { title: string; detail?: string }) { return <View style={u.titleBlock}><Text accessibilityRole="header" style={u.title}>{title}</Text>{detail && <Text style={u.body}>{detail}</Text>}</View>; }
export function Section({ title, children }: React.PropsWithChildren<{ title: string }>) { return <View style={u.section}><Text accessibilityRole="header" style={u.sectionTitle}>{title}</Text>{children}</View>; }
export function Notice({ text, error = false, success = false, retry }: { text: string; error?: boolean; success?: boolean; retry?: () => void }) {
  const color = error ? C.red : success ? C.green : C.muted;
  const Icon = success ? CheckCircle2 : CircleAlert;
  return <View accessibilityLiveRegion="polite" style={[u.notice, { backgroundColor: error ? C.redBg : success ? C.greenBg : C.bg }]}><View style={[u.row, { alignItems: 'flex-start' }]}><Icon size={18} color={color} style={{ marginTop: 2 }} /><Text style={[u.body, u.grow, { color }]}>{text}</Text></View>{retry && <Action title="Thử lại" onPress={retry} secondary />}</View>;
}
export function Loading({ text = 'Đang tải dữ liệu…' }: { text?: string }) { return <View style={u.loading}><ActivityIndicator color={C.accent} /><Text style={u.body}>{text}</Text></View>; }
export function BookIdentity({ title, code, cover }: { title: string; code: string; cover?: string }) {
  const [failed, setFailed] = useState(false);
  return <View style={u.identity}>{cover && !failed ? <Image source={{ uri: cover }} style={u.cover} onError={() => setFailed(true)} /> : <View style={[u.cover, u.coverFallback]}><BookOpen color={C.accent} size={24} /></View>}<View style={u.grow}><Text style={u.itemTitle}>{title}</Text><Text selectable style={u.code}>{code}</Text></View></View>;
}
export function SearchField({ value, onChangeText, placeholder, label }: { value: string; onChangeText: (value: string) => void; placeholder: string; label: string }) {
  return <View style={u.search}><Search size={19} color={C.muted} /><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.muted} style={u.searchInput} returnKeyType="search" autoCorrect={false} clearButtonMode="never" />{!!value && <Pressable accessibilityRole="button" accessibilityLabel="Xoá từ khoá" onPress={() => onChangeText('')} style={u.clearSearch}><X size={18} color={C.muted} /></Pressable>}</View>;
}
export function Disclosure({ title, detail, children, initiallyOpen = false }: React.PropsWithChildren<{ title: string; detail?: string; initiallyOpen?: boolean }>) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={u.panel}><Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={u.row}><View style={u.grow}><Text style={u.itemTitle}>{title}</Text>{detail && <Text style={u.body}>{detail}</Text>}</View>{open ? <ChevronDown size={19} color={C.muted} /> : <ChevronRight size={19} color={C.muted} />}</Pressable>{open && <View style={u.section}>{children}</View>}</View>;
}
export function Info({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <View style={u.infoRow}><Text style={[u.body, { flex: 1 }]}>{label}</Text><Text style={[u.infoValue, danger && { color: C.red }]}>{value}</Text></View>; }
export function LinkRow({ title, detail, value, onPress }: { title: string; detail: string; value?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [u.linkRow, pressed && u.pressed]}><View style={u.grow}><Text style={u.itemTitle}>{title}</Text><Text style={u.body}>{detail}</Text></View>{value !== undefined && <Text style={u.count}>{value}</Text>}<ChevronRight size={19} color={C.muted} /></Pressable>;
}
export const u = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  page: { padding: 20, paddingBottom: 36, gap: 20 }, titleBlock: { gap: 6 }, title: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: C.ink, letterSpacing: -0.6 },
  section: { gap: 12 }, sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: C.ink },
  body: { fontSize: 14, lineHeight: 21, color: C.muted }, itemTitle: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: C.ink },
  panel: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 16, gap: 14 },
  button: { minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primary: { backgroundColor: C.accent }, secondary: { backgroundColor: C.white, borderWidth: 1, borderColor: C.control }, buttonText: { fontSize: 15, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.6 }, pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  notice: { padding: 16, gap: 12, backgroundColor: C.bg, borderRadius: 14 }, loading: { paddingVertical: 28, gap: 12, alignItems: 'center' },
  identity: { flexDirection: 'row', gap: 14, alignItems: 'center' }, cover: { width: 48, height: 66, borderRadius: 6, backgroundColor: C.bg }, coverFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft },
  code: { fontSize: 15, lineHeight: 23, color: C.muted, marginTop: 5, fontWeight: '500' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }, infoValue: { fontSize: 14, lineHeight: 21, color: C.ink, fontWeight: '500', textAlign: 'right', maxWidth: '62%', fontVariant: ['tabular-nums'] },
  linkRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 14 }, count: { fontSize: 24, fontWeight: '500', color: C.ink, fontVariant: ['tabular-nums'] },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: '#cbd1d9', borderRadius: 8, fontSize: 16, color: C.ink, backgroundColor: C.white },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  badge: { alignSelf: 'flex-start', backgroundColor: C.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexShrink: 1 }, badgeText: { color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  search: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 4, backgroundColor: C.white, borderWidth: 1, borderColor: C.control, borderRadius: 14 }, searchInput: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 15, color: C.ink, paddingVertical: 10 }, clearSearch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
