import { phoneDigits } from '../../lib/format';
import { PageHeader, Icon, Skeleton } from '../../components/ui';
import { StaffCard } from './StaffCard';

// หน้าจัดการพนักงาน : หน้าร้าน/ครัว เพิ่ม แก้ รีเซ็ตรหัส ปิดใช้งาน ลบถาวร
// ข้อมูลและ state อยู่ที่ OwnerView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function StaffPage({
  staffList, staffSearch, staffFilter, setStaffModal, loaded, setStaffFilter, setStaffSearch, staffBusyId,
  setPasswordStaff, askDeactivateStaff, setStaffActive, setEraseStaff
}) {
  const activeStaff = staffList.filter(s => s.IsActive);
  const counts = {
    all: activeStaff.length,
    front: activeStaff.filter(s => s.Role === 'Front Staff').length,
    kitchen: activeStaff.filter(s => s.Role === 'Kitchen Staff').length,
    inactive: staffList.length - activeStaff.length,
  };
  const workingToday = activeStaff.filter(s => s.OrdersToday > 0).length;
  const lockedCount = activeStaff.filter(s => s.IsLocked).length;
  const tabs = [
    { id: 'all', label: 'ทั้งหมด', count: counts.all },
    { id: 'front', label: 'หน้าร้าน', count: counts.front },
    { id: 'kitchen', label: 'ครัว', count: counts.kitchen },
    { id: 'inactive', label: 'ปิดใช้งาน', count: counts.inactive, tone: 'red' },
  ];
  const q = staffSearch.trim().toLowerCase();
  const qDigits = phoneDigits(q);
  const shown = staffList
    .filter(s => (staffFilter === 'inactive' ? !s.IsActive : s.IsActive))
    .filter(s => staffFilter === 'front' ? s.Role === 'Front Staff' : staffFilter === 'kitchen' ? s.Role === 'Kitchen Staff' : true)
    .filter(s => !q
      || [s.FullName, s.Username, s.Email].some(v => String(v || '').toLowerCase().includes(q))
      || (/^\d+$/.test(qDigits) && String(s.Phone || '').includes(qDigits)));
  const stats = [
    { tone: 'orange', icon: 'users', value: counts.all, label: 'พนักงานที่ใช้งานอยู่' },
    { tone: 'blue', icon: 'receipt', value: counts.front, label: 'พนักงานหน้าร้าน' },
    { tone: 'amber', icon: 'flame', value: counts.kitchen, label: 'พนักงานครัว' },
    { tone: 'green', icon: 'activity', value: workingToday, label: 'ทำรายการวันนี้', sub: lockedCount ? `บัญชีถูกล็อก ${lockedCount} คน` : null },
  ];
  return (
    <>
      <PageHeader title="จัดการพนักงาน" subtitle={`พนักงานหน้าร้านและพนักงานครัวของร้าน · ใช้งานอยู่ ${counts.all} คน`} icon="users">
        <button className="berry-btn btn-primary" onClick={() => setStaffModal({ mode: 'add' })}>
          <Icon name="plus" size={16} /> เพิ่มพนักงาน
        </button>
      </PageHeader>

      <div className="sf-stats">
        {stats.map(st => (
          <div key={st.label} className={`sf-stat tone-${st.tone}`}>
            <span className="icon"><Icon name={st.icon} size={20} /></span>
            <div>
              <div className="value">{loaded.staff ? st.value : <Skeleton height={22} width={36} />}</div>
              <div className="label">{st.label}</div>
              {st.sub && <div className="sub">{st.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="mm-toolbar mm-wrap-tabs">
        <div className="mm-tabs" role="tablist" aria-label="กรองพนักงาน">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={staffFilter === t.id}
              onClick={() => setStaffFilter(t.id)}
              className={`mm-tab ${staffFilter === t.id ? 'active' : ''} ${t.tone ? `tone-${t.tone}` : ''}`}
            >
              {t.tone && <span className="dot" />}
              {t.label}
              <span className="count">{t.count}</span>
            </button>
          ))}
        </div>
        <div className="mm-search">
          <Icon name="search" size={16} />
          <input value={staffSearch} onChange={e => setStaffSearch(e.target.value)} placeholder="ค้นหาชื่อ ชื่อผู้ใช้ เบอร์โทร หรืออีเมล..." aria-label="ค้นหาพนักงาน" />
          {staffSearch && (
            <button type="button" onClick={() => setStaffSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>
          )}
        </div>
      </div>

      {!loaded.staff ? (
        <div className="sf-grid">
          {[0, 1, 2].map(i => <Skeleton key={i} height={330} radius={16} />)}
        </div>
      ) : shown.length === 0 ? (
        <div className="sf-empty">
          <span className="icon"><Icon name={q ? 'search' : 'users'} size={28} /></span>
          <h3>
            {q ? 'ไม่พบพนักงานที่ตรงกับการค้นหา'
              : staffFilter === 'inactive' ? 'ไม่มีบัญชีที่ปิดใช้งาน'
              : staffList.length === 0 ? 'ยังไม่มีพนักงานในร้าน' : 'ไม่มีพนักงานในกลุ่มนี้'}
          </h3>
          <p>
            {q ? 'ลองค้นด้วยชื่อ ชื่อผู้ใช้ หรือเบอร์โทรอื่น'
              : staffFilter === 'inactive' ? 'พนักงานที่ถูกปิดใช้งานจะแสดงที่นี่ และเปิดใช้งานกลับได้'
              : 'เพิ่มบัญชีให้พนักงานหน้าร้านหรือพนักงานครัว เพื่อให้เข้าระบบรับออเดอร์ได้'}
          </p>
          {!q && staffFilter !== 'inactive' && (
            <button className="berry-btn btn-primary" onClick={() => setStaffModal({ mode: 'add' })}>
              <Icon name="plus" size={16} /> เพิ่มพนักงาน
            </button>
          )}
        </div>
      ) : (
        <div className="sf-grid">
          {shown.map(s => (
            <StaffCard
              key={s.UserId}
              staff={s}
              busy={staffBusyId === s.UserId}
              onEdit={() => setStaffModal({ mode: 'edit', staff: s })}
              onResetPassword={() => setPasswordStaff(s)}
              onToggleActive={() => (s.IsActive ? askDeactivateStaff(s) : setStaffActive(s, true))}
              onErase={() => setEraseStaff(s)}
            />
          ))}
        </div>
      )}
    </>
  );
}
