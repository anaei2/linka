import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.almeida.chat',
  appName: 'Linka',
  webDir: 'www',
  server: {
    url: 'https://linka.onrender.com/',
    cleartext: false
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
