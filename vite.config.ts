
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Vercel veya yerel ortamdaki değişkenleri yükle
  // Type assertion for process.cwd() because node types might be missing or incomplete in this context
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Kod içindeki process.env.API_KEY kullanımını Vercel'deki değerle değiştir
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  };
});
