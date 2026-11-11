import { Platform } from 'react-native';
import Constants from 'expo-constants';

const defaultApiUrl = Platform.OS === 'android' ? 'http://10.0.2.2:5278' : 'http://localhost:5278';
// In Expo Go the Metro host is the computer that serves the app. Use it for
// both physical phones and emulators; 10.0.2.2 only works inside Android Emulator.
const metroHostUri = Constants.expoConfig?.hostUri;
const metroHost = metroHostUri?.split(':')[0];
const deviceApiUrl = metroHost ? `http://${metroHost}:5278` : defaultApiUrl;

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || deviceApiUrl).replace(/\/$/, '');
export const COLORS = {
  background: '#f4f7f2',
  surface: '#ffffff',
  ink: '#17261d',
  muted: '#758278',
  green: '#246b45',
  greenDark: '#174d32',
  paleGreen: '#e6f1e8',
  border: '#e4eae4',
  orange: '#d58436',
  red: '#bd5148',
};
