import { defineConfig } from 'vite';

// Dev server settings for Google Cloud Shell Web Preview:
// it proxies https://8080-<id>.cloudshell.dev -> localhost:8080
export default defineConfig({
  base: './', // relative paths so the build works from any folder
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    allowedHosts: ['.cloudshell.dev'],
    hmr: { clientPort: 443 },
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    allowedHosts: ['.cloudshell.dev'],
  },
});
