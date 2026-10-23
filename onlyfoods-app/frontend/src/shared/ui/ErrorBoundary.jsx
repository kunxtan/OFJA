import { Component } from 'react';
import { isChunkLoadError, reloadOnceForNewVersion } from '../../lib/chunkReload';

// ข้อผิดพลาดระหว่าง render ไม่ทำให้ทั้งแอปกลายเป็นหน้าขาว : แสดงข้อความ + ปุ่มโหลดใหม่แทน
// โหลดไฟล์ของหน้าไม่ได้ (มี deploy ใหม่) = รีโหลดให้เองก่อน 1 ครั้ง
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error(error);
    if (isChunkLoadError(error)) reloadOnceForNewVersion();
  }

  render() {
    if (!this.state.error) return this.props.children;
    const update = isChunkLoadError(this.state.error);
    return (
      <div role="alert" style={{
        minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '24px', boxSizing: 'border-box',
        background: '#F8FAFC', fontFamily: "'Sarabun', system-ui, sans-serif", color: '#1E293B', textAlign: 'center',
      }}>
        <div style={{ maxWidth: '360px' }}>
          <div style={{ fontSize: '40px' }}>{update ? '🔄' : '⚠️'}</div>
          <h2 style={{ margin: '12px 0 6px', fontSize: '20px' }}>
            {update ? 'มีระบบเวอร์ชันใหม่' : 'หน้านี้แสดงผลไม่สำเร็จ'}
          </h2>
          <p style={{ margin: '0 0 18px', color: '#64748B', fontSize: '14px', lineHeight: 1.6 }}>
            {update ? 'กรุณาโหลดหน้าใหม่เพื่อใช้งานเวอร์ชันล่าสุด' : 'ลองโหลดหน้าใหม่อีกครั้ง หากยังพบปัญหา กรุณาแจ้งผู้ดูแลระบบ'}
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{
            padding: '12px 22px', border: 'none', borderRadius: '12px', background: '#FF6B00', color: '#FFFFFF',
            fontFamily: 'inherit', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
          }}>
            โหลดหน้าใหม่
          </button>
        </div>
      </div>
    );
  }
}
