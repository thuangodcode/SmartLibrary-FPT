import * as Haptics from 'expo-haptics';

// Feedback is optional: unsupported devices and system settings must never interrupt a workflow.
export function scanFeedback() { void Haptics.selectionAsync().catch(() => undefined); }
export function successFeedback() { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); }
