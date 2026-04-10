import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'store.ivapps.galloli',
  appName: 'GallOli',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#4CAF50',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#4CAF50'
    }
  }
};

export default config;
