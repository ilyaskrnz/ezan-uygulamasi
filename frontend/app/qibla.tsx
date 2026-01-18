import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../src/i18n/LanguageContext';

// Dynamic imports for native modules
let Location: any = null;
let Magnetometer: any = null;
if (Platform.OS !== 'web') {
  Location = require('expo-location');
  Magnetometer = require('expo-sensors').Magnetometer;
}

const { width } = Dimensions.get('window');
const COMPASS_SIZE = Math.min(width * 0.85, 320);

// Kaaba coordinates
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

// Low-pass filter coefficient (0-1, lower = smoother but slower)
const ALPHA = 0.15;

export default function QiblaScreen() {
  const { t } = useLanguage();
  const [heading, setHeading] = useState(0);
  const [smoothedHeading, setSmoothedHeading] = useState(0);
  const [qiblaDirection, setQiblaDirection] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const [showCalibration, setShowCalibration] = useState(false);
  
  const compassAnim = useRef(new Animated.Value(0)).current;
  const lastHeading = useRef(0);
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    initializeQibla();
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  // Smooth compass animation with interpolation for crossing 0/360
  useEffect(() => {
    let targetHeading = smoothedHeading + calibrationOffset;
    targetHeading = ((targetHeading % 360) + 360) % 360;
    
    // Handle the 360/0 crossing for smooth animation
    let currentAnim = lastHeading.current;
    let diff = targetHeading - currentAnim;
    
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    const newTarget = currentAnim + diff;
    lastHeading.current = newTarget;
    
    Animated.timing(compassAnim, {
      toValue: -newTarget,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [smoothedHeading, calibrationOffset]);

  // Low-pass filter for smooth heading
  const updateHeading = useCallback((newHeading: number) => {
    setHeading(newHeading);
    setSmoothedHeading(prev => {
      // Handle 360/0 boundary
      let diff = newHeading - prev;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return prev + ALPHA * diff;
    });
  }, []);

  // Calculate distance to Kaaba
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

  // Calculate Qibla direction
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
      setError(t.qibla.permissionRequired);
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

      if (Magnetometer) {
        startMagnetometer();
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Qibla init error:', err);
      setError(t.qibla.error);
      setLoading(false);
    }
  };

  const startMagnetometer = () => {
    if (!Magnetometer) return;
    
    Magnetometer.setUpdateInterval(60);
    
    const sub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
      // Calculate heading from magnetometer
      // Using atan2(-x, y) for correct North orientation on most Android devices
      let angle = Math.atan2(-data.x, data.y) * (180 / Math.PI);
      
      // Normalize to 0-360
      angle = ((angle % 360) + 360) % 360;
      
      updateHeading(angle);
    });
    
    setSubscription(sub);
  };

  const getCurrentHeading = () => {
    return ((smoothedHeading + calibrationOffset) % 360 + 360) % 360;
  };

  const getQiblaRelativeAngle = () => {
    if (qiblaDirection === null) return 0;
    return qiblaDirection - getCurrentHeading();
  };

  const isPointingToQibla = (): boolean => {
    if (qiblaDirection === null) return false;
    const diff = Math.abs(getQiblaRelativeAngle());
    const normalizedDiff = diff > 180 ? 360 - diff : diff;
    return normalizedDiff < 12;
  };

  const getDirectionText = (): string => {
    if (qiblaDirection === null) return '';
    const diff = getQiblaRelativeAngle();
    const normalizedDiff = ((diff % 360) + 360) % 360;
    
    if (normalizedDiff < 12 || normalizedDiff > 348) {
      return t.qibla.pointingToQibla;
    } else if (normalizedDiff <= 180) {
      return t.qibla.turnRight;
    } else {
      return t.qibla.turnLeft;
    }
  };

  const calibrate = () => {
    // Set current position as North (0°)
    setCalibrationOffset(-smoothedHeading);
    setShowCalibration(false);
  };

  const resetCalibration = () => {
    setCalibrationOffset(0);
  };

  const compassRotation = compassAnim.interpolate({
    inputRange: [-720, 0, 720],
    outputRange: ['-720deg', '0deg', '720deg'],
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

  const currentHeading = getCurrentHeading();
  const qiblaRelative = getQiblaRelativeAngle();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>{t.qibla.title}</Text>
          <Text style={styles.subtitle}>{t.qibla.subtitle}</Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={60} color="#E74C3C" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={initializeQibla}>
              <Text style={styles.retryText}>{t.qibla.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Current Heading Display */}
            <View style={styles.headingDisplay}>
              <Text style={styles.headingValue}>{currentHeading.toFixed(0)}°</Text>
              <Text style={styles.headingLabel}>Pusula Yönü</Text>
            </View>

            {/* Main Compass */}
            <View style={styles.compassContainer}>
              {/* Fixed frame */}
              <View style={styles.compassFrame}>
                {/* North indicator (fixed at top) */}
                <View style={styles.northMarker}>
                  <View style={styles.northTriangle} />
                </View>
                
                {/* Rotating compass dial */}
                <Animated.View
                  style={[
                    styles.compassDial,
                    { transform: [{ rotate: compassRotation }] },
                  ]}
                >
                  {/* Degree markers every 10 degrees */}
                  {[...Array(36)].map((_, i) => {
                    const degree = i * 10;
                    const isCardinal = degree % 90 === 0;
                    const isMajor = degree % 30 === 0;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.tickMark,
                          {
                            transform: [
                              { rotate: `${degree}deg` },
                              { translateY: -COMPASS_SIZE / 2 + 5 },
                            ],
                          },
                        ]}
                      >
                        <View style={[
                          styles.tick,
                          isCardinal && styles.tickCardinal,
                          isMajor && !isCardinal && styles.tickMajor,
                        ]} />
                        {isMajor && (
                          <Text style={[
                            styles.tickLabel,
                            isCardinal && styles.tickLabelCardinal,
                          ]}>
                            {degree === 0 ? 'N' : degree === 90 ? 'E' : degree === 180 ? 'S' : degree === 270 ? 'W' : degree}
                          </Text>
                        )}
                      </View>
                    );
                  })}

                  {/* Inner circle with Qibla arrow */}
                  <View style={styles.innerCircle}>
                    {/* Qibla direction arrow */}
                    <View
                      style={[
                        styles.qiblaArrowWrapper,
                        { transform: [{ rotate: `${qiblaDirection || 0}deg` }] },
                      ]}
                    >
                      <View style={[
                        styles.qiblaArrow,
                        isPointingToQibla() && styles.qiblaArrowActive,
                      ]}>
                        <Text style={[
                          styles.qiblaText,
                          isPointingToQibla() && styles.qiblaTextActive,
                        ]}>KIBLE</Text>
                        <Ionicons 
                          name="caret-up" 
                          size={36} 
                          color={isPointingToQibla() ? '#27AE60' : '#C9A227'} 
                        />
                      </View>
                    </View>

                    {/* Center Kaaba */}
                    <View style={[
                      styles.kaabaCenter,
                      isPointingToQibla() && styles.kaabaCenterActive,
                    ]}>
                      <Ionicons 
                        name="cube" 
                        size={30} 
                        color={isPointingToQibla() ? '#27AE60' : '#C9A227'} 
                      />
                    </View>
                  </View>
                </Animated.View>
              </View>
            </View>

            {/* Status */}
            <View style={[
              styles.statusBadge,
              isPointingToQibla() && styles.statusBadgeActive,
            ]}>
              <Ionicons
                name={isPointingToQibla() ? 'checkmark-circle' : 'compass'}
                size={22}
                color={isPointingToQibla() ? '#27AE60' : '#C9A227'}
              />
              <Text style={[
                styles.statusText,
                isPointingToQibla() && styles.statusTextActive,
              ]}>
                {getDirectionText()}
              </Text>
            </View>

            {/* Info Row */}
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>{qiblaDirection?.toFixed(1)}°</Text>
                <Text style={styles.infoLabel}>{t.qibla.direction}</Text>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>{distance?.toLocaleString()}</Text>
                <Text style={styles.infoLabel}>km Mesafe</Text>
              </View>
            </View>

            {/* Calibration Button */}
            <View style={styles.calibrationRow}>
              <TouchableOpacity 
                style={styles.calibrateButton} 
                onPress={() => setShowCalibration(!showCalibration)}
              >
                <Ionicons name="options" size={18} color="#8E8E93" />
                <Text style={styles.calibrateText}>Kalibrasyon</Text>
              </TouchableOpacity>
            </View>

            {showCalibration && (
              <View style={styles.calibrationPanel}>
                <Text style={styles.calibrationInfo}>
                  Pusula doğru göstermiyorsa, telefonunuzu kuzeye çevirin ve "Kuzeyi Ayarla" butonuna basın.
                </Text>
                <View style={styles.calibrationButtons}>
                  <TouchableOpacity style={styles.calibrationBtn} onPress={calibrate}>
                    <Text style={styles.calibrationBtnText}>Kuzeyi Ayarla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.calibrationBtnReset} onPress={resetCalibration}>
                    <Text style={styles.calibrationBtnResetText}>Sıfırla</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        )}
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
    paddingHorizontal: 20,
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
  header: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 15,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: '#C9A227',
    fontSize: 13,
    marginTop: 4,
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
  headingDisplay: {
    alignItems: 'center',
    marginBottom: 15,
  },
  headingValue: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '200',
  },
  headingLabel: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  compassContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassFrame: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  northMarker: {
    position: 'absolute',
    top: -5,
    zIndex: 10,
  },
  northTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 16,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#E74C3C',
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
  tickMark: {
    position: 'absolute',
    alignItems: 'center',
  },
  tick: {
    width: 1,
    height: 10,
    backgroundColor: '#3D3D5C',
  },
  tickMajor: {
    height: 15,
    width: 2,
    backgroundColor: '#5D5D7C',
  },
  tickCardinal: {
    height: 20,
    width: 3,
    backgroundColor: '#C9A227',
  },
  tickLabel: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
  tickLabelCardinal: {
    color: '#C9A227',
    fontSize: 14,
    fontWeight: '700',
  },
  innerCircle: {
    width: COMPASS_SIZE - 100,
    height: COMPASS_SIZE - 100,
    borderRadius: (COMPASS_SIZE - 100) / 2,
    backgroundColor: '#0A0A14',
    borderWidth: 1,
    borderColor: '#1E1E2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qiblaArrowWrapper: {
    position: 'absolute',
    width: COMPASS_SIZE - 100,
    height: COMPASS_SIZE - 100,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  qiblaArrow: {
    alignItems: 'center',
  },
  qiblaArrowActive: {
    transform: [{ scale: 1.1 }],
  },
  qiblaText: {
    color: '#C9A227',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: -8,
  },
  qiblaTextActive: {
    color: '#27AE60',
  },
  kaabaCenter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#12121E',
    borderWidth: 2,
    borderColor: '#C9A227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kaabaCenterActive: {
    borderColor: '#27AE60',
    backgroundColor: '#0D1A12',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121E',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    gap: 10,
  },
  statusBadgeActive: {
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121E',
    borderRadius: 16,
    marginTop: 20,
    paddingVertical: 16,
    paddingHorizontal: 30,
    borderWidth: 1,
    borderColor: '#1E1E2E',
  },
  infoItem: {
    alignItems: 'center',
    flex: 1,
  },
  infoDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#2D2D44',
    marginHorizontal: 20,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '600',
  },
  infoLabel: {
    color: '#8E8E93',
    fontSize: 11,
    marginTop: 4,
  },
  calibrationRow: {
    marginTop: 20,
  },
  calibrateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  calibrateText: {
    color: '#8E8E93',
    fontSize: 13,
  },
  calibrationPanel: {
    backgroundColor: '#12121E',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1E1E2E',
    width: '100%',
  },
  calibrationInfo: {
    color: '#8E8E93',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  calibrationButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  calibrationBtn: {
    backgroundColor: '#C9A227',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  calibrationBtnText: {
    color: '#0A0A14',
    fontSize: 13,
    fontWeight: '600',
  },
  calibrationBtnReset: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3D3D5C',
  },
  calibrationBtnResetText: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '600',
  },
});
