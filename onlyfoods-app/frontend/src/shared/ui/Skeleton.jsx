// โครงสีเทาระหว่างโหลดข้อมูลครั้งแรก (แทนตัวเลข 0 / ข้อความ "กำลังโหลด...")
// กลับเข้าหน้าเดิมจะไม่เห็นอีก เพราะข้อมูลรอบล่าสุดจำไว้ใน lib/apiCache
const SKELETON_CSS = `
.of-skel { display: block; border-radius: 6px; background: linear-gradient(90deg, #EEF0F5 0%, #F7F8FB 45%, #EEF0F5 90%); background-size: 200% 100%; animation: ofSkel 1.3s ease-in-out infinite; }
@keyframes ofSkel { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .of-skel { animation: none; } }
`;

export function SkeletonStyles() {
  return <style>{SKELETON_CSS}</style>;
}

export function Skeleton({ width = '100%', height = 14, radius = 6, style }) {
  return <span className="of-skel" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

// แถวโครงสำหรับตาราง/รายการ : columns = สัดส่วนความกว้างของแต่ละช่อง
export function SkeletonRows({ rows = 5, columns = [2, 3, 2, 1], gap = 14, padding = '14px 16px', label = 'กำลังโหลดข้อมูล' }) {
  return (
    <div role="status" aria-label={label}>
      <SkeletonStyles />
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'flex', gap, alignItems: 'center', padding, borderBottom: '1px solid #EEF0F5' }}>
          {columns.map((flex, c) => (
            <span key={c} style={{ flex, minWidth: 0 }}>
              <Skeleton height={12} width={`${70 + ((r * 7 + c * 13) % 30)}%`} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
