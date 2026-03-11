import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.galloli.app',
  appName: 'GallOli',
  webDir: './',
  // Para desarrollo con Lovable (hot-reload):
  // server: {
  //   url: 'https://TU-ID.lovableproject.com?forceHideBadge=true',
  //   cleartext: true,
  // },
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#4CAF50',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#4CAF50'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#4CAF50'
    }
  }
};

export default config;