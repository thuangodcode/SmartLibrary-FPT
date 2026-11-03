import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from './src/session';
import { SmartLibraryApp } from './src/ui';

export default function App() {
  return <SafeAreaProvider><SessionProvider><StatusBar style="dark" /><SmartLibraryApp /></SessionProvider></SafeAreaProvider>;
}
