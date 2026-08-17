import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/infrastructure/sqlite/schema.ts',
  out: './drizzle',
});
