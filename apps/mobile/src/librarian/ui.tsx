import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { BookOpen, ChevronRight } from 'lucide-react-native';

// FPT's orange is reserved for actions. A darker orange keeps white button text readable.
export const C = { bg: '#f6f7f9', white: '#fff', ink: '#172033', muted: '#626b79', line: '#e8ebef', accent: '#c64b0b', brand: '#ef6418', soft: '#fff3eb', green: '#236644', greenBg: '#edf7f0', red: '#a52b32', redBg: '#fff0f0' };
export function Action({ title, onPress, secondary = false, disabled = false, busy = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || busy }} onPress={onPress} disabled={disabled || busy}
    style={({ pressed }) => [u.button, secondary ? u.secondary : u.primary, (disabled || busy) && u.disabled, pressed && u.pressed]}>
    {busy && <ActivityIndicator color={secondary ? C.ink : C.white} />}<Text style={[u.buttonText, { color: secondary ? C.ink : C.white }]}>{title}</Text>
  </Pressable>;
}
export function Title({ title, detail }: { title: string; detail?: string }) { return <View style={u.titleBlock}><Text accessibilityRole="header" style={u.title}>{title}</Text>{detail && <Text style={u.body}>{detail}</Text>}</View>; }
export function Section({ title, children }: React.PropsWithChildren<{ title: string }>) { return <View style={u.section}><Text accessibilityRole="header" style={u.sectionTitle}>{title}</Text>{children}</View>; }
export function Notice({ text, error = false, retry }: { text: string; error?: boolean; retry?: () => void }) {
  return <View accessibilityLiveRegion="polite" style={[u.notice, error && { backgroundColor: C.redBg }]}><Text style={[u.body, { color: error ? C.red : C.muted }]}>{text}</Text>{retry && <Action title="Thử lại" onPress={retry} secondary />}</View>;
}
export function Loading({ text = 'Đang tải dữ liệu…' }: { text?: string }) { return <View style={u.loading}><ActivityIndicator color={C.accent} /><Text style={u.body}>{text}</Text></View>; }
export function BookIdentity({ title, code, cover }: { title: string; code: string; cover?: string }) {
  return <View style={u.identity}>{cover ? <Image source={{ uri: cover }} style={u.cover} /> : <View style={[u.cover, u.coverFallback]}><BookOpen color={C.muted} size={24} /></View>}<View style={u.grow}><Text style={u.itemTitle}>{title}</Text><Text selectable style={u.code}>{code}</Text></View></View>;
}
export function Info({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <View style={u.infoRow}><Text style={[u.body, { flex: 1 }]}>{label}</Text><Text style={[u.infoValue, danger && { color: C.red }]}>{value}</Text></View>; }
export function LinkRow({ title, detail, value, onPress }: { title: string; detail: string; value?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [u.linkRow, pressed && u.pressed]}><View style={u.grow}><Text style={u.itemTitle}>{title}</Text><Text style={u.body}>{detail}</Text></View>{value !== undefined && <Text style={u.count}>{value}</Text>}<ChevronRight size={19} color={C.muted} /></Pressable>;
}
export const u = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  page: { padding: 20, paddingBottom: 32, gap: 24 }, titleBlock: { gap: 8 }, title: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: C.ink, letterSpacing: -0.6 },
  section: { gap: 12 }, sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: C.ink },
  body: { fontSize: 14, lineHeight: 21, color: C.muted }, itemTitle: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: C.ink },
  panel: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, gap: 16 },
  button: { minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  primary: { backgroundColor: C.accent }, secondary: { backgroundColor: C.white, borderWidth: 1, borderColor: '#cbd1d9' }, buttonText: { fontSize: 15, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.55 }, pressed: { opacity: 0.7 },
  notice: { padding: 16, gap: 12, backgroundColor: C.bg, borderRadius: 8 }, loading: { paddingVertical: 28, gap: 12, alignItems: 'center' },
  identity: { flexDirection: 'row', gap: 16, alignItems: 'center' }, cover: { width: 52, height: 72, borderRadius: 4, backgroundColor: C.bg }, coverFallback: { alignItems: 'center', justifyContent: 'center' },
  code: { fontSize: 15, lineHeight: 23, color: C.muted, marginTop: 5, fontWeight: '500' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }, infoValue: { fontSize: 14, lineHeight: 21, color: C.ink, fontWeight: '500', textAlign: 'right', maxWidth: '62%', fontVariant: ['tabular-nums'] },
  linkRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 14 }, count: { fontSize: 24, fontWeight: '500', color: C.ink, fontVariant: ['tabular-nums'] },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: '#cbd1d9', borderRadius: 8, fontSize: 16, color: C.ink, backgroundColor: C.white },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  badge: { alignSelf: 'flex-start', backgroundColor: C.bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4 }, badgeText: { color: C.ink, fontSize: 12, lineHeight: 18, fontWeight: '500' },
});
