import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
  const base = repository ? `/${repository}/` : '/'

  return {
    base,
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
    },
  }
})
