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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLanguage } from '../src/i18n/LanguageContext';

let Location: any = null;
let Magnetometer: any = null;

if (Platform.OS !== 'web') {
  Location = require('expo-location');
  const Sensors = require('expo-sensors');
  Magnetometer = Sensors.Magnetometer;
}

const { width, height } = Dimensions.get('window');
const COMPASS_SIZE = Math.min(width - 50, 320);

// Kabe koordinatları
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8264;

export default function QiblaScreen() {
  const { t } = useLanguage();
  const [magnetometer, setMagnetometer] = useState(0);
  const [qiblad, setQiblad] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [cityName, setCityName] = useState<string>('');
  
  const compassAnim = useRef(new Animated.Value(0)).current;
  const kaabaAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    initCompass();
    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // Pusula animasyonu
  useEffect(() => {
    const compassRotate = 360 - compassDegree;
    Animated.spring(compassAnim, {
      toValue: compassRotate,
      useNativeDriver: true,
      tension: 50,
      friction: 10,
    }).start();
  }, [magnetometer]);

  // Kabe animasyonu
  useEffect(() => {
    const kaabaRotate = 360 - compassDegree + qiblad;
    Animated.spring(kaabaAnim, {
      toValue: kaabaRotate,
      useNativeDriver: true,
      tension: 50,
      friction: 10,
    }).start();
  }, [magnetometer, qiblad]);

  // Kıble yönünde parlama efekti
  useEffect(() => {
    if (isPointingToQibla()) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.setValue(0);
    }
  }, [magnetometer, qiblad]);

  const angle = (data: { x: number; y: number; z: number }) => {
    let angle = 0;
    if (data) {
      let { x, y } = data;
      if (Math.atan2(y, x) >= 0) {
        angle = Math.atan2(y, x) * (180 / Math.PI);
      } else {
        angle = (Math.atan2(y, x) + 2 * Math.PI) * (180 / Math.PI);
      }
    }
    return Math.round(angle);
  };

  const degree = (magnetometer: number) => {
    return magnetometer - 90 >= 0 ? magnetometer - 90 : magnetometer + 271;
  };

  const calculateQibla = (latitude: number, longitude: number) => {
    const PI = Math.PI;
    let latk = (KAABA_LAT * PI) / 180.0;
    let longk = (KAABA_LNG * PI) / 180.0;
    let phi = (latitude * PI) / 180.0;
    let lambda = (longitude * PI) / 180.0;
    let qiblad =
      (180.0 / PI) *
      Math.atan2(
        Math.sin(longk - lambda),
        Math.cos(phi) * Math.tan(latk) -
          Math.sin(phi) * Math.cos(longk - lambda)
      );
    setQiblad(qiblad);
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

  const initCompass = async () => {
    if (Platform.OS === 'web') {
      setError('Bu özellik sadece mobil cihazlarda çalışır');
      setLoading(false);
      return;
    }

    try {
      if (!Magnetometer) {
        setError('Pusula bu cihazda kullanılamıyor');
        setLoading(false);
        return;
      }

      const isAvailable = await Magnetometer.isAvailableAsync();
      if (!isAvailable) {
        setError('Pusula bu cihazda kullanılamıyor');
        setLoading(false);
        return;
      }

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

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      
      // Şehir adını al
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (address) {
          setCityName(address.city || address.district || address.region || '');
        }
      } catch (e) {}
      
      calculateQibla(latitude, longitude);
      setDistance(Math.round(calculateDistance(latitude, longitude, KAABA_LAT, KAABA_LNG)));
      
      Magnetometer.setUpdateInterval(100);
      const sub = Magnetometer.addListener((data: { x: number; y: number; z: number }) => {
        setMagnetometer(angle(data));
      });
      setSubscription(sub);
      
      setLoading(false);
    } catch (err) {
      setError(t.qibla.error);
      setLoading(false);
    }
  };

  const compassDegree = degree(magnetometer);
  
  const getDirectionName = (deg: number) => {
    if (deg >= 337.5 || deg < 22.5) return 'K';
    if (deg >= 22.5 && deg < 67.5) return 'KD';
    if (deg >= 67.5 && deg < 112.5) return 'D';
    if (deg >= 112.5 && deg < 157.5) return 'GD';
    if (deg >= 157.5 && deg < 202.5) return 'G';
    if (deg >= 202.5 && deg < 247.5) return 'GB';
    if (deg >= 247.5 && deg < 292.5) return 'B';
    return 'KB';
  };

  const isPointingToQibla = (): boolean => {
    const qiblaAngle = ((qiblad % 360) + 360) % 360;
    return compassDegree >= Math.round(qiblaAngle - 8) && compassDegree <= Math.round(qiblaAngle + 8);
  };

  const getDirectionText = (): string => {
    const qiblaAngle = ((qiblad % 360) + 360) % 360;
    const diff = ((qiblaAngle - compassDegree + 540) % 360) - 180;
    
    if (Math.abs(diff) <= 8) return 'Kıble Yönündesiniz';
    if (diff > 0) return `Sağa ${Math.abs(Math.round(diff))}° dönün`;
    return `Sola ${Math.abs(Math.round(diff))}° dönün`;
  };

  const compassRotation = compassAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  const kaabaRotation = kaabaAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  if (loading) {
    return (
      <LinearGradient colors={['#0a1628', '#1a2d4a', '#0a1628']} style={styles.container}>
        <SafeAreaView style={styles.centerContent}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#c9a227" />
            <Text style={styles.loadingText}>{t.qibla.loading}</Text>
            <Text style={styles.loadingSubText}>Konum alınıyor...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (error) {
    return (
      <LinearGradient colors={['#0a1628', '#1a2d4a', '#0a1628']} style={styles.container}>
        <SafeAreaView style={styles.centerContent}>
          <Ionicons name="warning" size={70} color="#e74c3c" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={initCompass}>
            <Text style={styles.retryBtnText}>{t.qibla.retry}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const qiblaAngleDisplay = ((qiblad % 360) + 360) % 360;
  const pointing = isPointingToQibla();

  return (
    <LinearGradient colors={['#0a1628', '#1a2d4a', '#0a1628']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>🕌 Kıble Pusulası</Text>
          {cityName ? <Text style={styles.cityText}>{cityName}</Text> : null}
        </View>

        {/* Derece Göstergesi */}
        <View style={styles.degreeBox}>
          <Text style={styles.directionLabel}>{getDirectionName(compassDegree)}</Text>
          <Text style={[styles.degreeText, pointing && styles.degreeTextActive]}>
            {compassDegree}°
          </Text>
        </View>

        {/* Ana Pusula Alanı */}
        <View style={styles.compassWrapper}>
          {/* Dış Halka */}
          <View style={styles.outerRing}>
            {/* Üst Kırmızı İşaretçi */}
            <View style={styles.topMarker}>
              <View style={styles.markerArrow} />
            </View>

            {/* Dönen Pusula Kadranı */}
            <Animated.View style={[styles.compassDial, { transform: [{ rotate: compassRotation }] }]}>
              {/* Derece çizgileri */}
              {[...Array(72)].map((_, i) => {
                const deg = i * 5;
                const isMain = deg % 90 === 0;
                const isMid = deg % 30 === 0 && !isMain;
                return (
                  <View
                    key={i}
                    style={[
                      styles.tickMark,
                      { transform: [{ rotate: `${deg}deg` }] },
                    ]}
                  >
                    <View style={[
                      styles.tick,
                      isMain && styles.tickMain,
                      isMid && styles.tickMid,
                    ]} />
                  </View>
                );
              })}

              {/* Yön harfleri */}
              <View style={[styles.cardinalWrapper, styles.cardinalN]}>
                <Text style={[styles.cardinalText, styles.cardinalTextN]}>N</Text>
              </View>
              <View style={[styles.cardinalWrapper, styles.cardinalE]}>
                <Text style={styles.cardinalText}>E</Text>
              </View>
              <View style={[styles.cardinalWrapper, styles.cardinalS]}>
                <Text style={styles.cardinalText}>S</Text>
              </View>
              <View style={[styles.cardinalWrapper, styles.cardinalW]}>
                <Text style={styles.cardinalText}>W</Text>
              </View>
              
              {/* İç dekoratif daire */}
              <View style={styles.innerDecoCircle} />
            </Animated.View>

            {/* Kabe İşaretçisi (Ayrı döner) */}
            <Animated.View style={[styles.kaabaWrapper, { transform: [{ rotate: kaabaRotation }] }]}>
              <View style={styles.kaabaPointerContainer}>
                <View style={[styles.kaabaLine, pointing && styles.kaabaLineActive]} />
                <View style={[styles.kaabaIconCircle, pointing && styles.kaabaIconCircleActive]}>
                  <Text style={styles.kaabaEmoji}>🕋</Text>
                </View>
              </View>
            </Animated.View>

            {/* Merkez */}
            <View style={[styles.centerHub, pointing && styles.centerHubActive]}>
              <View style={[styles.centerInner, pointing && styles.centerInnerActive]}>
                <Ionicons 
                  name="locate" 
                  size={26} 
                  color={pointing ? '#2ecc71' : '#c9a227'} 
                />
              </View>
            </View>
          </View>
        </View>

        {/* Durum Çubuğu */}
        <View style={[styles.statusCard, pointing && styles.statusCardActive]}>
          {pointing && <Ionicons name="checkmark-circle" size={24} color="#2ecc71" style={{ marginRight: 8 }} />}
          <Text style={[styles.statusText, pointing && styles.statusTextActive]}>
            {getDirectionText()}
          </Text>
        </View>

        {/* Bilgi Kartları */}
        <View style={styles.infoRow}>
          <View style={styles.infoCard}>
            <Ionicons name="compass-outline" size={22} color="#c9a227" />
            <Text style={styles.infoValue}>{qiblaAngleDisplay.toFixed(0)}°</Text>
            <Text style={styles.infoLabel}>Kıble Açısı</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="location-outline" size={22} color="#c9a227" />
            <Text style={styles.infoValue}>{distance?.toLocaleString()}</Text>
            <Text style={styles.infoLabel}>km uzaklık</Text>
          </View>
        </View>

        {/* Alt İpucu */}
        <View style={styles.hintBar}>
          <Ionicons name="sync" size={16} color="#7f8c8d" />
          <Text style={styles.hintText}>Kalibre için telefonu 8 şeklinde çevirin</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  loadingBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 40,
    borderRadius: 20,
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 20,
    fontWeight: '600',
  },
  loadingSubText: {
    color: '#7f8c8d',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 20,
    paddingHorizontal: 20,
  },
  retryBtn: {
    backgroundColor: '#c9a227',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  retryBtnText: {
    color: '#0a1628',
    fontSize: 16,
    fontWeight: '700',
  },

  header: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 5,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  cityText: {
    color: '#7f8c8d',
    fontSize: 14,
    marginTop: 4,
  },

  degreeBox: {
    alignItems: 'center',
    marginBottom: 10,
  },
  directionLabel: {
    color: '#c9a227',
    fontSize: 16,
    fontWeight: '600',
  },
  degreeText: {
    color: '#fff',
    fontSize: 44,
    fontWeight: '200',
  },
  degreeTextActive: {
    color: '#2ecc71',
  },

  compassWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },

  outerRing: {
    width: COMPASS_SIZE + 30,
    height: COMPASS_SIZE + 30,
    borderRadius: (COMPASS_SIZE + 30) / 2,
    backgroundColor: 'rgba(201, 162, 39, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(201, 162, 39, 0.3)',
  },

  topMarker: {
    position: 'absolute',
    top: -5,
    zIndex: 100,
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderBottomWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#e74c3c',
  },

  compassDial: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: '#0d1f35',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#1e3a5f',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },

  tickMark: {
    position: 'absolute',
    width: 2,
    height: COMPASS_SIZE / 2,
    alignItems: 'center',
  },
  tick: {
    width: 2,
    height: 10,
    backgroundColor: '#2c4a6e',
    marginTop: 8,
  },
  tickMain: {
    width: 3,
    height: 20,
    backgroundColor: '#c9a227',
  },
  tickMid: {
    width: 2,
    height: 15,
    backgroundColor: '#4a6a8e',
  },

  cardinalWrapper: {
    position: 'absolute',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardinalN: { top: 32 },
  cardinalE: { right: 32 },
  cardinalS: { bottom: 32 },
  cardinalW: { left: 32 },
  cardinalText: {
    color: '#c9a227',
    fontSize: 20,
    fontWeight: '700',
  },
  cardinalTextN: {
    color: '#e74c3c',
  },

  innerDecoCircle: {
    position: 'absolute',
    width: COMPASS_SIZE - 100,
    height: COMPASS_SIZE - 100,
    borderRadius: (COMPASS_SIZE - 100) / 2,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.2)',
  },

  kaabaWrapper: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
  },
  kaabaPointerContainer: {
    alignItems: 'center',
    paddingTop: 15,
  },
  kaabaLine: {
    width: 4,
    height: 50,
    backgroundColor: '#c9a227',
    borderRadius: 2,
  },
  kaabaLineActive: {
    backgroundColor: '#2ecc71',
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  kaabaIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1a3a5c',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#c9a227',
    marginTop: -5,
  },
  kaabaIconCircleActive: {
    borderColor: '#2ecc71',
    backgroundColor: '#0d2818',
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
  },
  kaabaEmoji: {
    fontSize: 26,
  },

  centerHub: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#0d1f35',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#c9a227',
  },
  centerHubActive: {
    borderColor: '#2ecc71',
  },
  centerInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1a3a5c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerInnerActive: {
    backgroundColor: '#0d2818',
  },

  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 15,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.3)',
  },
  statusCardActive: {
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    borderColor: '#2ecc71',
  },
  statusText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  statusTextActive: {
    color: '#2ecc71',
  },

  infoRow: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
    paddingHorizontal: 20,
  },
  infoCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 39, 0.2)',
  },
  infoValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
  },
  infoLabel: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 2,
  },

  hintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  hintText: {
    color: '#7f8c8d',
    fontSize: 13,
  },
});
