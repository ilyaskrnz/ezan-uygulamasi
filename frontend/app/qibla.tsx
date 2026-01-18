import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Platform,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useLanguage } from '../src/i18n/LanguageContext';

// Dynamic imports for native modules
let Location: any = null;
let Magnetometer: any = null;
if (Platform.OS !== 'web') {
  Location = require('expo-location');
  Magnetometer = require('expo-sensors').Magnetometer;
}

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width } = Dimensions.get('window');
const COMPASS_SIZE = width * 0.75;

// Kaaba coordinates
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

export default function QiblaScreen() {
  const { t } = useLanguage();
  const [heading, setHeading] = useState(0);
  const [qiblaDirection, setQiblaDirection] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number>(0);
  const compassAnim = useRef(new Animated.Value(0)).current;
  const qiblaAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    initializeQibla();
    startPulseAnimation();
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  // Smooth compass animation
  useEffect(() => {
    Animated.timing(compassAnim, {
      toValue: -heading,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [heading]);

  // Qibla pointer animation
  useEffect(() => {
    if (qiblaDirection !== null) {
      const qiblaAngle = qiblaDirection - heading;
      Animated.timing(qiblaAnim, {
        toValue: qiblaAngle,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [heading, qiblaDirection]);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  // Calculate distance to Kaaba
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Calculate Qibla direction locally for accuracy
  const calculateQiblaDirection = (lat: number, lng: number): number => {
    const latRad = lat * Math.PI / 180;
    const lngRad = lng * Math.PI / 180;
    const kaabaLatRad = KAABA_LAT * Math.PI / 180;
    const kaabaLngRad = KAABA_LNG * Math.PI / 180;
    
    const y = Math.sin(kaabaLngRad - lngRad);
    const x = Math.cos(latRad) * Math.tan(kaabaLatRad) - 
              Math.sin(latRad) * Math.cos(kaabaLngRad - lngRad);
    
    let qibla = Math.atan2(y, x) * 180 / Math.PI;
    qibla = (qibla + 360) % 360;
    
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

      // Get location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t.qibla.permissionRequired);
        setLoading(false);
        return;
      }

      // Get current location
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setLocation(coords);
      setAccuracy(loc.coords.accuracy || 0);

      // Calculate Qibla direction locally
      const qibla = calculateQiblaDirection(coords.lat, coords.lng);
      setQiblaDirection(qibla);

      // Calculate distance to Kaaba
      const dist = calculateDistance(coords.lat, coords.lng, KAABA_LAT, KAABA_LNG);
      setDistance(Math.round(dist));

      // Start magnetometer
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
    
    Magnetometer.setUpdateInterval(50);
    
    const sub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
      let angle: number;
      
      if (Platform.OS === 'android') {
        // Android: x points East, y points North
        // We need to calculate the angle from North
        angle = Math.atan2(data.x, data.y) * (180 / Math.PI);
        angle = (angle + 360) % 360;
      } else {
        // iOS: different coordinate system
        angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
        angle = (360 - angle + 90) % 360;
      }
      
      setHeading(angle);
    });
    
    setSubscription(sub);
  };

  const isPointingToQibla = (): boolean => {
    if (qiblaDirection === null) return false;
    const diff = Math.abs(((qiblaDirection - heading) + 360) % 360);
    return diff < 15 || diff > 345;
  };

  const getDirectionText = (): string => {
    if (qiblaDirection === null) return '';
    const diff = ((qiblaDirection - heading) + 360) % 360;
    
    if (diff < 15 || diff > 345) {
      return t.qibla.pointingToQibla;
    } else if (diff < 180) {
      return t.qibla.turnRight;
    } else {
      return t.qibla.turnLeft;
    }
  };

  const compassRotation = compassAnim.interpolate({
    inputRange: [-360, 0, 360],
    outputRange: ['-360deg', '0deg', '360deg'],
  });

  const qiblaRotation = qiblaAnim.interpolate({
    inputRange: [-360, 0, 360],
    outputRange: ['-360deg', '0deg', '360deg'],
  });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingCircle}>
            <Ionicons name="compass" size={48} color="#D4AF37" />
          </View>
          <Text style={styles.loadingText}>{t.qibla.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="moon" size={24} color="#D4AF37" />
          </View>
          <Text style={styles.title}>{t.qibla.title}</Text>
          <Text style={styles.subtitle}>{t.qibla.subtitle}</Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <View style={styles.errorIcon}>
              <Ionicons name="alert-circle" size={64} color="#FF6B6B" />
            </View>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={initializeQibla}>
              <Ionicons name="refresh" size={20} color="#1A1A2E" />
              <Text style={styles.retryText}>{t.qibla.retry}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Main Compass */}
            <View style={styles.compassWrapper}>
              {/* Outer decorative ring */}
              <View style={styles.outerRing}>
                {/* Compass rose with degrees */}
                <Animated.View
                  style={[
                    styles.compassRose,
                    { transform: [{ rotate: compassRotation }] },
                  ]}
                >
                  {/* Degree markers */}
                  {[...Array(72)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.degreeMark,
                        {
                          transform: [
                            { rotate: `${i * 5}deg` },
                            { translateY: -COMPASS_SIZE / 2 + 15 },
                          ],
                        },
                        i % 6 === 0 && styles.degreeMarkMajor,
                        i % 18 === 0 && styles.degreeMarkCardinal,
                      ]}
                    />
                  ))}
                  
                  {/* Cardinal directions */}
                  <View style={[styles.cardinalDirection, styles.cardinalN]}>
                    <Text style={styles.cardinalText}>N</Text>
                  </View>
                  <View style={[styles.cardinalDirection, styles.cardinalE]}>
                    <Text style={styles.cardinalTextSmall}>E</Text>
                  </View>
                  <View style={[styles.cardinalDirection, styles.cardinalS]}>
                    <Text style={styles.cardinalTextSmall}>S</Text>
                  </View>
                  <View style={[styles.cardinalDirection, styles.cardinalW]}>
                    <Text style={styles.cardinalTextSmall}>W</Text>
                  </View>
                </Animated.View>

                {/* Inner circle with gradient effect */}
                <View style={styles.innerCircle}>
                  {/* Qibla direction pointer */}
                  <Animated.View
                    style={[
                      styles.qiblaPointer,
                      { transform: [{ rotate: qiblaRotation }] },
                    ]}
                  >
                    <View style={styles.qiblaArrowContainer}>
                      <View style={[
                        styles.qiblaArrow,
                        isPointingToQibla() && styles.qiblaArrowActive,
                      ]}>
                        <Ionicons 
                          name="caret-up" 
                          size={40} 
                          color={isPointingToQibla() ? '#4CAF50' : '#D4AF37'} 
                        />
                      </View>
                      <Text style={[
                        styles.qiblaLabel,
                        isPointingToQibla() && styles.qiblaLabelActive,
                      ]}>
                        QIBLA
                      </Text>
                    </View>
                  </Animated.View>

                  {/* Center Kaaba icon */}
                  <Animated.View style={[
                    styles.centerKaaba,
                    isPointingToQibla() && { transform: [{ scale: pulseAnim }] },
                  ]}>
                    <View style={[
                      styles.kaabaIcon,
                      isPointingToQibla() && styles.kaabaIconActive,
                    ]}>
                      <View style={styles.kaabaInner}>
                        <Ionicons name="cube" size={32} color="#D4AF37" />
                      </View>
                    </View>
                  </Animated.View>
                </View>

                {/* Fixed north indicator at top */}
                <View style={styles.northIndicator}>
                  <Ionicons name="triangle" size={16} color="#FF5722" />
                </View>
              </View>
            </View>

            {/* Direction Status */}
            <View style={[
              styles.statusCard,
              isPointingToQibla() && styles.statusCardActive,
            ]}>
              <Ionicons
                name={isPointingToQibla() ? 'checkmark-circle' : 'navigate'}
                size={28}
                color={isPointingToQibla() ? '#4CAF50' : '#D4AF37'}
              />
              <Text style={[
                styles.statusText,
                isPointingToQibla() && styles.statusTextActive,
              ]}>
                {getDirectionText()}
              </Text>
            </View>

            {/* Info Cards */}
            <View style={styles.infoRow}>
              <View style={styles.infoCard}>
                <Ionicons name="compass-outline" size={22} color="#D4AF37" />
                <Text style={styles.infoLabel}>{t.qibla.direction}</Text>
                <Text style={styles.infoValue}>{qiblaDirection?.toFixed(1)}°</Text>
              </View>
              
              <View style={styles.infoCard}>
                <Ionicons name="navigate-outline" size={22} color="#D4AF37" />
                <Text style={styles.infoLabel}>{t.qibla.compass}</Text>
                <Text style={styles.infoValue}>{heading.toFixed(0)}°</Text>
              </View>
              
              <View style={styles.infoCard}>
                <Ionicons name="location-outline" size={22} color="#D4AF37" />
                <Text style={styles.infoLabel}>Mesafe</Text>
                <Text style={styles.infoValue}>{distance?.toLocaleString()} km</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
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
  loadingCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 20,
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  headerIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#D4AF37',
    fontSize: 14,
    marginTop: 4,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    marginBottom: 20,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D4AF37',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  retryText: {
    color: '#1A1A2E',
    fontSize: 16,
    fontWeight: '600',
  },
  compassWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  outerRing: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#2D2D44',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  compassRose: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  degreeMark: {
    position: 'absolute',
    width: 2,
    height: 8,
    backgroundColor: '#3D3D5C',
    borderRadius: 1,
  },
  degreeMarkMajor: {
    height: 12,
    width: 2,
    backgroundColor: '#5D5D7C',
  },
  degreeMarkCardinal: {
    height: 16,
    width: 3,
    backgroundColor: '#D4AF37',
  },
  cardinalDirection: {
    position: 'absolute',
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardinalN: {
    top: 25,
  },
  cardinalE: {
    right: 25,
  },
  cardinalS: {
    bottom: 25,
  },
  cardinalW: {
    left: 25,
  },
  cardinalText: {
    color: '#FF5722',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardinalTextSmall: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  innerCircle: {
    width: COMPASS_SIZE - 80,
    height: COMPASS_SIZE - 80,
    borderRadius: (COMPASS_SIZE - 80) / 2,
    backgroundColor: '#0F0F1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2D2D44',
  },
  qiblaPointer: {
    position: 'absolute',
    width: COMPASS_SIZE - 80,
    height: COMPASS_SIZE - 80,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  qiblaArrowContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  qiblaArrow: {
    alignItems: 'center',
  },
  qiblaArrowActive: {
    transform: [{ scale: 1.1 }],
  },
  qiblaLabel: {
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: -5,
  },
  qiblaLabelActive: {
    color: '#4CAF50',
  },
  centerKaaba: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kaabaIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  kaabaIconActive: {
    borderColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  kaabaInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#0F0F1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  northIndicator: {
    position: 'absolute',
    top: -8,
    alignItems: 'center',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#2D2D44',
    gap: 12,
  },
  statusCardActive: {
    backgroundColor: '#1A2E1A',
    borderColor: '#4CAF50',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#4CAF50',
  },
  infoRow: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  infoLabel: {
    color: '#8E8E93',
    fontSize: 10,
    marginTop: 6,
    textAlign: 'center',
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
});
