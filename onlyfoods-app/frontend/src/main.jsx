import React from 'react'
import ReactDOM from 'react-dom/client'
import './authFetch.js'
import { bootstrapTabSession } from './lib/tabSync'
import App from './App.jsx'
import ErrorBoundary from './shared/ui/ErrorBoundary'
import { reloadOnceForNewVersion } from './lib/chunkReload'

// Vite แจ้งเมื่อโหลดไฟล์ของหน้า (import แบบ lazy) ไม่ได้ เช่นแท็บที่เปิดค้างไว้ก่อน deploy
// รีโหลดเองได้ = กันไม่ให้ error หลุดไปถึงหน้าจอ ; รีโหลดไม่ได้ (เพิ่งรีโหลดไป) = ปล่อยให้ ErrorBoundary แสดงข้อความ
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForNewVersion()) event.preventDefault()
})

// แท็บใหม่ขณะมีแท็บอื่นล็อกอินอยู่ : รับเซสชันก่อนแสดงหน้าแรก (เข้าระบบเลย ไม่เห็นหน้า login แวบ) ; อย่างอื่นแสดงทันที
bootstrapTabSession().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  )
})
