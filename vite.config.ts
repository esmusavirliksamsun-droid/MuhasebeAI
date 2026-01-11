
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // API Anahtarı doğrudan koda gömüldü (İsteğiniz üzerine)
    'process.env.API_KEY': JSON.stringify("AIzaSyB-Ctit_-i2pR3NIUwrv2ldc2TuYd3ZpKw")
  }
});
