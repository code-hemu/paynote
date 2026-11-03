import { defineConfig } from '@guchho/test'

export default defineConfig({
  include: ['src/**/*.test.{ts,tsx}'],
  environment: 'node',
  setupFilesAfterEnv: ['./src/test/setup.ts'],
  tsconfig: './tsconfig.test.json',
  reporters: ['default'],
})
