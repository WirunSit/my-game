import { defineConfig } from 'vite';

// Google Cloud Shell sets CLOUD_SHELL=true. Its Web Preview proxies
// https://8080-<id>.cloudshell.dev -> localhost:8080, so the live-reload socket
// must connect through port 443. On a normal PC, Vite's defaults work as-is.
const inCloudShell = process.env.CLOUD_SHELL === 'true';

export default defineConfig({
  base: './', // relative paths so the build works from any folder
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    allowedHosts: ['.cloudshell.dev'],
    hmr: inCloudShell ? { clientPort: 443 } : true,
    // The server (npm run dev starts it on 8081) answers /api and /ws; forwarding
    // keeps everything on one port, which is all Cloud Shell's Web Preview shows
    proxy: {
      '/api': 'http://localhost:8081',
      '/ws': { target: 'ws://localhost:8081', ws: true },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: ['.cloudshell.dev'],
  },
});
