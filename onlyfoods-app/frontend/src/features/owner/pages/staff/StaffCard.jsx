import { parseOrderDate } from '../../lib/dates';
import { timeAgo, formatPhone, thaiDateTime } from '../../lib/format';
import { Icon, Badge } from '../../components/ui';
import { staffRoleInfo, staffStatus } from './staffUtils';
import { StaffAvatar } from './StaffAvatar';

export function StaffCard({ staff, busy, onEdit, onResetPassword, onToggleActive, onErase }) {
  const info = staffRoleInfo(staff.Role);
  const status = staffStatus(staff);
  const lockedUntil = parseOrderDate(staff.LockedUntil);
  return (
    <article className={`sf-card ${status.key}`}>
      <div className="sf-card-top">
        <StaffAvatar name={staff.FullName} src={staff.ProfileImageUrl} id={staff.UserId} size={58} />
        <div className="sf-card-id">
          <div className="name" title={staff.FullName}>{staff.FullName}</div>
          <div className="user">@{staff.Username} · รหัส #{staff.UserId}</div>
          <div className="sf-badges">
            <Badge tone={info.tone}><Icon name={info.icon} size={13} /> {info.short}</Badge>
            <span className={`sf-status tone-${status.tone}`}><span className="dot" />{status.label}</span>
          </div>
        </div>
      </div>

      <dl className="sf-info">
        <div>
          <dt title="เบอร์โทร"><Icon name="phone" size={15} /></dt>
          <dd>{staff.Phone ? <a href={`tel:${staff.Phone}`}>{formatPhone(staff.Phone)}</a> : <span className="missing">ยังไม่มีเบอร์โทร</span>}</dd>
        </div>
        <div>
          <dt title="อีเมล"><Icon name="mail" size={15} /></dt>
          <dd>{staff.Email ? <a href={`mailto:${staff.Email}`} title={staff.Email}>{staff.Email}</a> : <span className="missing">ไม่ได้ระบุอีเมล</span>}</dd>
        </div>
        <div>
          <dt title="วันที่สร้างบัญชี"><Icon name="calendar" size={15} /></dt>
          <dd title={`สร้างบัญชี ${thaiDateTime(staff.CreatedAt, true)}${staff.CreatedByName ? ` โดย ${staff.CreatedByName}` : ''}`}>
            สร้างบัญชี {thaiDateTime(staff.CreatedAt)}
            {staff.CreatedByName && <span className="by"> · โดย {staff.CreatedByName}</span>}
          </dd>
        </div>
      </dl>

      <div className="sf-activity">
        <div>
          <strong>{staff.OrdersToday}</strong>
          <span>ออเดอร์ที่ดำเนินการวันนี้</span>
        </div>
        <div title={staff.LastActiveAt ? thaiDateTime(staff.LastActiveAt, true) : ''}>
          <strong>{staff.LastActiveAt ? timeAgo(staff.LastActiveAt) : '—'}</strong>
          <span>อัปเดตออเดอร์ล่าสุด</span>
        </div>
      </div>

      {status.key === 'locked' && (
        <div className="sf-lock-note">
          <Icon name="lock" size={16} />
          <span>ใส่รหัสผ่านผิดหลายครั้ง ล็อกถึง {lockedUntil ? lockedUntil.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '-'} น. · รีเซ็ตรหัสผ่านเพื่อปลดล็อกทันที</span>
        </div>
      )}

      <div className="sf-card-actions">
        {staff.IsActive ? (
          <>
            <button type="button" className="sf-act" onClick={onEdit} disabled={busy}><Icon name="edit" size={15} /> แก้ไข</button>
            <button type="button" className="sf-act" onClick={onResetPassword} disabled={busy}><Icon name="key" size={15} /> รีเซ็ตรหัสผ่าน</button>
            <button type="button" className="sf-act danger icon-only" onClick={onToggleActive} disabled={busy} title="ปิดใช้งานบัญชี" aria-label={`ปิดใช้งานบัญชี ${staff.FullName}`}>
              <Icon name="power" size={16} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className="sf-act success" onClick={onToggleActive} disabled={busy}>
              {busy ? <span className="berry-spinner" /> : <Icon name="power" size={15} />} เปิดใช้งานอีกครั้ง
            </button>
            <button type="button" className="sf-act danger icon-only" onClick={onErase} disabled={busy} title="ลบถาวร" aria-label={`ลบบัญชี ${staff.FullName} ถาวร`}>
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
    </article>
  );
}
