import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';

// AdMob sadece native platformlarda çalışır
let BannerAd: any = null;
let BannerAdSize: any = null;
let InterstitialAd: any = null;
let AdEventType: any = null;
let TestIds: any = null;

// Native platformlarda AdMob'u import et
if (Platform.OS !== 'web') {
  try {
    const MobileAds = require('react-native-google-mobile-ads');
    BannerAd = MobileAds.BannerAd;
    BannerAdSize = MobileAds.BannerAdSize;
    InterstitialAd = MobileAds.InterstitialAd;
    AdEventType = MobileAds.AdEventType;
    TestIds = MobileAds.TestIds;
  } catch (e) {
    console.log('AdMob not available:', e);
  }
}

// AdMob ID'leri
const AD_UNIT_IDS = {
  BANNER: Platform.select({
    android: 'ca-app-pub-7614997391820254/9679968256',
    ios: 'ca-app-pub-7614997391820254/9679968256',
    default: '',
  }),
  INTERSTITIAL: Platform.select({
    android: 'ca-app-pub-7614997391820254/3881040185',
    ios: 'ca-app-pub-7614997391820254/3881040185',
    default: '',
  }),
};

// Banner Reklam Bileşeni
interface BannerAdComponentProps {
  style?: any;
}

export const BannerAdComponent: React.FC<BannerAdComponentProps> = ({ style }) => {
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);

  // Web'de veya AdMob yoksa placeholder göster
  if (Platform.OS === 'web' || !BannerAd) {
    return (
      <View style={[styles.bannerPlaceholder, style]}>
        <Text style={styles.placeholderText}>📢 Reklam Alanı</Text>
      </View>
    );
  }

  if (adError) {
    return null; // Hata durumunda hiçbir şey gösterme
  }

  return (
    <View style={[styles.bannerContainer, style]}>
      <BannerAd
        unitId={AD_UNIT_IDS.BANNER}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{
          requestNonPersonalizedAdsOnly: true,
        }}
        onAdLoaded={() => setAdLoaded(true)}
        onAdFailedToLoad={(error: any) => {
          console.log('Banner ad failed to load:', error);
          setAdError(true);
        }}
      />
    </View>
  );
};

// Interstitial Reklam Hook'u
let interstitialAd: any = null;
let interstitialLoaded = false;

export const useInterstitialAd = () => {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web' || !InterstitialAd) return;

    // Interstitial reklamı oluştur
    interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_IDS.INTERSTITIAL, {
      requestNonPersonalizedAdsOnly: true,
    });

    // Event listener'ları ekle
    const unsubscribeLoaded = interstitialAd.addAdEventListener(
      AdEventType.LOADED,
      () => {
        setLoaded(true);
        interstitialLoaded = true;
      }
    );

    const unsubscribeClosed = interstitialAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        setLoaded(false);
        interstitialLoaded = false;
        // Yeni reklam yükle
        interstitialAd.load();
      }
    );

    // Reklamı yükle
    interstitialAd.load();

    return () => {
      unsubscribeLoaded();
      unsubscribeClosed();
    };
  }, []);

  const showAd = async () => {
    if (Platform.OS === 'web' || !interstitialAd) {
      console.log('Interstitial ad not available on web');
      return false;
    }

    if (interstitialLoaded) {
      await interstitialAd.show();
      return true;
    }
    return false;
  };

  return { loaded, showAd };
};

// Interstitial reklamı gösterme fonksiyonu (sayfa geçişlerinde kullanılabilir)
export const showInterstitialAd = async (): Promise<boolean> => {
  if (Platform.OS === 'web' || !InterstitialAd) {
    return false;
  }

  try {
    if (interstitialAd && interstitialLoaded) {
      await interstitialAd.show();
      return true;
    }
  } catch (e) {
    console.log('Error showing interstitial:', e);
  }
  return false;
};

const styles = StyleSheet.create({
  bannerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  bannerPlaceholder: {
    height: 60,
    backgroundColor: 'rgba(0,191,166,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    marginHorizontal: 20,
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
});

export default BannerAdComponent;
