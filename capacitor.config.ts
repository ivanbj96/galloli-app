import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'store.ivapps.galloli',
  appName: 'GallOli',
  webDir: '.',
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
    },
    BluetoothLe: {
      displayStrings: {
        scanning: 'Buscando balanza...',
        cancel: 'Cancelar',
        availableDevices: 'Balanzas disponibles',
        noDeviceFound: 'No se encontro ninguna balanza'
      }
    }
  }
};

export default config;
