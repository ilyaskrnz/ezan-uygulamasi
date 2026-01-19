import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../src/i18n/LanguageContext';
import { BannerAdComponent } from '../src/components/AdMob';

let Location: any = null;
if (Platform.OS !== 'web') {
  Location = require('expo-location');
}

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PrayerTime {
  name: string;
  nameTr: string;
  time: string;
  icon: keyof typeof Ionicons.glyphMap;
  key: string;
}

interface PrayerData {
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  date: string;
  hijri_date: string;
  timezone: string;
  method: string;
}

export default function HomeScreen() {
  const { t } = useLanguage();
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [cityName, setCityName] = useState<string>(t.home.locationLoading);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nextPrayer, setNextPrayer] = useState<{ name: string; time: string; remaining: string; hours: number; mins: number; secs: number } | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (prayerData) {
      calculateNextPrayer();
    }
  }, [prayerData, currentTime, t]);

  const calculateNextPrayer = () => {
    if (!prayerData) return;

    const prayers = [
      { name: t.prayers.fajr, time: prayerData.fajr },
      { name: t.prayers.sunrise, time: prayerData.sunrise },
      { name: t.prayers.dhuhr, time: prayerData.dhuhr },
      { name: t.prayers.asr, time: prayerData.asr },
      { name: t.prayers.maghrib, time: prayerData.maghrib },
      { name: t.prayers.isha, time: prayerData.isha },
    ];

    const now = currentTime;
    const currentSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

    for (const prayer of prayers) {
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerSeconds = hours * 3600 + minutes * 60;

      if (prayerSeconds > currentSeconds) {
        const diff = prayerSeconds - currentSeconds;
        const remainingHours = Math.floor(diff / 3600);
        const remainingMins = Math.floor((diff % 3600) / 60);
        const remainingSecs = diff % 60;
        
        setNextPrayer({
          name: prayer.name,
          time: prayer.time,
          remaining: remainingHours > 0 
            ? `${remainingHours} saat ${remainingMins} dk`
            : `${remainingMins} dk ${remainingSecs} sn`,
          hours: remainingHours,
          mins: remainingMins,
          secs: remainingSecs,
        });
        return;
      }
    }

    setNextPrayer({
      name: t.prayers.fajr,
      time: prayerData.fajr,
      remaining: t.home.tomorrow,
      hours: 0,
      mins: 0,
      secs: 0,
    });
  };

  const getLocation = async () => {
    try {
      const savedCity = await AsyncStorage.getItem('selectedCity');
      if (savedCity) {
        const city = JSON.parse(savedCity);
        setLocation({ lat: city.latitude, lng: city.longitude });
        setCityName(city.name);
        return { lat: city.latitude, lng: city.longitude };
      }

      if (Platform.OS === 'web' || !Location) {
        setLocation({ lat: 41.0082, lng: 28.9784 });
        setCityName('İstanbul');
        return { lat: 41.0082, lng: 28.9784 };
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(t.home.locationDenied);
        setLocation({ lat: 41.0082, lng: 28.9784 });
        setCityName('İstanbul');
        return { lat: 41.0082, lng: 28.9784 };
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setLocation(coords);

      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });
        if (address) {
          setCityName(address.city || address.subregion || address.region || 'Unknown');
        }
      } catch {
        setCityName('Location');
      }

      return coords;
    } catch (err) {
      console.error('Location error:', err);
      setError(t.home.locationError);
      setLocation({ lat: 41.0082, lng: 28.9784 });
      setCityName('İstanbul');
      return { lat: 41.0082, lng: 28.9784 };
    }
  };

  const fetchPrayerTimes = async (coords: { lat: number; lng: number }) => {
    try {
      const response = await axios.get(`${API_URL}/api/prayer-times`, {
        params: {
          latitude: coords.lat,
          longitude: coords.lng,
          method: 13,
        },
      });

      if (response.data.success) {
        setPrayerData(response.data.data);
        setError(null);
      }
    } catch (err) {
      console.error('Prayer times error:', err);
      setError(t.home.error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    const coords = await getLocation();
    if (coords) {
      await fetchPrayerTimes(coords);
    }
    setLoading(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const prayerTimes: PrayerTime[] = prayerData
    ? [
        { name: 'Fajr', nameTr: t.prayers.fajr, time: prayerData.fajr, icon: 'moon-outline', key: 'fajr' },
        { name: 'Sunrise', nameTr: t.prayers.sunrise, time: prayerData.sunrise, icon: 'sunny-outline', key: 'sunrise' },
        { name: 'Dhuhr', nameTr: t.prayers.dhuhr, time: prayerData.dhuhr, icon: 'sunny', key: 'dhuhr' },
        { name: 'Asr', nameTr: t.prayers.asr, time: prayerData.asr, icon: 'partly-sunny-outline', key: 'asr' },
        { name: 'Maghrib', nameTr: t.prayers.maghrib, time: prayerData.maghrib, icon: 'cloudy-night-outline', key: 'maghrib' },
        { name: 'Isha', nameTr: t.prayers.isha, time: prayerData.isha, icon: 'moon', key: 'isha' },
      ]
    : [];

  const isCurrentPrayer = (prayerName: string) => {
    return nextPrayer?.name === prayerName;
  };

  const formatTimeUnit = (num: number) => {
    return num.toString().padStart(2, '0');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.loadingContainer}>
          <View style={styles.loadingCircle}>
            <ActivityIndicator size="large" color="#00BFA6" />
          </View>
          <Text style={styles.loadingText}>{t.home.loading}</Text>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00BFA6" />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.locationRow}>
              <View style={styles.locationPill}>
                <Ionicons name="location" size={16} color="#00BFA6" />
                <Text style={styles.locationText}>{cityName}</Text>
              </View>
              <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {prayerData && (
              <View style={styles.dateSection}>
                <Text style={styles.hijriDate}>☪ {prayerData.hijri_date}</Text>
                <Text style={styles.gregorianDate}>{prayerData.date}</Text>
              </View>
            )}
          </View>

          {/* Ana Saat Kartı */}
          <View style={styles.mainCard}>
            <LinearGradient
              colors={['#1a3a2e', '#0d1f18']}
              style={styles.clockGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              {/* Şu anki saat */}
              <Text style={styles.currentTimeLabel}>{t.home.currentTime}</Text>
              <View style={styles.digitalClock}>
                <View style={styles.timeSegment}>
                  <Text style={styles.clockDigit}>
                    {formatTimeUnit(currentTime.getHours())}
                  </Text>
                </View>
                <Text style={styles.clockSeparator}>:</Text>
                <View style={styles.timeSegment}>
                  <Text style={styles.clockDigit}>
                    {formatTimeUnit(currentTime.getMinutes())}
                  </Text>
                </View>
                <Text style={styles.clockSeparator}>:</Text>
                <View style={styles.timeSegment}>
                  <Text style={[styles.clockDigit, styles.clockSeconds]}>
                    {formatTimeUnit(currentTime.getSeconds())}
                  </Text>
                </View>
              </View>

              {/* Ayırıcı */}
              <View style={styles.divider} />

              {/* Sonraki namaz */}
              {nextPrayer && (
                <View style={styles.nextPrayerSection}>
                  <View style={styles.nextPrayerBadge}>
                    <Ionicons name="notifications" size={20} color="#121212" />
                    <Text style={styles.nextPrayerLabel}>{t.home.nextPrayer}</Text>
                  </View>
                  
                  <Text style={styles.nextPrayerName}>{nextPrayer.name}</Text>
                  <Text style={styles.nextPrayerTime}>{nextPrayer.time}</Text>

                  {/* Geri sayım kutuları */}
                  <View style={styles.countdownBoxes}>
                    <View style={styles.countdownBox}>
                      <Text style={styles.countdownNumber}>{formatTimeUnit(nextPrayer.hours)}</Text>
                      <Text style={styles.countdownLabel}>Saat</Text>
                    </View>
                    <View style={styles.countdownBox}>
                      <Text style={styles.countdownNumber}>{formatTimeUnit(nextPrayer.mins)}</Text>
                      <Text style={styles.countdownLabel}>Dakika</Text>
                    </View>
                    <View style={styles.countdownBox}>
                      <Text style={styles.countdownNumber}>{formatTimeUnit(nextPrayer.secs)}</Text>
                      <Text style={styles.countdownLabel}>Saniye</Text>
                    </View>
                  </View>
                </View>
              )}
            </LinearGradient>
          </View>

          {/* Namaz Vakitleri Listesi */}
          <View style={styles.prayerListSection}>
            <Text style={styles.sectionTitle}>{t.home.dailyTimes}</Text>
            
            <View style={styles.prayerGrid}>
              {prayerTimes.map((prayer, index) => {
                const isActive = isCurrentPrayer(prayer.nameTr);
                return (
                  <View
                    key={index}
                    style={[
                      styles.prayerItem,
                      isActive && styles.prayerItemActive,
                    ]}
                  >
                    <View style={[styles.prayerIconWrap, isActive && styles.prayerIconWrapActive]}>
                      <Ionicons
                        name={prayer.icon}
                        size={22}
                        color={isActive ? '#121212' : '#00BFA6'}
                      />
                    </View>
                    <View style={styles.prayerInfo}>
                      <Text style={[styles.prayerName, isActive && styles.prayerNameActive]}>
                        {prayer.nameTr}
                      </Text>
                      <Text style={styles.prayerNameEn}>{prayer.name}</Text>
                    </View>
                    <Text style={[styles.prayerTime, isActive && styles.prayerTimeActive]}>
                      {prayer.time}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="warning" size={20} color="#FF6B6B" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
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
  },
  scrollView: {
    flex: 1,
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

  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 15,
  },
  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,191,166,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  locationText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateSection: {
    marginTop: 15,
  },
  hijriDate: {
    color: '#00BFA6',
    fontSize: 18,
    fontWeight: '600',
  },
  gregorianDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginTop: 4,
  },

  mainCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,191,166,0.3)',
  },
  clockGradient: {
    padding: 24,
    alignItems: 'center',
  },
  currentTimeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 8,
  },
  digitalClock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeSegment: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clockDigit: {
    color: '#00BFA6',
    fontSize: 42,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
  },
  clockSeconds: {
    color: 'rgba(0,191,166,0.6)',
    fontSize: 36,
  },
  clockSeparator: {
    color: '#00BFA6',
    fontSize: 36,
    fontWeight: '200',
    marginHorizontal: 4,
  },

  divider: {
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginVertical: 20,
  },

  nextPrayerSection: {
    alignItems: 'center',
  },
  nextPrayerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#00BFA6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginBottom: 16,
  },
  nextPrayerLabel: {
    color: '#121212',
    fontSize: 16,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextPrayerName: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '700',
    marginTop: 5,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  nextPrayerTime: {
    color: '#00BFA6',
    fontSize: 56,
    fontWeight: '700',
    marginTop: 8,
    textShadowColor: 'rgba(0, 191, 166, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  countdownBoxes: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  countdownBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 70,
  },
  countdownNumber: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  countdownLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  prayerListSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  prayerGrid: {
    gap: 10,
  },
  prayerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 14,
  },
  prayerItemActive: {
    backgroundColor: '#00BFA6',
  },
  prayerIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,191,166,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  prayerIconWrapActive: {
    backgroundColor: 'rgba(18,18,18,0.3)',
  },
  prayerInfo: {
    flex: 1,
  },
  prayerName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  prayerNameActive: {
    color: '#121212',
  },
  prayerNameEn: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2,
  },
  prayerTime: {
    color: '#00BFA6',
    fontSize: 20,
    fontWeight: '700',
  },
  prayerTimeActive: {
    color: '#121212',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
});
