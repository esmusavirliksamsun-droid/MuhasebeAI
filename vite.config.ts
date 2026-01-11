
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // API Anahtarı
    'process.env.API_KEY': JSON.stringify("AIzaSyB-Ctit_-i2pR3NIUwrv2ldc2TuYd3ZpKw"),
    // Harici kütüphanelerin 'process is not defined' hatası vermesini engeller
    'process.env': {}
  }
});
