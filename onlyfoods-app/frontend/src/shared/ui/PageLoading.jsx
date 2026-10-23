import { useEffect, useState } from 'react';

// ระหว่างโหลดไฟล์ของหน้า (ครั้งแรกหลัง login) : เกิน delay ms ถึงแสดงวงหมุน (โหลดเร็ว = ไม่กระพริบ)
export default function PageLoading({ delay = 250, text = 'กำลังโหลด...' }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  if (!show) return null;
  return (
    <div role="status" aria-live="polite" style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px',
      background: '#F8FAFC', color: '#64748B', fontFamily: "'Sarabun', system-ui, sans-serif", fontSize: '14px',
    }}>
      <style>{'@keyframes pageLoadingSpin { to { transform: rotate(360deg); } }'}</style>
      <span aria-hidden="true" style={{
        width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #FFE3C6', borderTopColor: '#FF6B00',
        animation: 'pageLoadingSpin 0.8s linear infinite',
      }} />
      {text}
    </div>
  );
}
