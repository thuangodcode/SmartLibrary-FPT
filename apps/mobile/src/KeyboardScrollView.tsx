import React, { useCallback, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, findNodeHandle, type ScrollViewProps } from 'react-native';

// Keep the currently focused field visible even inside a modal or a long form.
export function KeyboardScrollView({ children, scrollToEndOnKeyboard = false, automaticallyAdjustKeyboardInsets = Platform.OS === 'ios', ...props }: ScrollViewProps & { scrollToEndOnKeyboard?: boolean }) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const ensureVisible = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    const focused = TextInput.State.currentlyFocusedInput();
    const responder = scroll.current?.getScrollResponder();
    const handle = focused && findNodeHandle(focused);
    if (handle && responder) {
      if (scrollToEndOnKeyboard) scroll.current?.scrollToEnd({ animated: true });
      else responder.scrollResponderScrollNativeHandleToKeyboard(handle, 24, true);
    }
  }, [scrollToEndOnKeyboard]);
  React.useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', () => {
      ensureVisible();
      // Wait for the bottom sheet to finish resizing before its final scroll.
      setTimeout(ensureVisible, 150);
    });
    return () => listener.remove();
  }, [ensureVisible]);
  return <ScrollView {...props} ref={scroll} automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets} keyboardShouldPersistTaps="handled" onTouchEnd={(event) => { props.onTouchEnd?.(event); setTimeout(ensureVisible, 100); }}>{children}</ScrollView>;
}
