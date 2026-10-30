// android-geofence/AttendanceScreen.tsx
// Mobile Attendance Screen with auto-sync and manual fallback buttons
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { requestPermissions, startGeofencing, SiteRecord } from './geofence';
import { enqueueEvent, flushQueue } from './eventQueue';

interface AttendanceScreenProps {
  sites: SiteRecord[];
  userId: string;
}

export default function AttendanceScreen({ sites, userId }: AttendanceScreenProps) {
  const [loading, setLoading] = useState<boolean>(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Initializing geofencing...');

  useEffect(() => {
    (async () => {
      const granted = await requestPermissions();
      setPermissionGranted(granted);
      if (granted && sites.length > 0) {
        await startGeofencing(sites);
        setStatusMessage(`Geofencing active for ${sites.length} site(s).`);
      } else {
        setStatusMessage('Background location permission required for automatic check-in.');
      }
      await flushQueue();
    })();
  }, [sites]);

  const manualCheck = async (type: 'manual_in' | 'manual_out', siteId: string) => {
    setLoading(true);
    try {
      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await enqueueEvent({
        clientEventId: Crypto.randomUUID(),
        siteId,
        type,
        source: 'manual',
        platform: 'android',
        lat: fix.coords.latitude,
        lng: fix.coords.longitude,
        accuracyM: fix.coords.accuracy,
        isMock: (fix as any).mocked ?? false,
        deviceTime: new Date().toISOString(),
      });

      const { sent, remaining } = await flushQueue();
      if (sent > 0) {
        Alert.alert('Success', `Manual ${type === 'manual_in' ? 'check-in' : 'check-out'} recorded.`);
      } else if (remaining > 0) {
        Alert.alert('Offline', 'Event saved locally and queued for automatic sync.');
      }
    } catch (err: any) {
      Alert.alert('GPS Error', err.message || 'Could not obtain GPS fix. Please verify location services.');
    } finally {
      setLoading(false);
    }
  };

  const primarySite = sites[0];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ekklesphere Attendance</Text>
      <Text style={styles.subtitle}>{primarySite?.name || 'Assigned Site'}</Text>

      <View style={[styles.badge, permissionGranted ? styles.badgeSuccess : styles.badgeWarning]}>
        <Text style={styles.badgeText}>{statusMessage}</Text>
      </View>

      <View style={styles.buttonGroup}>
        <TouchableOpacity
          style={[styles.button, styles.btnIn]}
          onPress={() => primarySite && manualCheck('manual_in', primarySite.id)}
          disabled={loading || !primarySite}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>Manual Check In</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.btnOut]}
          onPress={() => primarySite && manualCheck('manual_out', primarySite.id)}
          disabled={loading || !primarySite}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>Manual Check Out</Text>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.footer}>
        Background geofence records entrance & exit automatically. Manual buttons provide fallback for indoor areas or battery savers.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: '#F6F7FC',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D1B3A',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666A86',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  badge: {
    padding: 12,
    borderRadius: 16,
    marginBottom: 24,
  },
  badgeSuccess: {
    backgroundColor: '#DDF5EC',
  },
  badgeWarning: {
    backgroundColor: '#FFEFD0',
  },
  badgeText: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
    color: '#1D1B3A',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  btnIn: {
    backgroundColor: '#6D5CF2',
  },
  btnOut: {
    backgroundColor: '#1D1B3A',
  },
  btnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  footer: {
    fontSize: 11,
    color: '#8A8EA8',
    textAlign: 'center',
    marginTop: 28,
    lineHeight: 16,
  },
});
