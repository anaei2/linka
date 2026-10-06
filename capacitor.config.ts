import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.linka.chat',
  appName: 'Linka',
  webDir: 'www',
  server: {
    url: 'https://linka-8llq.onrender.com/',
    cleartext: false
  }
};

export default config;
