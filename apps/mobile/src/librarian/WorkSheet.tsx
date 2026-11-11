import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';
import { KeyboardScrollView } from '../KeyboardScrollView';
import { C, u } from './ui';

export function WorkSheet({ title, busy = false, onClose, onBack, footer, children }: React.PropsWithChildren<{ title: string; busy?: boolean; onClose: () => void; onBack?: () => void; footer?: React.ReactNode }>) {
  return <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal={false} onRequestClose={() => { if (!busy) (onBack || onClose)(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: C.white, borderBottomWidth: 1, borderColor: C.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" disabled={busy} onPress={onBack || onClose} style={u.iconButton}><ChevronLeft size={22} color={C.ink} /></Pressable>
        <Text style={[u.itemTitle, { flex: 1, textAlign: 'center' }]}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết" disabled={busy} onPress={onClose} style={u.iconButton}><X size={20} color={C.muted} /></Pressable>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={80}>
        <KeyboardScrollView keepFocusedFieldVisible automaticallyAdjustKeyboardInsets={false} contentContainerStyle={u.page}>{children}</KeyboardScrollView>
        {footer && <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, gap: 8, backgroundColor: C.white, borderTopWidth: 1, borderColor: C.line }}>{footer}</View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
