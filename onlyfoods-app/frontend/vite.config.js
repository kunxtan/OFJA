import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // npm test : ฟังก์ชันคำนวณ (ไม่มี UI) ; เวลาไทยเสมอ ผลจึงไม่ขึ้นกับเครื่องที่รัน
  test: { include: ['src/**/*.test.js'], env: { TZ: 'Asia/Bangkok' } },
})
