import { useNow } from '../../../shared/hooks/useNow';

// แท็บจอเรียกคิวสำหรับลูกค้า
// ข้อมูลและ state อยู่ที่ CounterView ส่งมาเป็น props (แท็บไม่ดึงข้อมูลเอง)
export default function DisplayTab({
  setDisplaySound, displaySound, playChime, toggleDisplayFull, displayRef, displayFull, currentStore,
  displayCooking, displayReady, isFreshReady
}) {
  const nowTick = useNow(1000); // นาฬิกาบนจอ + ไฮไลต์คิวที่เพิ่งพร้อม
  return (
    <div className="cv-stack">
                  <div className="display-note">
                    <b>📺 หน้าจำลองจอเรียกคิว</b>
                    <span>ร้านจริงเปิดหน้านี้ค้างไว้บนทีวีหรือจอที่หันไปทางลูกค้า แสดงแค่เลขคิว ไม่แสดงชื่อหรือเบอร์โทร
                      · คิวที่เพิ่งพร้อมจะกระพริบ 10 วินาทีพร้อมเสียงเตือน แทนการตะโกนเรียก · ส่งมอบแล้วคิวหายจากจอเอง</span>
                    <div className="display-note-actions">
                      <button className="cv-btn btn-ghost" onClick={() => { setDisplaySound(v => !v); if (!displaySound) playChime(); }}>
                        {displaySound ? '🔔 เสียงเปิดอยู่' : '🔕 เสียงปิดอยู่'}
                      </button>
                      <button className="cv-btn btn-dark" onClick={toggleDisplayFull}>⛶ เปิดเต็มจอ</button>
                    </div>
                  </div>
                  <div ref={displayRef} className={`queue-display ${displayFull ? 'full' : ''}`}>
                    <div className="qd-head">
                      <span>{currentStore?.StoreName || 'ร้านค้า'}</span>
                      <span className="qd-clock">{new Date(nowTick).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })} น.</span>
                    </div>
                    <div className="qd-cols">
                      <section className="qd-col cooking">
                        <h4>🍳 กำลังทำ <span>{displayCooking.length}</span></h4>
                        <div className="qd-grid">
                          {displayCooking.length === 0 ? <div className="qd-empty">—</div> : displayCooking.map(o => (
                            <div key={o.OrderID} className="qd-num">{o.QueueNo}</div>
                          ))}
                        </div>
                      </section>
                      <section className="qd-col ready">
                        <h4>✅ พร้อมรับ <span>{displayReady.length}</span></h4>
                        <div className="qd-grid">
                          {displayReady.length === 0 ? <div className="qd-empty">ยังไม่มีคิวพร้อมรับ</div> : displayReady.map(o => (
                            <div key={o.OrderID} className={`qd-num ${isFreshReady(o) ? 'fresh' : ''}`}>{o.QueueNo}</div>
                          ))}
                        </div>
                      </section>
                    </div>
                    <div className="qd-foot">กรุณาแสดงเลขคิวที่หน้าเคาน์เตอร์เพื่อรับอาหาร</div>
                    {displayFull && <button className="qd-exit" onClick={toggleDisplayFull}>ออกจากเต็มจอ (Esc)</button>}
                  </div>
                </div>
  );
}
