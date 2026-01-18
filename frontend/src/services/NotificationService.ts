import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Conditionally import expo-notifications
let Notifications: any = null;
let Device: any = null;

if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
}

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

  async initialize(): Promise<boolean> {
    if (Platform.OS === 'web' || !Notifications || !Device) {
      console.log('Notifications not available on this platform');
      return false;
    }

    try {
      // Load saved config
      await this.loadConfig();

      // Request permissions
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.log('Notification permission denied');
          return false;
        }
      }

      // Configure notification handler
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: this.config.sound !== 'silent',
          shouldSetBadge: true,
        }),
      });

      // Set up notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('prayer-times', {
          name: 'Prayer Times',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#D4AF37',
          sound: this.config.sound === 'azan' ? 'azan.wav' : undefined,
        });
      }

      return true;
    } catch (error) {
      console.error('Error initializing notifications:', error);
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
      console.error('Error loading notification config:', error);
    }
  }

  async saveConfig(config: Partial<NotificationConfig>): Promise<void> {
    try {
      this.config = { ...this.config, ...config };
      await AsyncStorage.setItem('notificationConfig', JSON.stringify(this.config));
    } catch (error) {
      console.error('Error saving notification config:', error);
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
    if (Platform.OS === 'web' || !Notifications || !this.config.enabled) {
      return;
    }

    try {
      // Cancel all existing notifications
      await Notifications.cancelAllScheduledNotificationsAsync();

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

        await Notifications.scheduleNotificationAsync({
          content: {
            title: prayer.title,
            body: translations.prayerTime,
            sound: this.config.sound === 'azan' ? 'azan.wav' : true,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          },
          trigger: {
            hour: hours,
            minute: minutes,
            repeats: false,
          },
        });
      }

      console.log('Prayer notifications scheduled successfully');
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    if (Platform.OS === 'web' || !Notifications) {
      return;
    }

    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error canceling notifications:', error);
    }
  }
}

export const notificationService = new NotificationService();
