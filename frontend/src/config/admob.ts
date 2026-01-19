import { Platform } from 'react-native';

// AdMob ID'leri
export const ADMOB_CONFIG = {
  APP_ID: 'ca-app-pub-7614997391820254~2717321696',
  BANNER_AD_UNIT_ID: Platform.select({
    android: 'ca-app-pub-7614997391820254/9679968256',
    ios: 'ca-app-pub-7614997391820254/9679968256',
    default: '',
  }),
  INTERSTITIAL_AD_UNIT_ID: Platform.select({
    android: 'ca-app-pub-7614997391820254/3881040185',
    ios: 'ca-app-pub-7614997391820254/3881040185',
    default: '',
  }),
};

// Test ID'leri (geliştirme sırasında kullanılabilir)
export const TEST_ADMOB_CONFIG = {
  BANNER_AD_UNIT_ID: Platform.select({
    android: 'ca-app-pub-3940256099942544/6300978111',
    ios: 'ca-app-pub-3940256099942544/2934735716',
    default: '',
  }),
  INTERSTITIAL_AD_UNIT_ID: Platform.select({
    android: 'ca-app-pub-3940256099942544/1033173712',
    ios: 'ca-app-pub-3940256099942544/4411468910',
    default: '',
  }),
};

// Geliştirme modunda test ID'leri, production'da gerçek ID'ler
export const getAdUnitId = (type: 'banner' | 'interstitial', useTestAds: boolean = false) => {
  if (useTestAds || __DEV__) {
    return type === 'banner' 
      ? TEST_ADMOB_CONFIG.BANNER_AD_UNIT_ID 
      : TEST_ADMOB_CONFIG.INTERSTITIAL_AD_UNIT_ID;
  }
  return type === 'banner' 
    ? ADMOB_CONFIG.BANNER_AD_UNIT_ID 
    : ADMOB_CONFIG.INTERSTITIAL_AD_UNIT_ID;
};
