import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'readAssistant',
    description:
      'Turn hard foreign text into easier foreign text. Same language, no translation.',
    version: '0.1.0',
    permissions: ['storage', 'tabs'],
    host_permissions: ['https://api.deepseek.com/*'],
  },
});
