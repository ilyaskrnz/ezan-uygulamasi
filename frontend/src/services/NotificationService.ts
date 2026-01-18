import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PrayerNotificationSettings {
  fajr: boolean;
  sunrise: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
}

export interface NotificationConfig {
  enabled: boolean;
  sound: 'default' | 'azan' | 'silent';
  prayerSettings: PrayerNotificationSettings;
}

const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  sound: 'default',
  prayerSettings: {
    fajr: true,
    sunrise: false,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  },
};

class NotificationService {
  private config: NotificationConfig = DEFAULT_CONFIG;
  private Notifications: any = null;
  private Device: any = null;
  private initialized: boolean = false;

  async initialize(): Promise<boolean> {
    if (Platform.OS === 'web') {
      console.log('Notifications not available on web');
      return false;
    }

    try {
      // Load saved config
      await this.loadConfig();

      // Dynamic import for native only
      try {
        this.Notifications = require('expo-notifications');
        this.Device = require('expo-device');
      } catch (e) {
        console.log('expo-notifications not available');
        return false;
      }

      // Check if device is physical (notifications don't work on simulators)
      if (!this.Device?.isDevice) {
        console.log('Must use physical device for notifications');
        return false;
      }

      // Request permissions
      const { status: existingStatus } = await this.Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await this.Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Notification permission denied');
        return false;
      }

      // Configure notification handler
      this.Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: this.config.sound !== 'silent',
          shouldSetBadge: false,
        }),
      });

      this.initialized = true;
      console.log('Notifications initialized successfully');
      return true;
    } catch (error) {
      console.log('Error initializing notifications:', error);
      return false;
    }
  }

  async loadConfig(): Promise<void> {
    try {
      const savedConfig = await AsyncStorage.getItem('notificationConfig');
      if (savedConfig) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) };
      }
    } catch (error) {
      console.log('Error loading notification config:', error);
    }
  }

  async saveConfig(config: Partial<NotificationConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...config };
      await AsyncStorage.setItem('notificationConfig', JSON.stringify(this.config));
    } catch (error) {
      console.log('Error saving notification config:', error);
    }
  }

  getConfig(): NotificationConfig {
    return this.config;
  }

  async schedulePrayerNotifications(
    prayerTimes: {
      fajr: string;
      sunrise: string;
      dhuhr: string;
      asr: string;
      maghrib: string;
      isha: string;
    },
    translations: {
      fajrTitle: string;
      sunriseTitle: string;
      dhuhrTitle: string;
      asrTitle: string;
      maghribTitle: string;
      ishaTitle: string;
      prayerTime: string;
    }
  ): Promise<void> {
    if (Platform.OS === 'web' || !this.initialized || !this.Notifications || !this.config.enabled) {
      return;
    }

    try {
      // Cancel all existing notifications
      await this.Notifications.cancelAllScheduledNotificationsAsync();

      const prayers = [
        { key: 'fajr', time: prayerTimes.fajr, title: translations.fajrTitle },
        { key: 'sunrise', time: prayerTimes.sunrise, title: translations.sunriseTitle },
        { key: 'dhuhr', time: prayerTimes.dhuhr, title: translations.dhuhrTitle },
        { key: 'asr', time: prayerTimes.asr, title: translations.asrTitle },
        { key: 'maghrib', time: prayerTimes.maghrib, title: translations.maghribTitle },
        { key: 'isha', time: prayerTimes.isha, title: translations.ishaTitle },
      ];

      const now = new Date();

      for (const prayer of prayers) {
        const prayerKey = prayer.key as keyof PrayerNotificationSettings;
        if (!this.config.prayerSettings[prayerKey]) {
          continue;
        }

        const [hours, minutes] = prayer.time.split(':').map(Number);
        const prayerDate = new Date();
        prayerDate.setHours(hours, minutes, 0, 0);

        // If prayer time has passed today, skip
        if (prayerDate <= now) {
          continue;
        }

        // Calculate seconds until prayer
        const secondsUntil = Math.floor((prayerDate.getTime() - now.getTime()) / 1000);

        if (secondsUntil > 0) {
          await this.Notifications.scheduleNotificationAsync({
            content: {
              title: prayer.title,
              body: translations.prayerTime,
              sound: true,
            },
            trigger: {
              seconds: secondsUntil,
            },
          });
        }
      }

      console.log('Prayer notifications scheduled successfully');
    } catch (error) {
      console.log('Error scheduling notifications:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    if (Platform.OS === 'web' || !this.Notifications) {
      return;
    }

    try {
      await this.Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.log('Error canceling notifications:', error);
    }
  }
}

export const notificationService = new NotificationService();
