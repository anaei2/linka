import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.almeida.chat',
  appName: 'Almeida Chat',
  webDir: 'www',
  server: {
    url: 'https://almeida-chat.onrender.com/',
    cleartext: false
  },
  android: {
    allowMixedContent: false
  }
};

export default config;
