import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../src/i18n/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dynamic imports
let Location: any = null;
let DeviceMotion: any = null;
let Magnetometer: any = null;

if (Platform.OS !== 'web') {
  Location = require('expo-location');
  const Sensors = require('expo-sensors');
  DeviceMotion = Sensors.DeviceMotion;
  Magnetometer = Sensors.Magnetometer;
}

const { width } = Dimensions.get('window');
const COMPASS_SIZE = Math.min(width * 0.82, 300);

// Kaaba coordinates  
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

export default function QiblaScreen() {
  const { t } = useLanguage();
  const [heading, setHeading] = useState(0);
  const [qiblaDirection, setQiblaDirection] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const [manualMode, setManualMode] = useState(false);
  const [manualHeading, setManualHeading] = useState(0);
  
  const compassAnim = useRef(new Animated.Value(0)).current;
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    loadCalibration();
    initializeQibla();
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  useEffect(() => {
    const finalHeading = manualMode ? manualHeading : (heading + calibrationOffset);
    const normalized = ((finalHeading % 360) + 360) % 360;
    
    Animated.timing(compassAnim, {
      toValue: normalized,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [heading, calibrationOffset, manualMode, manualHeading]);

  const loadCalibration = async () => {
    try {
      const saved = await AsyncStorage.getItem('qibla_calibration');
      if (saved) {
        setCalibrationOffset(parseFloat(saved));
      }
    } catch (e) {
      console.log('Error loading calibration');
    }
  };

  const saveCalibration = async (offset: number) => {
    try {
      await AsyncStorage.setItem('qibla_calibration', offset.toString());
    } catch (e) {
      console.log('Error saving calibration');
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const calculateQiblaDirection = (lat: number, lng: number): number => {
    const latRad = lat * Math.PI / 180;
    const lngRad = lng * Math.PI / 180;
    const kaabaLatRad = KAABA_LAT * Math.PI / 180;
    const kaabaLngRad = KAABA_LNG * Math.PI / 180;
    
    const y = Math.sin(kaabaLngRad - lngRad);
    const x = Math.cos(latRad) * Math.tan(kaabaLatRad) - 
              Math.sin(latRad) * Math.cos(kaabaLngRad - lngRad);
    
    let qibla = Math.atan2(y, x) * 180 / Math.PI;
    qibla = ((qibla % 360) + 360) % 360;
    
    return qibla;
  };

  const initializeQibla = async () => {
    if (Platform.OS === 'web') {
      setError('Bu özellik sadece mobil cihazlarda çalışır');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (!Location) {
        setError(t.qibla.permissionRequired);
        setLoading(false);
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t.qibla.permissionRequired);
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      
      const qibla = calculateQiblaDirection(coords.lat, coords.lng);
      setQiblaDirection(qibla);

      const dist = calculateDistance(coords.lat, coords.lng, KAABA_LAT, KAABA_LNG);
      setDistance(Math.round(dist));

      // Try DeviceMotion first, fallback to Magnetometer
      startSensors();
      
      setLoading(false);
    } catch (err) {
      console.error('Qibla init error:', err);
      setError(t.qibla.error);
      setLoading(false);
    }
  };

  const startSensors = async () => {
    // Try Magnetometer
    if (Magnetometer) {
      try {
        Magnetometer.setUpdateInterval(100);
        
        const sub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
          // Standard formula for most Android devices
          let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
          angle = ((90 - angle) % 360 + 360) % 360;
          setHeading(angle);
        });
        
        setSubscription(sub);
      } catch (e) {
        console.log('Magnetometer error:', e);
      }
    }
  };

  const getCurrentHeading = () => {
    if (manualMode) return manualHeading;
    return ((heading + calibrationOffset) % 360 + 360) % 360;
  };

  const getQiblaRelativeAngle = () => {
    if (qiblaDirection === null) return 0;
    const current = getCurrentHeading();
    let diff = qiblaDirection - current;
    return ((diff % 360) + 360) % 360;
  };

  const isPointingToQibla = (): boolean => {
    const angle = getQiblaRelativeAngle();
    return angle < 15 || angle > 345;
  };

  const getDirectionText = (): string => {
    if (qiblaDirection === null) return '';
    const angle = getQiblaRelativeAngle();
    
    if (angle < 15 || angle > 345) {
      return '✓ Kıble Yönündesiniz!';
    } else if (angle <= 180) {
      return `→ Sağa ${angle.toFixed(0)}° dönün`;
    } else {
      return `← Sola ${(360 - angle).toFixed(0)}° dönün`;
    }
  };

  const adjustCalibration = (amount: number) => {
    const newOffset = calibrationOffset + amount;
    setCalibrationOffset(newOffset);
    saveCalibration(newOffset);
  };

  const resetCalibration = () => {
    setCalibrationOffset(0);
    saveCalibration(0);
  };

  const setAsNorth = () => {
    // Set current heading as 0 (North)
    const newOffset = -heading;
    setCalibrationOffset(newOffset);
    saveCalibration(newOffset);
    Alert.alert('Kalibrasyon', 'Kuzey yönü ayarlandı!');
  };

  const compassRotation = compassAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '-360deg'],
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#C9A227" />
          <Text style={styles.loadingText}>{t.qibla.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={60} color="#E74C3C" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeQibla}>
            <Text style={styles.retryText}>{t.qibla.retry}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const currentHeading = getCurrentHeading();
  const qiblaRelative = getQiblaRelativeAngle();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Kıble Pusulası</Text>
          <View style={styles.headerInfo}>
            <Text style={styles.qiblaAngle}>Kıble: {qiblaDirection?.toFixed(1)}°</Text>
            <Text style={styles.distance}>{distance?.toLocaleString()} km</Text>
          </View>
        </View>

        {/* Main Display */}
        <View style={styles.mainDisplay}>
          <Text style={styles.currentHeading}>{currentHeading.toFixed(0)}°</Text>
          <Text style={styles.currentLabel}>Pusula Yönü</Text>
        </View>

        {/* Compass */}
        <View style={styles.compassContainer}>
          {/* Fixed North marker */}
          <View style={styles.northPointer}>
            <Ionicons name="caret-down" size={24} color="#E74C3C" />
          </View>

          {/* Rotating dial */}
          <Animated.View style={[
            styles.compassDial,
            { transform: [{ rotate: compassRotation }] }
          ]}>
            {/* Degree marks */}
            {[...Array(36)].map((_, i) => {
              const deg = i * 10;
              const isCardinal = deg % 90 === 0;
              const isMajor = deg % 30 === 0;
              return (
                <View
                  key={i}
                  style={[
                    styles.tickContainer,
                    { transform: [{ rotate: `${deg}deg` }] }
                  ]}
                >
                  <View style={[
                    styles.tick,
                    isCardinal && styles.tickCardinal,
                    isMajor && !isCardinal && styles.tickMajor,
                  ]} />
                  {isMajor && (
                    <Text style={[
                      styles.tickText,
                      isCardinal && styles.tickTextCardinal,
                    ]}>
                      {deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : deg}
                    </Text>
                  )}
                </View>
              );
            })}

            {/* Qibla indicator on dial */}
            <View style={[
              styles.qiblaMarker,
              { transform: [{ rotate: `${qiblaDirection}deg` }] }
            ]}>
              <View style={[
                styles.qiblaArrow,
                isPointingToQibla() && styles.qiblaArrowActive
              ]}>
                <Text style={styles.qiblaLabel}>KIBLE</Text>
                <Ionicons 
                  name="arrow-up" 
                  size={28} 
                  color={isPointingToQibla() ? '#27AE60' : '#C9A227'} 
                />
              </View>
            </View>

            {/* Center */}
            <View style={[
              styles.centerCircle,
              isPointingToQibla() && styles.centerCircleActive
            ]}>
              <Ionicons 
                name="cube" 
                size={28} 
                color={isPointingToQibla() ? '#27AE60' : '#C9A227'} 
              />
            </View>
          </Animated.View>
        </View>

        {/* Status */}
        <View style={[
          styles.statusBox,
          isPointingToQibla() && styles.statusBoxActive
        ]}>
          <Text style={[
            styles.statusText,
            isPointingToQibla() && styles.statusTextActive
          ]}>
            {getDirectionText()}
          </Text>
        </View>

        {/* Calibration Controls */}
        <View style={styles.calibrationSection}>
          <Text style={styles.calibrationTitle}>Pusula Kalibrasyonu</Text>
          <Text style={styles.calibrationHint}>
            Pusula yanlış gösteriyorsa aşağıdaki butonlarla ayarlayın
          </Text>
          
          <View style={styles.calibrationControls}>
            <TouchableOpacity 
              style={styles.calBtn} 
              onPress={() => adjustCalibration(-10)}
            >
              <Text style={styles.calBtnText}>-10°</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.calBtn} 
              onPress={() => adjustCalibration(-1)}
            >
              <Text style={styles.calBtnText}>-1°</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.calBtnReset} 
              onPress={resetCalibration}
            >
              <Text style={styles.calBtnResetText}>Sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.calBtn} 
              onPress={() => adjustCalibration(1)}
            >
              <Text style={styles.calBtnText}>+1°</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.calBtn} 
              onPress={() => adjustCalibration(10)}
            >
              <Text style={styles.calBtnText}>+10°</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.northBtn} onPress={setAsNorth}>
            <Ionicons name="navigate" size={18} color="#0A0A14" />
            <Text style={styles.northBtnText}>Şu anı Kuzey (0°) olarak ayarla</Text>
          </TouchableOpacity>

          {calibrationOffset !== 0 && (
            <Text style={styles.offsetText}>
              Kalibrasyon: {calibrationOffset > 0 ? '+' : ''}{calibrationOffset.toFixed(0)}°
            </Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A14',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#C9A227',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryText: {
    color: '#0A0A14',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  headerInfo: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 4,
  },
  qiblaAngle: {
    color: '#C9A227',
    fontSize: 13,
  },
  distance: {
    color: '#8E8E93',
    fontSize: 13,
  },
  mainDisplay: {
    alignItems: 'center',
    marginBottom: 10,
  },
  currentHeading: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '200',
  },
  currentLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  compassContainer: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  northPointer: {
    position: 'absolute',
    top: -12,
    zIndex: 10,
  },
  compassDial: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: '#12121E',
    borderWidth: 2,
    borderColor: '#1E1E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickContainer: {
    position: 'absolute',
    top: 0,
    height: COMPASS_SIZE / 2,
    alignItems: 'center',
  },
  tick: {
    width: 1,
    height: 8,
    backgroundColor: '#3D3D5C',
    marginTop: 8,
  },
  tickMajor: {
    width: 2,
    height: 14,
    backgroundColor: '#5D5D7C',
  },
  tickCardinal: {
    width: 3,
    height: 18,
    backgroundColor: '#C9A227',
  },
  tickText: {
    color: '#8E8E93',
    fontSize: 10,
    marginTop: 2,
  },
  tickTextCardinal: {
    color: '#C9A227',
    fontSize: 13,
    fontWeight: '700',
  },
  qiblaMarker: {
    position: 'absolute',
    top: 0,
    height: COMPASS_SIZE / 2,
    alignItems: 'center',
  },
  qiblaArrow: {
    alignItems: 'center',
    marginTop: 35,
  },
  qiblaArrowActive: {
    transform: [{ scale: 1.15 }],
  },
  qiblaLabel: {
    color: '#C9A227',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
  centerCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A0A14',
    borderWidth: 2,
    borderColor: '#C9A227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerCircleActive: {
    borderColor: '#27AE60',
    backgroundColor: '#0D1A12',
  },
  statusBox: {
    backgroundColor: '#12121E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  statusBoxActive: {
    backgroundColor: '#0D1A12',
    borderColor: '#27AE60',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#27AE60',
  },
  calibrationSection: {
    width: '100%',
    backgroundColor: '#12121E',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  calibrationTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  calibrationHint: {
    color: '#8E8E93',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
  },
  calibrationControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  calBtn: {
    backgroundColor: '#1E1E2E',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  calBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  calBtnReset: {
    backgroundColor: '#2D2D44',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  calBtnResetText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
  northBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C9A227',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  northBtnText: {
    color: '#0A0A14',
    fontSize: 13,
    fontWeight: '600',
  },
  offsetText: {
    color: '#C9A227',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
});
