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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../src/i18n/LanguageContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dynamic imports
let Location: any = null;
let Magnetometer: any = null;

if (Platform.OS !== 'web') {
  Location = require('expo-location');
  const Sensors = require('expo-sensors');
  Magnetometer = Sensors.Magnetometer;
}

const { width, height } = Dimensions.get('window');
const COMPASS_SIZE = Math.min(width - 40, 320);

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
    const finalHeading = (heading + calibrationOffset + 360) % 360;
    
    Animated.timing(compassAnim, {
      toValue: finalHeading,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [heading, calibrationOffset]);

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

      startMagnetometer();
      
      setLoading(false);
    } catch (err) {
      console.error('Qibla init error:', err);
      setError(t.qibla.error);
      setLoading(false);
    }
  };

  const startMagnetometer = () => {
    if (!Magnetometer) return;

    Magnetometer.setUpdateInterval(100);
    
    const sub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
      let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
      angle = ((90 - angle) % 360 + 360) % 360;
      setHeading(angle);
    });
    
    setSubscription(sub);
  };

  const getCurrentHeading = () => {
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
          <ActivityIndicator size="large" color="#D4AF37" />
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={styles.title}>Kıble Pusulası</Text>
        
        {/* Info Row */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Kıble Açısı</Text>
            <Text style={styles.infoValue}>{qiblaDirection?.toFixed(1)}°</Text>
          </View>
          <View style={styles.infoSeparator} />
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Mesafe</Text>
            <Text style={styles.infoValue}>{distance?.toLocaleString()} km</Text>
          </View>
        </View>

        {/* Current Heading */}
        <View style={styles.headingContainer}>
          <Text style={styles.headingValue}>{currentHeading.toFixed(0)}°</Text>
          <Text style={styles.headingLabel}>Pusula Yönü</Text>
        </View>

        {/* Compass */}
        <View style={styles.compassWrapper}>
          {/* North indicator - fixed at top */}
          <View style={styles.northIndicator}>
            <View style={styles.northTriangle} />
          </View>

          {/* Compass dial */}
          <Animated.View 
            style={[
              styles.compassDial,
              { transform: [{ rotate: compassRotation }] }
            ]}
          >
            {/* Outer ring with degree marks */}
            <View style={styles.outerRing}>
              {/* Degree markers */}
              {[...Array(72)].map((_, i) => {
                const deg = i * 5;
                const isCardinal = deg % 90 === 0;
                const isMajor = deg % 30 === 0;
                return (
                  <View
                    key={i}
                    style={[
                      styles.degreeMarker,
                      { transform: [{ rotate: `${deg}deg` }] }
                    ]}
                  >
                    <View style={[
                      styles.markerLine,
                      isCardinal && styles.markerCardinal,
                      isMajor && !isCardinal && styles.markerMajor,
                    ]} />
                  </View>
                );
              })}

              {/* Cardinal labels */}
              <View style={[styles.cardinalLabel, styles.cardinalN]}>
                <Text style={styles.cardinalText}>N</Text>
              </View>
              <View style={[styles.cardinalLabel, styles.cardinalE]}>
                <Text style={styles.cardinalTextSmall}>E</Text>
              </View>
              <View style={[styles.cardinalLabel, styles.cardinalS]}>
                <Text style={styles.cardinalTextSmall}>S</Text>
              </View>
              <View style={[styles.cardinalLabel, styles.cardinalW]}>
                <Text style={styles.cardinalTextSmall}>W</Text>
              </View>

              {/* Degree numbers */}
              <View style={[styles.degreeLabel, { transform: [{ rotate: '30deg' }] }]}>
                <Text style={styles.degreeLabelText}>30</Text>
              </View>
              <View style={[styles.degreeLabel, { transform: [{ rotate: '60deg' }] }]}>
                <Text style={styles.degreeLabelText}>60</Text>
              </View>
              <View style={[styles.degreeLabel, { transform: [{ rotate: '120deg' }] }]}>
                <Text style={styles.degreeLabelText}>120</Text>
              </View>
              <View style={[styles.degreeLabel, { transform: [{ rotate: '150deg' }] }]}>
                <Text style={styles.degreeLabelText}>150</Text>
              </View>
              <View style={[styles.degreeLabel, { transform: [{ rotate: '210deg' }] }]}>
                <Text style={styles.degreeLabelText}>210</Text>
              </View>
              <View style={[styles.degreeLabel, { transform: [{ rotate: '240deg' }] }]}>
                <Text style={styles.degreeLabelText}>240</Text>
              </View>
              <View style={[styles.degreeLabel, { transform: [{ rotate: '300deg' }] }]}>
                <Text style={styles.degreeLabelText}>300</Text>
              </View>
              <View style={[styles.degreeLabel, { transform: [{ rotate: '330deg' }] }]}>
                <Text style={styles.degreeLabelText}>330</Text>
              </View>
            </View>

            {/* Inner area */}
            <View style={styles.innerCircle}>
              {/* Qibla arrow */}
              <View 
                style={[
                  styles.qiblaArrowContainer,
                  { transform: [{ rotate: `${qiblaDirection || 0}deg` }] }
                ]}
              >
                <View style={styles.qiblaArrow}>
                  <Text style={[
                    styles.qiblaText,
                    isPointingToQibla() && styles.qiblaTextActive
                  ]}>KIBLE</Text>
                  <Ionicons 
                    name="arrow-up" 
                    size={32} 
                    color={isPointingToQibla() ? '#27AE60' : '#D4AF37'} 
                  />
                </View>
              </View>

              {/* Center Kaaba icon */}
              <View style={[
                styles.centerKaaba,
                isPointingToQibla() && styles.centerKaabaActive
              ]}>
                <Ionicons 
                  name="cube" 
                  size={26} 
                  color={isPointingToQibla() ? '#27AE60' : '#D4AF37'} 
                />
              </View>
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

        {/* Calibration Section */}
        <View style={styles.calibrationCard}>
          <Text style={styles.calibrationTitle}>Pusula Kalibrasyonu</Text>
          <Text style={styles.calibrationHint}>
            Pusula yanlış gösteriyorsa butonlarla ayarlayın
          </Text>
          
          <View style={styles.calibrationButtons}>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(-10)}>
              <Text style={styles.calBtnText}>-10°</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(-1)}>
              <Text style={styles.calBtnText}>-1°</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtnReset} onPress={resetCalibration}>
              <Text style={styles.calBtnResetText}>Sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(1)}>
              <Text style={styles.calBtnText}>+1°</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(10)}>
              <Text style={styles.calBtnText}>+10°</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.northBtn} onPress={setAsNorth}>
            <Ionicons name="navigate" size={16} color="#0F0F1A" />
            <Text style={styles.northBtnText}>Şu anı Kuzey olarak ayarla</Text>
          </TouchableOpacity>

          {calibrationOffset !== 0 && (
            <Text style={styles.offsetInfo}>
              Kalibrasyon: {calibrationOffset > 0 ? '+' : ''}{calibrationOffset.toFixed(0)}°
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 30,
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
    backgroundColor: '#D4AF37',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryText: {
    color: '#0F0F1A',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  infoItem: {
    alignItems: 'center',
    flex: 1,
  },
  infoSeparator: {
    width: 1,
    backgroundColor: '#2D2D44',
    marginHorizontal: 16,
  },
  infoLabel: {
    color: '#8E8E93',
    fontSize: 11,
  },
  infoValue: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 2,
  },
  headingContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  headingValue: {
    color: '#FFFFFF',
    fontSize: 52,
    fontWeight: '200',
  },
  headingLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  compassWrapper: {
    width: COMPASS_SIZE + 20,
    height: COMPASS_SIZE + 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  northIndicator: {
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  northTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#E74C3C',
  },
  compassDial: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2D2D44',
  },
  outerRing: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  degreeMarker: {
    position: 'absolute',
    width: 2,
    height: COMPASS_SIZE / 2,
    alignItems: 'center',
  },
  markerLine: {
    width: 1,
    height: 8,
    backgroundColor: '#3D3D5C',
    marginTop: 4,
  },
  markerMajor: {
    width: 2,
    height: 12,
    backgroundColor: '#5D5D7C',
  },
  markerCardinal: {
    width: 3,
    height: 16,
    backgroundColor: '#D4AF37',
  },
  cardinalLabel: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardinalN: {
    top: 22,
  },
  cardinalE: {
    right: 22,
  },
  cardinalS: {
    bottom: 22,
  },
  cardinalW: {
    left: 22,
  },
  cardinalText: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '700',
  },
  cardinalTextSmall: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  degreeLabel: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
  },
  degreeLabelText: {
    color: '#5D5D7C',
    fontSize: 10,
    marginTop: 42,
  },
  innerCircle: {
    width: COMPASS_SIZE - 90,
    height: COMPASS_SIZE - 90,
    borderRadius: (COMPASS_SIZE - 90) / 2,
    backgroundColor: '#0F0F1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  qiblaArrowContainer: {
    position: 'absolute',
    width: COMPASS_SIZE - 90,
    height: COMPASS_SIZE - 90,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 12,
  },
  qiblaArrow: {
    alignItems: 'center',
  },
  qiblaText: {
    color: '#D4AF37',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: -4,
  },
  qiblaTextActive: {
    color: '#27AE60',
  },
  centerKaaba: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1A1A2E',
    borderWidth: 2,
    borderColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerKaabaActive: {
    borderColor: '#27AE60',
    backgroundColor: '#0D1A12',
  },
  statusBox: {
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  statusBoxActive: {
    backgroundColor: '#0D1A12',
    borderColor: '#27AE60',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#27AE60',
  },
  calibrationCard: {
    width: '100%',
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2D2D44',
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
    marginBottom: 14,
  },
  calibrationButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  calBtn: {
    backgroundColor: '#2D2D44',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  calBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  calBtnReset: {
    backgroundColor: '#3D3D5C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  calBtnResetText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  northBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  northBtnText: {
    color: '#0F0F1A',
    fontSize: 13,
    fontWeight: '600',
  },
  offsetInfo: {
    color: '#D4AF37',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
});
