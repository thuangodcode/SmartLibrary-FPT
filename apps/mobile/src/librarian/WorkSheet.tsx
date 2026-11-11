import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';
import { KeyboardScrollView } from '../KeyboardScrollView';
import { C, u } from './ui';

export function WorkSheet({ title, busy = false, onClose, children }: React.PropsWithChildren<{ title: string; busy?: boolean; onClose: () => void }>) {
  return <Modal visible animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal={false} onRequestClose={() => { if (!busy) onClose(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }} edges={['top', 'bottom']}>
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: C.line }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Quay lại" disabled={busy} onPress={onClose} style={u.iconButton}><ChevronLeft size={22} color={C.ink} /></Pressable>
        <Text style={[u.itemTitle, { flex: 1, textAlign: 'center' }]}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Đóng chi tiết" disabled={busy} onPress={onClose} style={u.iconButton}><X size={20} color={C.muted} /></Pressable>
      </View>
      <KeyboardScrollView contentContainerStyle={u.page}>{children}</KeyboardScrollView>
    </SafeAreaView>
  </Modal>;
}
