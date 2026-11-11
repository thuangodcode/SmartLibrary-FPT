import React, { useCallback, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, findNodeHandle, type ScrollViewProps } from 'react-native';

// Keep the currently focused field visible even inside a modal or a long form.
export function KeyboardScrollView({ children, scrollToEndOnKeyboard = false, keepFocusedFieldVisible = false, automaticallyAdjustKeyboardInsets = Platform.OS === 'ios', ...props }: ScrollViewProps & { scrollToEndOnKeyboard?: boolean; keepFocusedFieldVisible?: boolean }) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const keyboardVisible = useRef(false);
  const ensureVisible = useCallback(() => {
    if (Platform.OS !== 'ios' && !keepFocusedFieldVisible) return;
    const focused = TextInput.State.currentlyFocusedInput();
    // A sheet footer reduces the actual scroll viewport. Measure that viewport rather
    // than the keyboard's screen position, which native pageSheet offsets can change.
    if (keepFocusedFieldVisible && focused && scroll.current) {
      focused.measureInWindow((_x, fieldY, _width, fieldHeight) => {
        scroll.current?.measureInWindow((_sx, scrollY, _sw, scrollHeight) => {
          if (scrollHeight <= 0) return;
          const delta = fieldHeight > scrollHeight - 32 ? fieldY - scrollY - 16
            : fieldY + fieldHeight > scrollY + scrollHeight - 16 ? fieldY + fieldHeight - (scrollY + scrollHeight - 16)
            : fieldY < scrollY + 16 ? fieldY - scrollY - 16 : 0;
          if (Math.abs(delta) > 2) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
        });
      });
      return;
    }
    const responder = scroll.current?.getScrollResponder();
    const handle = focused && findNodeHandle(focused);
    if (handle && responder) {
      if (scrollToEndOnKeyboard) scroll.current?.scrollToEnd({ animated: true });
      else responder.scrollResponderScrollNativeHandleToKeyboard(handle, 24, true);
    }
  }, [scrollToEndOnKeyboard, keepFocusedFieldVisible]);
  React.useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', () => {
      keyboardVisible.current = true;
      ensureVisible();
      // Wait for the bottom sheet to finish resizing before its final scroll.
      setTimeout(ensureVisible, 150);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardVisible.current = false; });
    return () => { listener.remove(); hide.remove(); };
  }, [ensureVisible]);
  return <ScrollView {...props} ref={scroll} automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; props.onScroll?.(event); }} onLayout={event => { props.onLayout?.(event); if (keepFocusedFieldVisible && keyboardVisible.current) setTimeout(ensureVisible, 150); }} onTouchEnd={(event) => { props.onTouchEnd?.(event); setTimeout(ensureVisible, 100); }}>{children}</ScrollView>;
}
