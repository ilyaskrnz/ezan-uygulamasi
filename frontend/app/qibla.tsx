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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

// Dynamic imports for native modules (not available on web)
let Location: any = null;
let Magnetometer: any = null;
if (Platform.OS !== 'web') {
  Location = require('expo-location');
  Magnetometer = require('expo-sensors').Magnetometer;
}

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function QiblaScreen() {
  const [heading, setHeading] = useState(0);
  const [qiblaDirection, setQiblaDirection] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    initializeQibla();
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  useEffect(() => {
    // Smooth rotation animation
    Animated.timing(rotationAnim, {
      toValue: heading,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [heading]);

  const initializeQibla = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get location permission and coordinates
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Konum izni gerekli');
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setLocation(coords);

      // Get Qibla direction from API
      const response = await axios.get(`${API_URL}/api/qibla`, {
        params: {
          latitude: coords.lat,
          longitude: coords.lng,
        },
      });

      if (response.data.success) {
        setQiblaDirection(response.data.data.direction);
      }

      // Start magnetometer
      startMagnetometer();
      
      setLoading(false);
    } catch (err) {
      console.error('Qibla init error:', err);
      setError('Kıble yönü hesaplanamadı');
      setLoading(false);
    }
  };

  const startMagnetometer = () => {
    Magnetometer.setUpdateInterval(100);
    
    const sub = Magnetometer.addListener((data) => {
      let angle = Math.atan2(data.y, data.x) * (180 / Math.PI);
      angle = (angle + 360) % 360;
      
      // Adjust for device orientation
      if (Platform.OS === 'ios') {
        angle = 360 - angle;
      }
      
      setHeading(angle);
      setCalibrating(false);
    });
    
    setSubscription(sub);
  };

  const getQiblaRotation = () => {
    if (qiblaDirection === null) return '0deg';
    const rotation = qiblaDirection - heading;
    return `${rotation}deg`;
  };

  const getCompassRotation = rotationAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '-360deg'],
  });

  const getDirectionText = () => {
    if (qiblaDirection === null) return '';
    const diff = ((qiblaDirection - heading) + 360) % 360;
    
    if (diff < 10 || diff > 350) {
      return 'Kıble yönündesiniz!';
    } else if (diff < 180) {
      return 'Sağa dönün';
    } else {
      return 'Sola dönün';
    }
  };

  const isPointingToQibla = () => {
    if (qiblaDirection === null) return false;
    const diff = Math.abs(((qiblaDirection - heading) + 360) % 360);
    return diff < 10 || diff > 350;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>Kıble yönü hesaplanıyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Kıble Pusulası</Text>
          <Text style={styles.subtitle}>Mekke, Suudi Arabistan</Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={48} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={initializeQibla}>
              <Text style={styles.retryText}>Tekrar Dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Compass Container */}
            <View style={styles.compassContainer}>
              {/* Outer ring */}
              <View style={styles.outerRing}>
                {/* Compass rose */}
                <Animated.View
                  style={[
                    styles.compassRose,
                    { transform: [{ rotate: getCompassRotation }] },
                  ]}
                >
                  {/* Cardinal directions */}
                  <View style={[styles.direction, styles.directionN]}>
                    <Text style={styles.directionText}>K</Text>
                  </View>
                  <View style={[styles.direction, styles.directionE]}>
                    <Text style={styles.directionTextSmall}>D</Text>
                  </View>
                  <View style={[styles.direction, styles.directionS]}>
                    <Text style={styles.directionTextSmall}>G</Text>
                  </View>
                  <View style={[styles.direction, styles.directionW]}>
                    <Text style={styles.directionTextSmall}>B</Text>
                  </View>

                  {/* Degree markers */}
                  {[...Array(72)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.degreeMark,
                        {
                          transform: [
                            { rotate: `${i * 5}deg` },
                            { translateY: -120 },
                          ],
                        },
                        i % 6 === 0 && styles.degreeMarkMajor,
                      ]}
                    />
                  ))}
                </Animated.View>

                {/* Qibla pointer */}
                <View
                  style={[
                    styles.qiblaPointer,
                    { transform: [{ rotate: getQiblaRotation() }] },
                  ]}
                >
                  <View style={styles.qiblaArrow}>
                    <Ionicons
                      name="navigate"
                      size={32}
                      color={isPointingToQibla() ? '#4CAF50' : '#D4AF37'}
                    />
                  </View>
                </View>

                {/* Center Kaaba icon */}
                <View style={styles.centerIcon}>
                  <View style={styles.kaabaIcon}>
                    <Ionicons name="cube" size={28} color="#1A1A2E" />
                  </View>
                </View>
              </View>
            </View>

            {/* Direction indicator */}
            <View style={[
              styles.directionIndicator,
              isPointingToQibla() && styles.directionIndicatorActive,
            ]}>
              <Ionicons
                name={isPointingToQibla() ? 'checkmark-circle' : 'navigate'}
                size={24}
                color={isPointingToQibla() ? '#4CAF50' : '#D4AF37'}
              />
              <Text style={[
                styles.directionIndicatorText,
                isPointingToQibla() && styles.directionIndicatorTextActive,
              ]}>
                {getDirectionText()}
              </Text>
            </View>

            {/* Info cards */}
            <View style={styles.infoContainer}>
              <View style={styles.infoCard}>
                <Ionicons name="compass-outline" size={24} color="#D4AF37" />
                <Text style={styles.infoLabel}>Kıble Açısı</Text>
                <Text style={styles.infoValue}>{qiblaDirection?.toFixed(1)}°</Text>
              </View>
              <View style={styles.infoCard}>
                <Ionicons name="navigate-outline" size={24} color="#D4AF37" />
                <Text style={styles.infoLabel}>Pusula</Text>
                <Text style={styles.infoValue}>{heading.toFixed(0)}°</Text>
              </View>
            </View>

            {/* Calibration hint */}
            {calibrating && (
              <View style={styles.calibrationHint}>
                <Ionicons name="sync" size={20} color="#8E8E93" />
                <Text style={styles.calibrationText}>
                  Pusulayı kalibre etmek için telefonunuzu 8 şeklinde hareket ettirin
                </Text>
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
  loadingText: {
    color: '#FFFFFF',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 30,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#D4AF37',
    fontSize: 16,
    marginTop: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 18,
    textAlign: 'center',
    marginTop: 16,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#D4AF37',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryText: {
    color: '#1A1A2E',
    fontSize: 16,
    fontWeight: '600',
  },
  compassContainer: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerRing: {
    width: 280,
    height: 280,
    borderRadius: 140,
    borderWidth: 3,
    borderColor: '#2D2D44',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
  },
  compassRose: {
    position: 'absolute',
    width: 260,
    height: 260,
    justifyContent: 'center',
    alignItems: 'center',
  },
  direction: {
    position: 'absolute',
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directionN: {
    top: 10,
  },
  directionE: {
    right: 10,
  },
  directionS: {
    bottom: 10,
  },
  directionW: {
    left: 10,
  },
  directionText: {
    color: '#D4AF37',
    fontSize: 20,
    fontWeight: 'bold',
  },
  directionTextSmall: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '600',
  },
  degreeMark: {
    position: 'absolute',
    width: 1,
    height: 8,
    backgroundColor: '#3D3D5C',
  },
  degreeMarkMajor: {
    height: 12,
    backgroundColor: '#5D5D7C',
  },
  qiblaPointer: {
    position: 'absolute',
    width: 260,
    height: 260,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  qiblaArrow: {
    marginTop: 20,
  },
  centerIcon: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kaabaIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  directionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 30,
    marginTop: 30,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  directionIndicatorActive: {
    backgroundColor: '#1A2E1A',
    borderColor: '#4CAF50',
  },
  directionIndicatorText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  directionIndicatorTextActive: {
    color: '#4CAF50',
  },
  infoContainer: {
    flexDirection: 'row',
    marginTop: 30,
    gap: 16,
  },
  infoCard: {
    backgroundColor: '#1A1A2E',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    minWidth: 120,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  infoLabel: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 8,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  calibrationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
    backgroundColor: '#2D2D44',
    borderRadius: 12,
  },
  calibrationText: {
    color: '#8E8E93',
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
});
