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
          <TouchableOpacity style={styles.retryBtn} onPress={initCompass}>
            <Text style={styles.retryBtnText}>{t.qibla.retry}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const qiblaAngleDisplay = ((qiblad % 360) + 360) % 360;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Text style={styles.title}>Kıble Pusulası</Text>
        
        {/* Yön ve Derece */}
        <View style={styles.directionBox}>
          <Text style={styles.directionName}>{getDirectionName(compassDegree)}</Text>
          <Text style={[
            styles.headingBig, 
            isPointingToQibla() && styles.headingActive
          ]}>
            {compassDegree}°
          </Text>
        </View>

        {/* Pusula */}
        <View style={styles.compassContainer}>
          {/* Üst Kırmızı İşaretçi */}
          <View style={styles.northPointer}>
            <View style={styles.pointerTriangle} />
          </View>

          {/* Dönen Pusula */}
          <Animated.View style={[styles.compassDial, { transform: [{ rotate: compassRotation }] }]}>
            {/* Pusula Görseli - SVG yerine basit tasarım */}
            <View style={styles.compassFace}>
              {/* Ana yön çizgileri */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
                <View 
                  key={i} 
                  style={[
                    styles.compassLine, 
                    { transform: [{ rotate: `${deg}deg` }] },
                    deg % 90 === 0 && styles.compassLineMain
                  ]} 
                />
              ))}
              
              {/* Yön harfleri */}
              <Text style={[styles.compassText, styles.textN]}>N</Text>
              <Text style={[styles.compassText, styles.textE]}>E</Text>
              <Text style={[styles.compassText, styles.textS]}>S</Text>
              <Text style={[styles.compassText, styles.textW]}>W</Text>
              
              {/* Derece işaretleri */}
              <Text style={[styles.degreeText, styles.deg30]}>30</Text>
              <Text style={[styles.degreeText, styles.deg60]}>60</Text>
              <Text style={[styles.degreeText, styles.deg120]}>120</Text>
              <Text style={[styles.degreeText, styles.deg150]}>150</Text>
              <Text style={[styles.degreeText, styles.deg210]}>210</Text>
              <Text style={[styles.degreeText, styles.deg240]}>240</Text>
              <Text style={[styles.degreeText, styles.deg300]}>300</Text>
              <Text style={[styles.degreeText, styles.deg330]}>330</Text>
            </View>
          </Animated.View>

          {/* Kabe İşaretçisi (Ayrı döner) */}
          <Animated.View style={[styles.kaabaContainer, { transform: [{ rotate: kaabaRotation }] }]}>
            <View style={styles.kaabaPointer}>
              <View style={[styles.kaabaArrow, isPointingToQibla() && styles.kaabaArrowActive]} />
              <Text style={[styles.kaabaText, isPointingToQibla() && styles.kaabaTextActive]}>🕋</Text>
            </View>
          </Animated.View>

          {/* Merkez Daire */}
          <View style={[styles.centerCircle, isPointingToQibla() && styles.centerCircleActive]}>
            <Ionicons name="navigate" size={24} color={isPointingToQibla() ? '#27AE60' : '#D4AF37'} />
          </View>
        </View>

        {/* Bilgi Kartları */}
        <View style={styles.infoCards}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Kıble Açısı</Text>
            <Text style={styles.infoValue}>{qiblaAngleDisplay.toFixed(1)}°</Text>
          </View>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Kabe'ye Uzaklık</Text>
            <Text style={styles.infoValue}>{distance?.toLocaleString()} km</Text>
          </View>
        </View>

        {/* Durum Çubuğu */}
        <View style={[styles.statusBar, isPointingToQibla() && styles.statusBarActive]}>
          <Text style={[styles.statusText, isPointingToQibla() && styles.statusTextActive]}>
            {getDirectionText()}
          </Text>
        </View>

        {/* Kalibrasyon İpucu */}
        <View style={styles.hintBox}>
          <Ionicons name="information-circle" size={18} color="#8E8E93" />
          <Text style={styles.hintText}>
            Daha doğru sonuç için telefonunuzu 8 şeklinde hareket ettirerek kalibre edin
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#0F0F1A' 
  },
  centerContent: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center', 
    padding: 40 
  },
  scrollContent: { 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingBottom: 40 
  },
  loadingText: { 
    color: '#FFF', 
    marginTop: 16, 
    fontSize: 16 
  },
  errorText: { 
    color: '#E74C3C', 
    fontSize: 16, 
    textAlign: 'center', 
    marginVertical: 20 
  },
  retryBtn: { 
    backgroundColor: '#D4AF37', 
    paddingHorizontal: 28, 
    paddingVertical: 12, 
    borderRadius: 25 
  },
  retryBtnText: { 
    color: '#0F0F1A', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  
  title: { 
    color: '#FFF', 
    fontSize: 26, 
    fontWeight: '700', 
    marginTop: 10,
    marginBottom: 20 
  },
  
  directionBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  directionName: {
    color: '#8E8E93',
    fontSize: 14,
    marginBottom: 4,
  },
  headingBig: { 
    color: '#FFF', 
    fontSize: 48, 
    fontWeight: '200' 
  },
  headingActive: {
    color: '#27AE60',
  },
  
  compassContainer: { 
    width: COMPASS_SIZE + 40, 
    height: COMPASS_SIZE + 40, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginVertical: 10,
  },
  
  northPointer: { 
    position: 'absolute', 
    top: 0, 
    zIndex: 20,
    alignItems: 'center',
  },
  pointerTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 20,
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
    borderWidth: 3,
    borderColor: '#2D2D44',
  },
  
  compassFace: {
    width: COMPASS_SIZE - 6,
    height: COMPASS_SIZE - 6,
    borderRadius: (COMPASS_SIZE - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  compassLine: {
    position: 'absolute',
    width: 2,
    height: COMPASS_SIZE / 2 - 20,
    backgroundColor: '#3D3D5C',
    top: 10,
  },
  compassLineMain: {
    width: 3,
    backgroundColor: '#D4AF37',
  },
  
  compassText: {
    position: 'absolute',
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '700',
  },
  textN: { top: 30 },
  textE: { right: 30 },
  textS: { bottom: 30 },
  textW: { left: 30 },
  
  degreeText: {
    position: 'absolute',
    color: '#5D5D7C',
    fontSize: 11,
  },
  deg30: { top: 40, right: 55 },
  deg60: { top: 55, right: 40 },
  deg120: { bottom: 55, right: 40 },
  deg150: { bottom: 40, right: 55 },
  deg210: { bottom: 40, left: 55 },
  deg240: { bottom: 55, left: 40 },
  deg300: { top: 55, left: 40 },
  deg330: { top: 40, left: 55 },
  
  kaabaContainer: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 15,
  },
  kaabaPointer: {
    alignItems: 'center',
    paddingTop: 25,
  },
  kaabaArrow: {
    width: 4,
    height: 35,
    backgroundColor: '#D4AF37',
    borderRadius: 2,
    marginBottom: 5,
  },
  kaabaArrowActive: {
    backgroundColor: '#27AE60',
  },
  kaabaText: {
    fontSize: 28,
  },
  kaabaTextActive: {
    transform: [{ scale: 1.2 }],
  },
  
  centerCircle: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#D4AF37',
    zIndex: 10,
  },
  centerCircleActive: {
    borderColor: '#27AE60',
    backgroundColor: '#0D1A12',
  },
  
  infoCards: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  infoLabel: {
    color: '#8E8E93',
    fontSize: 12,
    marginBottom: 4,
  },
  infoValue: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '600',
  },
  
  statusBar: {
    backgroundColor: '#1A1A2E',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  statusBarActive: { 
    backgroundColor: '#0D1A12', 
    borderColor: '#27AE60' 
  },
  statusText: { 
    color: '#FFF', 
    fontSize: 16, 
    fontWeight: '600' 
  },
  statusTextActive: { 
    color: '#27AE60' 
  },
  
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D2D44',
  },
  hintText: {
    color: '#8E8E93',
    fontSize: 12,
    flex: 1,
  },
});
