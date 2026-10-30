# Android Geofence Attendance (Expo / React Native)

This directory contains the production-ready implementation for background geofence attendance tracking on Android.

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npx expo install expo-location expo-task-manager expo-crypto @react-native-async-storage/async-storage
   npm install @supabase/supabase-js
   ```

2. **Configure `app.json`:**
   Add `isAndroidBackgroundLocationEnabled: true` under `expo-location` plugin configuration.

3. **Build Requirements:**
   Background geofencing does **not** run inside standard Expo Go. Generate a development build or EAS build:
   ```bash
   npx expo run:android
   # or
   eas build --profile development --platform android
   ```

4. **Environment Variables:**
   ```env
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   EXPO_PUBLIC_API_URL=https://your-api.com
   ```

5. **Key Architecture Rules:**
   - Background tasks run outside of React component lifecycles. Sessions are read directly from `AsyncStorage`.
   - OS geofence transitions trigger fresh high-accuracy GPS fixes.
   - Events are buffered into `AsyncStorage` and flushed via idempotency keys (`clientEventId`).
