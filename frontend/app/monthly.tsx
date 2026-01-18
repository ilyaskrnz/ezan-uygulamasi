import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface DayPrayer {
  date: string;
  gregorian: string;
  hijri: string;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export default function MonthlyScreen() {
  const [monthlyData, setMonthlyData] = useState<DayPrayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  const months = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  useEffect(() => {
    initializeData();
  }, []);

  useEffect(() => {
    if (location) {
      fetchMonthlyData();
    }
  }, [currentMonth, currentYear, location]);

  const initializeData = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation({ lat: 41.0082, lng: 28.9784 }); // Default Istanbul
      } else {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    } catch (err) {
      setLocation({ lat: 41.0082, lng: 28.9784 });
    }
  };

  const fetchMonthlyData = async () => {
    if (!location) return;
    
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(`${API_URL}/api/prayer-times/monthly`, {
        params: {
          latitude: location.lat,
          longitude: location.lng,
          month: currentMonth,
          year: currentYear,
          method: 13,
        },
      });

      if (response.data.success) {
        setMonthlyData(response.data.data);
      }
    } catch (err) {
      console.error('Monthly data error:', err);
      setError('Aylık vakitler alınamadı');
    } finally {
      setLoading(false);
    }
  };

  const previousMonth = () => {
    if (currentMonth === 1) {
      setCurrentMonth(12);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 12) {
      setCurrentMonth(1);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const isToday = (dateStr: string) => {
    const today = new Date();
    const [day, month, year] = dateStr.split('-');
    return (
      parseInt(day) === today.getDate() &&
      parseInt(month) === today.getMonth() + 1 &&
      parseInt(year) === today.getFullYear()
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Aylık Vakitler</Text>
        
        {/* Month Navigator */}
        <View style={styles.monthNavigator}>
          <TouchableOpacity onPress={previousMonth} style={styles.navButton}>
            <Ionicons name="chevron-back" size={24} color="#D4AF37" />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {months[currentMonth - 1]} {currentYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color="#D4AF37" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
          <Text style={styles.loadingText}>Vakitler yükleniyor...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={48} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMonthlyData}>
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.headerCell, styles.dateCell]}>Tarih</Text>
            <Text style={styles.headerCell}>İmsak</Text>
            <Text style={styles.headerCell}>Güneş</Text>
            <Text style={styles.headerCell}>Öğle</Text>
            <Text style={styles.headerCell}>İkindi</Text>
            <Text style={styles.headerCell}>Akşam</Text>
            <Text style={styles.headerCell}>Yatsı</Text>
          </View>

          {/* Table Body */}
          {monthlyData.map((day, index) => (
            <View
              key={index}
              style={[
                styles.tableRow,
                isToday(day.gregorian) && styles.todayRow,
              ]}
            >
              <View style={styles.dateCell}>
                <Text style={[
                  styles.dateText,
                  isToday(day.gregorian) && styles.todayText,
                ]}>
                  {day.gregorian.split('-')[0]}
                </Text>
                <Text style={styles.hijriText}>{day.hijri}</Text>
              </View>
              <Text style={[
                styles.timeCell,
                isToday(day.gregorian) && styles.todayText,
              ]}>{day.fajr}</Text>
              <Text style={[
                styles.timeCell,
                isToday(day.gregorian) && styles.todayText,
              ]}>{day.sunrise}</Text>
              <Text style={[
                styles.timeCell,
                isToday(day.gregorian) && styles.todayText,
              ]}>{day.dhuhr}</Text>
              <Text style={[
                styles.timeCell,
                isToday(day.gregorian) && styles.todayText,
              ]}>{day.asr}</Text>
              <Text style={[
                styles.timeCell,
                isToday(day.gregorian) && styles.todayText,
              ]}>{day.maghrib}</Text>
              <Text style={[
                styles.timeCell,
                isToday(day.gregorian) && styles.todayText,
              ]}>{day.isha}</Text>
            </View>
          ))}

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              * Vakitler Diyanet İşleri Başkanlığı hesaplama metoduna göre hesaplanmıştır.
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F1A',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  monthNavigator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 8,
  },
  navButton: {
    padding: 8,
  },
  monthText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
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
    color: '#FF6B6B',
    fontSize: 16,
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
  scrollView: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1A1A2E',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D44',
  },
  headerCell: {
    flex: 1,
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
    alignItems: 'center',
  },
  todayRow: {
    backgroundColor: '#2A2A3E',
    borderLeftWidth: 3,
    borderLeftColor: '#D4AF37',
  },
  dateCell: {
    flex: 1.2,
    alignItems: 'center',
  },
  dateText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  hijriText: {
    color: '#8E8E93',
    fontSize: 9,
    marginTop: 2,
  },
  timeCell: {
    flex: 1,
    color: '#CCCCCC',
    fontSize: 11,
    textAlign: 'center',
  },
  todayText: {
    color: '#D4AF37',
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    color: '#8E8E93',
    fontSize: 11,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
