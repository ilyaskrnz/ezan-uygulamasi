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
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../src/i18n/LanguageContext';

let Location: any = null;
let Magnetometer: any = null;

if (Platform.OS !== 'web') {
  Location = require('expo-location');
  const Sensors = require('expo-sensors');
  Magnetometer = Sensors.Magnetometer;
}

const { width } = Dimensions.get('window');
const COMPASS_SIZE = Math.min(width - 40, 300);

// Kabe koordinatları (kesin değerler)
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8264;

export default function QiblaScreen() {
  const { t } = useLanguage();
  const [magnetometer, setMagnetometer] = useState(0);
  const [qiblad, setQiblad] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  
  const compassAnim = useRef(new Animated.Value(0)).current;
  const kaabaAnim = useRef(new Animated.Value(0)).current;
  const [subscription, setSubscription] = useState<any>(null);

  useEffect(() => {
    initCompass();
    return () => {
      if (subscription) subscription.remove();
    };
  }, []);

  // Pusula dönüşü için animasyon
  useEffect(() => {
    const compassRotate = 360 - compassDegree;
    Animated.timing(compassAnim, {
      toValue: compassRotate,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [magnetometer]);

  // Kabe dönüşü için animasyon
  useEffect(() => {
    const kaabaRotate = 360 - compassDegree + qiblad;
    Animated.timing(kaabaAnim, {
      toValue: kaabaRotate,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [magnetometer, qiblad]);

  // GitHub projesinden alınan açı hesaplama fonksiyonu
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

  // GitHub projesinden alınan derece hesaplama
  const degree = (magnetometer: number) => {
    return magnetometer - 90 >= 0 ? magnetometer - 90 : magnetometer + 271;
  };

  // GitHub projesinden alınan kıble hesaplama
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
      // Manyetometre kontrolü
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

      // Konum izni
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

      // Konum al
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      
      // Kıble yönünü hesapla
      calculateQibla(latitude, longitude);
      setDistance(Math.round(calculateDistance(latitude, longitude, KAABA_LAT, KAABA_LNG)));
      
      // Manyetometreyi başlat
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

  // Hesaplanmış değerler
  const compassDegree = degree(magnetometer);
  const compassRotate = 360 - compassDegree;
  const kaabaRotate = 360 - compassDegree + qiblad;

  // Yön metni
  const getDirectionName = (deg: number) => {
    if (deg >= 337.5 || deg < 22.5) return 'Kuzey';
    if (deg >= 22.5 && deg < 67.5) return 'Kuzeydoğu';
    if (deg >= 67.5 && deg < 112.5) return 'Doğu';
    if (deg >= 112.5 && deg < 157.5) return 'Güneydoğu';
    if (deg >= 157.5 && deg < 202.5) return 'Güney';
    if (deg >= 202.5 && deg < 247.5) return 'Güneybatı';
    if (deg >= 247.5 && deg < 292.5) return 'Batı';
    return 'Kuzeybatı';
  };

  // Kıbleye dönük mü?
  const isPointingToQibla = (): boolean => {
    const qiblaAngle = ((qiblad % 360) + 360) % 360;
    return compassDegree >= Math.round(qiblaAngle - 5) && compassDegree <= Math.round(qiblaAngle + 5);
  };

  const getDirectionText = (): string => {
    const qiblaAngle = ((qiblad % 360) + 360) % 360;
    const diff = ((qiblaAngle - compassDegree + 540) % 360) - 180;
    
    if (Math.abs(diff) <= 5) return '✓ Kıble Yönündesiniz!';
    if (diff > 0) return `→ Sağa ${Math.abs(Math.round(diff))}° dönün`;
    return `← Sola ${Math.abs(Math.round(diff))}° dönün`;
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
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>{t.qibla.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Ionicons name="alert-circle" size={60} color="#E74C3C" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={initializeQibla}>
            <Text style={styles.retryBtnText}>{t.qibla.retry}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.title}>Kıble Pusulası</Text>
        <View style={styles.subHeader}>
          <Text style={styles.qiblaInfo}>Kıble: {qiblaDirection?.toFixed(1)}°</Text>
          <Text style={styles.distanceInfo}>{distance?.toLocaleString()} km</Text>
        </View>

        {/* Heading Display */}
        <Text style={styles.headingBig}>{getCurrentHeading().toFixed(0)}°</Text>
        <Text style={styles.headingLabel}>Pusula Yönü</Text>

        {/* Compass */}
        <View style={styles.compassContainer}>
          <View style={styles.northPointer}>
            <Ionicons name="caret-down" size={28} color="#E74C3C" />
          </View>

          <Animated.View style={[styles.compassDial, { transform: [{ rotate: compassRotation }] }]}>
            {/* Tick marks */}
            {[...Array(72)].map((_, i) => {
              const deg = i * 5;
              const isCardinal = deg % 90 === 0;
              const isMajor = deg % 30 === 0;
              return (
                <View key={i} style={[styles.tickWrapper, { transform: [{ rotate: `${deg}deg` }] }]}>
                  <View style={[
                    styles.tick,
                    isCardinal && styles.tickCardinal,
                    isMajor && !isCardinal && styles.tickMajor,
                  ]} />
                </View>
              );
            })}

            {/* Cardinal & Degree Labels */}
            <Text style={[styles.cardinalLabel, styles.labelN]}>N</Text>
            <Text style={[styles.cardinalLabel, styles.labelE]}>E</Text>
            <Text style={[styles.cardinalLabel, styles.labelS]}>S</Text>
            <Text style={[styles.cardinalLabel, styles.labelW]}>W</Text>
            
            <Text style={[styles.degLabel, styles.deg30]}>30</Text>
            <Text style={[styles.degLabel, styles.deg60]}>60</Text>
            <Text style={[styles.degLabel, styles.deg120]}>120</Text>
            <Text style={[styles.degLabel, styles.deg150]}>150</Text>
            <Text style={[styles.degLabel, styles.deg210]}>210</Text>
            <Text style={[styles.degLabel, styles.deg240]}>240</Text>
            <Text style={[styles.degLabel, styles.deg300]}>300</Text>
            <Text style={[styles.degLabel, styles.deg330]}>330</Text>

            {/* Inner Circle with Qibla Arrow */}
            <View style={styles.innerCircle}>
              <View style={[styles.qiblaWrapper, { transform: [{ rotate: `${qiblaDirection}deg` }] }]}>
                <View style={styles.qiblaArrow}>
                  <Text style={[styles.qiblaText, isPointingToQibla() && styles.qiblaTextActive]}>KIBLE</Text>
                  <Ionicons name="caret-up" size={36} color={isPointingToQibla() ? '#27AE60' : '#D4AF37'} />
                </View>
              </View>
              
              <View style={[styles.kaabaCenter, isPointingToQibla() && styles.kaabaCenterActive]}>
                <Ionicons name="cube" size={28} color={isPointingToQibla() ? '#27AE60' : '#D4AF37'} />
              </View>
            </View>
          </Animated.View>
        </View>

        {/* Status */}
        <View style={[styles.statusBar, isPointingToQibla() && styles.statusBarActive]}>
          <Text style={[styles.statusText, isPointingToQibla() && styles.statusTextActive]}>
            {getDirectionText()}
          </Text>
        </View>

        {/* Calibration */}
        <View style={styles.calibrationBox}>
          <Text style={styles.calibrationTitle}>Pusula Kalibrasyonu</Text>
          <Text style={styles.calibrationHint}>Pusula yanlış gösteriyorsa ayarlayın</Text>
          
          <View style={styles.calButtons}>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(-10)}>
              <Text style={styles.calBtnText}>-10°</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(-1)}>
              <Text style={styles.calBtnText}>-1°</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtnReset} onPress={resetCalibration}>
              <Text style={styles.calBtnText}>Sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(1)}>
              <Text style={styles.calBtnText}>+1°</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.calBtn} onPress={() => adjustCalibration(10)}>
              <Text style={styles.calBtnText}>+10°</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.northSetBtn} onPress={setAsNorth}>
            <Ionicons name="navigate" size={16} color="#0F0F1A" />
            <Text style={styles.northSetBtnText}>Şu anı Kuzey olarak ayarla</Text>
          </TouchableOpacity>

          {calibrationOffset !== 0 && (
            <Text style={styles.offsetLabel}>Kalibrasyon: {calibrationOffset > 0 ? '+' : ''}{calibrationOffset.toFixed(0)}°</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  scrollContent: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  loadingText: { color: '#FFF', marginTop: 16, fontSize: 16 },
  errorText: { color: '#E74C3C', fontSize: 16, textAlign: 'center', marginVertical: 20 },
  retryBtn: { backgroundColor: '#D4AF37', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 25 },
  retryBtnText: { color: '#0F0F1A', fontSize: 16, fontWeight: '600' },
  
  title: { color: '#FFF', fontSize: 24, fontWeight: '700', marginTop: 10 },
  subHeader: { flexDirection: 'row', gap: 20, marginTop: 6, marginBottom: 16 },
  qiblaInfo: { color: '#D4AF37', fontSize: 14, fontWeight: '600' },
  distanceInfo: { color: '#8E8E93', fontSize: 14 },
  
  headingBig: { color: '#FFF', fontSize: 56, fontWeight: '200' },
  headingLabel: { color: '#8E8E93', fontSize: 13, marginBottom: 20 },
  
  compassContainer: { width: COMPASS_SIZE + 40, height: COMPASS_SIZE + 40, alignItems: 'center', justifyContent: 'center' },
  northPointer: { position: 'absolute', top: 0, zIndex: 10 },
  
  compassDial: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#2D2D44',
  },
  
  tickWrapper: { position: 'absolute', width: 2, height: COMPASS_SIZE / 2, alignItems: 'center' },
  tick: { width: 1, height: 8, backgroundColor: '#3D3D5C', marginTop: 6 },
  tickMajor: { width: 2, height: 14, backgroundColor: '#6D6D8C' },
  tickCardinal: { width: 3, height: 18, backgroundColor: '#D4AF37' },
  
  cardinalLabel: { position: 'absolute', color: '#D4AF37', fontSize: 16, fontWeight: '700' },
  labelN: { top: 28 },
  labelE: { right: 28 },
  labelS: { bottom: 28 },
  labelW: { left: 28 },
  
  degLabel: { position: 'absolute', color: '#5D5D7C', fontSize: 11 },
  deg30: { top: 38, right: 52 },
  deg60: { top: 52, right: 38 },
  deg120: { bottom: 52, right: 38 },
  deg150: { bottom: 38, right: 52 },
  deg210: { bottom: 38, left: 52 },
  deg240: { bottom: 52, left: 38 },
  deg300: { top: 52, left: 38 },
  deg330: { top: 38, left: 52 },
  
  innerCircle: {
    width: COMPASS_SIZE - 80,
    height: COMPASS_SIZE - 80,
    borderRadius: (COMPASS_SIZE - 80) / 2,
    backgroundColor: '#0F0F1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#2D2D44',
  },
  
  qiblaWrapper: {
    position: 'absolute',
    width: COMPASS_SIZE - 80,
    height: COMPASS_SIZE - 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  qiblaArrow: { alignItems: 'center' },
  qiblaText: { color: '#D4AF37', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: -6 },
  qiblaTextActive: { color: '#27AE60' },
  
  kaabaCenter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
  },
  kaabaCenterActive: { borderColor: '#27AE60', backgroundColor: '#0D1A12' },
  
  statusBar: {
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  statusBarActive: { backgroundColor: '#0D1A12', borderColor: '#27AE60' },
  statusText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  statusTextActive: { color: '#27AE60' },
  
  calibrationBox: {
    width: '100%',
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  calibrationTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  calibrationHint: { color: '#8E8E93', fontSize: 11, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  
  calButtons: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 },
  calBtn: { backgroundColor: '#2D2D44', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  calBtnReset: { backgroundColor: '#3D3D5C', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  calBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600' },
  
  northSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#D4AF37',
    paddingVertical: 10,
    borderRadius: 20,
  },
  northSetBtnText: { color: '#0F0F1A', fontSize: 13, fontWeight: '600' },
  
  offsetLabel: { color: '#D4AF37', fontSize: 12, textAlign: 'center', marginTop: 12 },
});
