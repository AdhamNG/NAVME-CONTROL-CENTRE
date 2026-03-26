import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    /** If 3001 is taken, exit instead of hopping ports — avoids "failed to fetch" when the app/proxy origin doesn't match. */
    strictPort: true,
    https: false,
    proxy: {
      '/api/multiset': {
        target: 'https://api.multiset.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/multiset/, ''),
        secure: true,
      },
      // Proxy to bypass S3 CORS for mesh downloads
      '/s3-proxy': {
        target: 'https://prod-multiset.s3-accelerate.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/s3-proxy/, ''),
        secure: true,
      },
    },
  },
  build: {
    target: 'esnext',
  },
});
