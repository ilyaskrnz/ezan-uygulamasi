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

const { width } = Dimensions.get('window');
const COMPASS_SIZE = Math.min(width - 60, 300);

// Kabe koordinatları
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8264;

// Manyetik sapma hesaplama (basitleştirilmiş WMM modeli)
const calculateMagneticDeclination = (lat: number, lon: number): number => {
  // Türkiye ve çevresi için yaklaşık manyetik sapma
  // WMM 2020-2025 modeline göre basitleştirilmiş
  // Türkiye: yaklaşık +4° ile +6° arası
  const baseDeclination = 5.5; // Türkiye ortalaması
  
  // Boylama göre küçük düzeltme
  const lonCorrection = (lon - 35) * 0.1; // Türkiye'nin ortası ~35° boylam
  
  // Enleme göre küçük düzeltme  
  const latCorrection = (lat - 39) * 0.05; // Türkiye'nin ortası ~39° enlem
  
  return baseDeclination + lonCorrection + latCorrection;
};

export default function QiblaScreen() {
  const { t } = useLanguage();
  const [magnetometer, setMagnetometer] = useState(0);
  const [qiblad, setQiblad] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const [cityName, setCityName] = useState<string>('');
  const [declination, setDeclination] = useState(0);
  
  const compassAnim = useRef(new Animated.Value(0)).current;
  const kaabaAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    initCompass();
    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // Pusula animasyonu
  useEffect(() => {
    const correctedDegree = (compassDegree + declination + 360) % 360;
    const compassRotate = 360 - correctedDegree;
    Animated.spring(compassAnim, {
      toValue: compassRotate,
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start();
  }, [magnetometer, declination]);

  // Kabe animasyonu
  useEffect(() => {
    const correctedDegree = (compassDegree + declination + 360) % 360;
    const kaabaRotate = 360 - correctedDegree + qiblad;
    Animated.spring(kaabaAnim, {
      toValue: kaabaRotate,
      useNativeDriver: true,
      tension: 40,
      friction: 8,
    }).start();
  }, [magnetometer, qiblad, declination]);

  // Kıble yönünde nabız efekti
  useEffect(() => {
    if (isPointingToQibla()) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
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
      
      // Manyetik sapma hesapla
      const decl = calculateMagneticDeclination(latitude, longitude);
      setDeclination(decl);
      
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
  const correctedCompassDegree = Math.round((compassDegree + declination + 360) % 360);
  
  const isPointingToQibla = (): boolean => {
    const qiblaAngle = ((qiblad % 360) + 360) % 360;
    return correctedCompassDegree >= Math.round(qiblaAngle - 5) && correctedCompassDegree <= Math.round(qiblaAngle + 5);
  };

  const getDirectionText = (): string => {
    const qiblaAngle = ((qiblad % 360) + 360) % 360;
    const diff = ((qiblaAngle - correctedCompassDegree + 540) % 360) - 180;
    
    if (Math.abs(diff) <= 5) return 'Kıbleye Yöneldiniz';
    if (diff > 0) return `${Math.abs(Math.round(diff))}° sağa dönün`;
    return `${Math.abs(Math.round(diff))}° sola dönün`;
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
      <View style={styles.container}>
        <SafeAreaView style={styles.loadingContainer}>
          <View style={styles.loadingCircle}>
            <ActivityIndicator size="large" color="#00BFA6" />
          </View>
          <Text style={styles.loadingText}>Konum belirleniyor...</Text>
        </SafeAreaView>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.loadingContainer}>
          <Ionicons name="location-outline" size={60} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={initCompass}>
            <Text style={styles.retryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const qiblaAngleDisplay = ((qiblad % 360) + 360) % 360;
  const pointing = isPointingToQibla();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Başlık */}
        <View style={styles.header}>
          <Text style={styles.title}>Kıble Yönü</Text>
          {cityName ? (
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color="#00BFA6" />
              <Text style={styles.cityText}>{cityName}</Text>
            </View>
          ) : null}
        </View>

        {/* Büyük Derece */}
        <View style={styles.degreeContainer}>
          <Text style={[styles.bigDegree, pointing && styles.bigDegreeActive]}>
            {correctedCompassDegree}°
          </Text>
        </View>

        {/* Pusula */}
        <View style={styles.compassArea}>
          {/* Ana dış çerçeve */}
          <View style={styles.compassFrame}>
            {/* Üstte sabit kırmızı üçgen */}
            <View style={styles.fixedPointer}>
              <View style={styles.pointerArrow} />
            </View>

            {/* Dönen pusula diski */}
            <Animated.View style={[styles.compassDisc, { transform: [{ rotate: compassRotation }] }]}>
              {/* Dış halka - ana yönler */}
              <View style={styles.outerRing}>
                {/* Derece çizgileri */}
                {[...Array(72)].map((_, i) => {
                  const deg = i * 5;
                  const isCardinal = deg % 90 === 0;
                  const is30 = deg % 30 === 0 && !isCardinal;
                  return (
                    <View key={i} style={[styles.tickContainer, { transform: [{ rotate: `${deg}deg` }] }]}>
                      <View style={[
                        styles.tickLine,
                        isCardinal && styles.tickCardinal,
                        is30 && styles.tick30,
                      ]} />
                    </View>
                  );
                })}

                {/* Yön harfleri */}
                <Text style={[styles.dirLabel, styles.dirN]}>N</Text>
                <Text style={[styles.dirLabel, styles.dirE]}>E</Text>
                <Text style={[styles.dirLabel, styles.dirS]}>S</Text>
                <Text style={[styles.dirLabel, styles.dirW]}>W</Text>

                {/* Derece sayıları */}
                <Text style={[styles.degNum, styles.deg30p]}>30</Text>
                <Text style={[styles.degNum, styles.deg60p]}>60</Text>
                <Text style={[styles.degNum, styles.deg120p]}>120</Text>
                <Text style={[styles.degNum, styles.deg150p]}>150</Text>
                <Text style={[styles.degNum, styles.deg210p]}>210</Text>
                <Text style={[styles.degNum, styles.deg240p]}>240</Text>
                <Text style={[styles.degNum, styles.deg300p]}>300</Text>
                <Text style={[styles.degNum, styles.deg330p]}>330</Text>
              </View>

              {/* İç dekoratif çember */}
              <View style={styles.innerDecor} />
            </Animated.View>

            {/* Kabe işaretçisi - ayrı döner */}
            <Animated.View style={[styles.kaabaLayer, { transform: [{ rotate: kaabaRotation }] }]}>
              <View style={styles.kaabaArm}>
                <LinearGradient
                  colors={pointing ? ['#00BFA6', '#00BFA6'] : ['#FFD700', '#FFA500']}
                  style={styles.kaabaLine}
                />
                <Animated.View style={[
                  styles.kaabaCircle, 
                  pointing && styles.kaabaCircleActive,
                  { transform: [{ scale: pulseAnim }] }
                ]}>
                  <Text style={styles.kaabaIcon}>🕋</Text>
                </Animated.View>
              </View>
            </Animated.View>

            {/* Merkez noktası */}
            <View style={[styles.centerDot, pointing && styles.centerDotActive]} />
          </View>
        </View>

        {/* Durum kartı */}
        <View style={[styles.statusCard, pointing && styles.statusCardActive]}>
          <View style={styles.statusInner}>
            {pointing ? (
              <Ionicons name="checkmark-circle" size={28} color="#00BFA6" />
            ) : (
              <Ionicons name="compass-outline" size={28} color="#FFD700" />
            )}
            <Text style={[styles.statusText, pointing && styles.statusTextActive]}>
              {getDirectionText()}
            </Text>
          </View>
        </View>

        {/* Alt bilgi kartları */}
        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <Ionicons name="navigate-circle-outline" size={24} color="#00BFA6" />
            <Text style={styles.infoValue}>{qiblaAngleDisplay.toFixed(0)}°</Text>
            <Text style={styles.infoLabel}>Kıble Açısı</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoBox}>
            <Ionicons name="airplane-outline" size={24} color="#00BFA6" />
            <Text style={styles.infoValue}>{distance?.toLocaleString()}</Text>
            <Text style={styles.infoLabel}>km mesafe</Text>
          </View>
        </View>

        {/* Alt ipucu */}
        <View style={styles.tipRow}>
          <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
          <Text style={styles.tipText}>Kalibrasyon: Telefonu 8 şeklinde çevirin</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  safeArea: {
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,191,166,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 30,
    paddingHorizontal: 40,
  },
  retryBtn: {
    backgroundColor: '#00BFA6',
    paddingHorizontal: 30,
    paddingVertical: 12,
    borderRadius: 25,
  },
  retryBtnText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: '600',
  },

  header: {
    alignItems: 'center',
    marginTop: 10,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  cityText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },

  degreeContainer: {
    marginTop: 15,
    marginBottom: 10,
  },
  bigDegree: {
    color: '#fff',
    fontSize: 52,
    fontWeight: '200',
  },
  bigDegreeActive: {
    color: '#00BFA6',
  },

  compassArea: {
    marginVertical: 15,
  },
  compassFrame: {
    width: COMPASS_SIZE + 40,
    height: COMPASS_SIZE + 40,
    borderRadius: (COMPASS_SIZE + 40) / 2,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#2A2A2A',
  },

  fixedPointer: {
    position: 'absolute',
    top: 5,
    zIndex: 50,
  },
  pointerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 22,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FF4757',
  },

  compassDisc: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  outerRing: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tickContainer: {
    position: 'absolute',
    width: 3,
    height: COMPASS_SIZE / 2,
    alignItems: 'center',
  },
  tickLine: {
    width: 1,
    height: 8,
    backgroundColor: '#3A3A3A',
    marginTop: 12,
  },
  tickCardinal: {
    width: 3,
    height: 16,
    backgroundColor: '#FFD700',
  },
  tick30: {
    width: 2,
    height: 12,
    backgroundColor: '#4A4A4A',
  },

  dirLabel: {
    position: 'absolute',
    fontSize: 18,
    fontWeight: '700',
  },
  dirN: { top: 35, color: '#FF4757' },
  dirE: { right: 35, color: '#FFD700' },
  dirS: { bottom: 35, color: '#FFD700' },
  dirW: { left: 35, color: '#FFD700' },

  degNum: {
    position: 'absolute',
    fontSize: 10,
    color: 'rgba(255,255,255,0.3)',
  },
  deg30p: { top: 42, right: 58 },
  deg60p: { top: 58, right: 42 },
  deg120p: { bottom: 58, right: 42 },
  deg150p: { bottom: 42, right: 58 },
  deg210p: { bottom: 42, left: 58 },
  deg240p: { bottom: 58, left: 42 },
  deg300p: { top: 58, left: 42 },
  deg330p: { top: 42, left: 58 },

  innerDecor: {
    position: 'absolute',
    width: COMPASS_SIZE - 90,
    height: COMPASS_SIZE - 90,
    borderRadius: (COMPASS_SIZE - 90) / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.15)',
  },

  kaabaLayer: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
  },
  kaabaArm: {
    alignItems: 'center',
    paddingTop: 20,
  },
  kaabaLine: {
    width: 4,
    height: 45,
    borderRadius: 2,
  },
  kaabaCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  kaabaCircleActive: {
    borderColor: '#00BFA6',
    backgroundColor: '#0D3D35',
  },
  kaabaIcon: {
    fontSize: 24,
  },

  centerDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFD700',
  },
  centerDotActive: {
    backgroundColor: '#00BFA6',
  },

  statusCard: {
    width: '100%',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  statusCardActive: {
    backgroundColor: 'rgba(0,191,166,0.1)',
    borderColor: '#00BFA6',
  },
  statusInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  statusTextActive: {
    color: '#00BFA6',
  },

  infoSection: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginTop: 15,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  infoBox: {
    flex: 1,
    alignItems: 'center',
  },
  infoValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    marginTop: 8,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 50,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 15,
  },

  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
  tipText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
});
