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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface PrayerTime {
  name: string;
  nameTr: string;
  time: string;
  icon: keyof typeof Ionicons.glyphMap;
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
  const [prayerData, setPrayerData] = useState<PrayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [cityName, setCityName] = useState<string>('Konum alınıyor...');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [nextPrayer, setNextPrayer] = useState<{ name: string; time: string; remaining: string } | null>(null);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate next prayer
  useEffect(() => {
    if (prayerData) {
      calculateNextPrayer();
    }
  }, [prayerData, currentTime]);

  const calculateNextPrayer = () => {
    if (!prayerData) return;

    const prayers = [
      { name: 'İmsak', time: prayerData.fajr },
      { name: 'Güneş', time: prayerData.sunrise },
      { name: 'Öğle', time: prayerData.dhuhr },
      { name: 'İkindi', time: prayerData.asr },
      { name: 'Akşam', time: prayerData.maghrib },
      { name: 'Yatsı', time: prayerData.isha },
    ];

    const now = currentTime;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const prayer of prayers) {
      const [hours, minutes] = prayer.time.split(':').map(Number);
      const prayerMinutes = hours * 60 + minutes;

      if (prayerMinutes > currentMinutes) {
        const diff = prayerMinutes - currentMinutes;
        const remainingHours = Math.floor(diff / 60);
        const remainingMins = diff % 60;
        
        setNextPrayer({
          name: prayer.name,
          time: prayer.time,
          remaining: remainingHours > 0 
            ? `${remainingHours} saat ${remainingMins} dk`
            : `${remainingMins} dk`,
        });
        return;
      }
    }

    // If all prayers passed, next is tomorrow's Fajr
    setNextPrayer({
      name: 'İmsak',
      time: prayerData.fajr,
      remaining: 'Yarın',
    });
  };

  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Konum izni verilmedi');
        // Use default location (Istanbul)
        setLocation({ lat: 41.0082, lng: 28.9784 });
        setCityName('İstanbul');
        return { lat: 41.0082, lng: 28.9784 };
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setLocation(coords);

      // Reverse geocode to get city name
      try {
        const [address] = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lng,
        });
        if (address) {
          setCityName(address.city || address.subregion || address.region || 'Bilinmeyen Konum');
        }
      } catch {
        setCityName('Konum');
      }

      return coords;
    } catch (err) {
      console.error('Location error:', err);
      setError('Konum alınamadı');
      // Use default location
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
          method: 13, // Turkey Diyanet
        },
      });

      if (response.data.success) {
        setPrayerData(response.data.data);
        setError(null);
      }
    } catch (err) {
      console.error('Prayer times error:', err);
      setError('Namaz vakitleri alınamadı');
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
        { name: 'Fajr', nameTr: 'İmsak', time: prayerData.fajr, icon: 'moon-outline' },
        { name: 'Sunrise', nameTr: 'Güneş', time: prayerData.sunrise, icon: 'sunny-outline' },
        { name: 'Dhuhr', nameTr: 'Öğle', time: prayerData.dhuhr, icon: 'sunny' },
        { name: 'Asr', nameTr: 'İkindi', time: prayerData.asr, icon: 'partly-sunny-outline' },
        { name: 'Maghrib', nameTr: 'Akşam', time: prayerData.maghrib, icon: 'cloudy-night-outline' },
        { name: 'Isha', nameTr: 'Yatsı', time: prayerData.isha, icon: 'moon' },
      ]
    : [];

  const isCurrentPrayer = (prayerName: string) => {
    return nextPrayer?.name === prayerName;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>Namaz vakitleri yükleniyor...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.locationContainer}>
              <Ionicons name="location" size={20} color="#D4AF37" />
              <Text style={styles.locationText}>{cityName}</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} style={styles.refreshButton}>
              <Ionicons name="refresh" size={22} color="#D4AF37" />
            </TouchableOpacity>
          </View>
          
          {prayerData && (
            <View style={styles.dateContainer}>
              <Text style={styles.gregorianDate}>{prayerData.date}</Text>
              <Text style={styles.hijriDate}>{prayerData.hijri_date}</Text>
            </View>
          )}
        </View>

        {/* Next Prayer Card */}
        {nextPrayer && (
          <View style={styles.nextPrayerCard}>
            <View style={styles.nextPrayerHeader}>
              <Ionicons name="notifications" size={24} color="#D4AF37" />
              <Text style={styles.nextPrayerLabel}>Sonraki Vakit</Text>
            </View>
            <Text style={styles.nextPrayerName}>{nextPrayer.name}</Text>
            <Text style={styles.nextPrayerTime}>{nextPrayer.time}</Text>
            <View style={styles.countdownContainer}>
              <Ionicons name="time-outline" size={18} color="#8E8E93" />
              <Text style={styles.countdownText}>{nextPrayer.remaining} kaldı</Text>
            </View>
          </View>
        )}

        {/* Current Time */}
        <View style={styles.currentTimeContainer}>
          <Text style={styles.currentTimeLabel}>Şu an</Text>
          <Text style={styles.currentTime}>
            {currentTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        </View>

        {/* Prayer Times List */}
        <View style={styles.prayerListContainer}>
          <Text style={styles.sectionTitle}>Günlük Vakitler</Text>
          {prayerTimes.map((prayer, index) => (
            <View
              key={index}
              style={[
                styles.prayerCard,
                isCurrentPrayer(prayer.nameTr) && styles.prayerCardActive,
              ]}
            >
              <View style={styles.prayerLeft}>
                <View style={[
                  styles.iconContainer,
                  isCurrentPrayer(prayer.nameTr) && styles.iconContainerActive,
                ]}>
                  <Ionicons
                    name={prayer.icon}
                    size={24}
                    color={isCurrentPrayer(prayer.nameTr) ? '#1A1A2E' : '#D4AF37'}
                  />
                </View>
                <View>
                  <Text style={[
                    styles.prayerName,
                    isCurrentPrayer(prayer.nameTr) && styles.prayerNameActive,
                  ]}>
                    {prayer.nameTr}
                  </Text>
                  <Text style={styles.prayerNameEn}>{prayer.name}</Text>
                </View>
              </View>
              <Text style={[
                styles.prayerTime,
                isCurrentPrayer(prayer.nameTr) && styles.prayerTimeActive,
              ]}>
                {prayer.time}
              </Text>
            </View>
          ))}
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="warning" size={24} color="#FF6B6B" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  scrollView: {
    flex: 1,
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
    padding: 20,
    paddingTop: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  refreshButton: {
    padding: 8,
  },
  dateContainer: {
    marginTop: 12,
  },
  gregorianDate: {
    color: '#8E8E93',
    fontSize: 14,
  },
  hijriDate: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  nextPrayerCard: {
    backgroundColor: '#1A1A2E',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D4AF37',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  nextPrayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  nextPrayerLabel: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  nextPrayerName: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: 'bold',
  },
  nextPrayerTime: {
    color: '#D4AF37',
    fontSize: 48,
    fontWeight: 'bold',
    marginTop: 8,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: '#2D2D44',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  countdownText: {
    color: '#8E8E93',
    fontSize: 14,
    marginLeft: 8,
  },
  currentTimeContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  currentTimeLabel: {
    color: '#8E8E93',
    fontSize: 12,
  },
  currentTime: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '300',
  },
  prayerListContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  sectionTitle: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  prayerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  prayerCardActive: {
    backgroundColor: '#D4AF37',
  },
  prayerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2D2D44',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  iconContainerActive: {
    backgroundColor: '#1A1A2E',
  },
  prayerName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  prayerNameActive: {
    color: '#1A1A2E',
  },
  prayerNameEn: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  prayerTime: {
    color: '#D4AF37',
    fontSize: 22,
    fontWeight: 'bold',
  },
  prayerTimeActive: {
    color: '#1A1A2E',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginHorizontal: 20,
    backgroundColor: '#2D1A1A',
    borderRadius: 12,
  },
  errorText: {
    color: '#FF6B6B',
    marginLeft: 8,
    fontSize: 14,
  },
});
