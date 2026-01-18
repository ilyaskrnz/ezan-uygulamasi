import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface City {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
}

interface CalculationMethod {
  id: number;
  name: string;
  name_tr: string;
}

interface Language {
  code: string;
  name: string;
  nameLocal: string;
}

const LANGUAGES: Language[] = [
  { code: 'tr', name: 'Turkish', nameLocal: 'Türkçe' },
  { code: 'en', name: 'English', nameLocal: 'English' },
  { code: 'ar', name: 'Arabic', nameLocal: 'العربية' },
  { code: 'de', name: 'German', nameLocal: 'Deutsch' },
  { code: 'fr', name: 'French', nameLocal: 'Français' },
];

export default function SettingsScreen() {
  const [language, setLanguage] = useState('tr');
  const [theme, setTheme] = useState('dark');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [calculationMethod, setCalculationMethod] = useState<CalculationMethod | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showMethodModal, setShowMethodModal] = useState(false);
  const [turkishCities, setTurkishCities] = useState<City[]>([]);
  const [worldCities, setWorldCities] = useState<City[]>([]);
  const [calculationMethods, setCalculationMethods] = useState<CalculationMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [cityTab, setCityTab] = useState<'turkey' | 'world'>('turkey');

  useEffect(() => {
    loadSettings();
    fetchCities();
    fetchMethods();
  }, []);

  const loadSettings = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('language');
      const savedTheme = await AsyncStorage.getItem('theme');
      const savedNotifications = await AsyncStorage.getItem('notifications');
      const savedCity = await AsyncStorage.getItem('selectedCity');
      const savedMethod = await AsyncStorage.getItem('calculationMethod');

      if (savedLanguage) setLanguage(savedLanguage);
      if (savedTheme) setTheme(savedTheme);
      if (savedNotifications !== null) setNotificationsEnabled(savedNotifications === 'true');
      if (savedCity) setSelectedCity(JSON.parse(savedCity));
      if (savedMethod) setCalculationMethod(JSON.parse(savedMethod));
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCities = async () => {
    try {
      const [turkeyRes, worldRes] = await Promise.all([
        axios.get(`${API_URL}/api/cities/turkey`),
        axios.get(`${API_URL}/api/cities/world`),
      ]);

      if (turkeyRes.data.success) setTurkishCities(turkeyRes.data.data);
      if (worldRes.data.success) setWorldCities(worldRes.data.data);
    } catch (err) {
      console.error('Error fetching cities:', err);
    }
  };

  const fetchMethods = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/calculation-methods`);
      if (response.data.success) {
        setCalculationMethods(response.data.data);
        // Set default method if not set
        if (!calculationMethod) {
          const defaultMethod = response.data.data.find((m: CalculationMethod) => m.id === 13);
          if (defaultMethod) {
            setCalculationMethod(defaultMethod);
            await AsyncStorage.setItem('calculationMethod', JSON.stringify(defaultMethod));
          }
        }
      }
    } catch (err) {
      console.error('Error fetching methods:', err);
    }
  };

  const saveLanguage = async (lang: string) => {
    setLanguage(lang);
    await AsyncStorage.setItem('language', lang);
    setShowLanguageModal(false);
  };

  const saveCity = async (city: City) => {
    setSelectedCity(city);
    await AsyncStorage.setItem('selectedCity', JSON.stringify(city));
    setShowCityModal(false);
  };

  const saveMethod = async (method: CalculationMethod) => {
    setCalculationMethod(method);
    await AsyncStorage.setItem('calculationMethod', JSON.stringify(method));
    setShowMethodModal(false);
  };

  const toggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('notifications', value.toString());
  };

  const useCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const [address] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      const currentCity: City = {
        name: address?.city || address?.subregion || 'Mevcut Konum',
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };

      await saveCity(currentCity);
    } catch (err) {
      console.error('Location error:', err);
    }
  };

  const getLanguageName = () => {
    return LANGUAGES.find(l => l.code === language)?.nameLocal || 'Türkçe';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Ayarlar</Text>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>KONUM</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={useCurrentLocation}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#4CAF50' }]}>
                <Ionicons name="locate" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.settingText}>Mevcut Konumu Kullan</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={() => setShowCityModal(true)}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#2196F3' }]}>
                <Ionicons name="business" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.settingText}>Şehir Seç</Text>
                {selectedCity && (
                  <Text style={styles.settingSubtext}>{selectedCity.name}</Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Prayer Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>NAMAZ AYARLARI</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={() => setShowMethodModal(true)}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#D4AF37' }]}>
                <Ionicons name="calculator" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.settingText}>Hesaplama Metodu</Text>
                {calculationMethod && (
                  <Text style={styles.settingSubtext}>{calculationMethod.name_tr}</Text>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BİLDİRİMLER</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#FF9800' }]}>
                <Ionicons name="notifications" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.settingText}>Ezan Bildirimleri</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: '#3D3D5C', true: '#D4AF37' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DİL</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={() => setShowLanguageModal(true)}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#9C27B0' }]}>
                <Ionicons name="language" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.settingText}>Uygulama Dili</Text>
                <Text style={styles.settingSubtext}>{getLanguageName()}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>HAKKINDA</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <View style={[styles.iconContainer, { backgroundColor: '#607D8B' }]}>
                <Ionicons name="information-circle" size={20} color="#FFFFFF" />
              </View>
              <View>
                <Text style={styles.settingText}>Versiyon</Text>
                <Text style={styles.settingSubtext}>1.0.0</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Namaz Vakitleri</Text>
          <Text style={styles.footerSubtext}>Tüm vakitler yaklaşık değerlerdir</Text>
        </View>
      </ScrollView>

      {/* Language Modal */}
      <Modal
        visible={showLanguageModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dil Seçin</Text>
              <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    language === item.code && styles.modalItemSelected,
                  ]}
                  onPress={() => saveLanguage(item.code)}
                >
                  <Text style={styles.modalItemText}>{item.nameLocal}</Text>
                  <Text style={styles.modalItemSubtext}>{item.name}</Text>
                  {language === item.code && (
                    <Ionicons name="checkmark" size={20} color="#D4AF37" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* City Modal */}
      <Modal
        visible={showCityModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCityModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Şehir Seçin</Text>
              <TouchableOpacity onPress={() => setShowCityModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            
            {/* City Tabs */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tab, cityTab === 'turkey' && styles.tabActive]}
                onPress={() => setCityTab('turkey')}
              >
                <Text style={[styles.tabText, cityTab === 'turkey' && styles.tabTextActive]}>
                  Türkiye
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, cityTab === 'world' && styles.tabActive]}
                onPress={() => setCityTab('world')}
              >
                <Text style={[styles.tabText, cityTab === 'world' && styles.tabTextActive]}>
                  Dünya
                </Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={cityTab === 'turkey' ? turkishCities : worldCities}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    selectedCity?.name === item.name && styles.modalItemSelected,
                  ]}
                  onPress={() => saveCity(item)}
                >
                  <View>
                    <Text style={styles.modalItemText}>{item.name}</Text>
                    {item.country && (
                      <Text style={styles.modalItemSubtext}>{item.country}</Text>
                    )}
                  </View>
                  {selectedCity?.name === item.name && (
                    <Ionicons name="checkmark" size={20} color="#D4AF37" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Calculation Method Modal */}
      <Modal
        visible={showMethodModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMethodModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Hesaplama Metodu</Text>
              <TouchableOpacity onPress={() => setShowMethodModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={calculationMethods}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.modalItem,
                    calculationMethod?.id === item.id && styles.modalItemSelected,
                  ]}
                  onPress={() => saveMethod(item)}
                >
                  <View style={styles.methodItem}>
                    <Text style={styles.modalItemText}>{item.name_tr}</Text>
                    <Text style={styles.modalItemSubtext}>{item.name}</Text>
                  </View>
                  {calculationMethod?.id === item.id && (
                    <Ionicons name="checkmark" size={20} color="#D4AF37" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: '#8E8E93',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: 1,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  settingText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  settingSubtext: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    alignItems: 'center',
    padding: 30,
    marginTop: 20,
  },
  footerText: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: '600',
  },
  footerSubtext: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A2E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D44',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  modalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D44',
  },
  modalItemSelected: {
    backgroundColor: '#2D2D44',
  },
  modalItemText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  modalItemSubtext: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  methodItem: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2D2D44',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#D4AF37',
  },
  tabText: {
    color: '#8E8E93',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#D4AF37',
  },
});
