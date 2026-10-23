import { T, inputStyle, captionStyle } from '../../theme';
import { Icon } from '../../components/ui';
import { STORE_PASSWORD_MAX, STORE_PASSWORD_MIN } from './storeForm';

// ===== ชิ้นส่วนฟอร์มร้านค้า =====
export function FormSectionTitle({ icon, children }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', margin: '20px 0 12px', color: T.muted, fontSize: '13px', fontWeight: 600 }}>
            <Icon name={icon} size={16} color={T.primary}/>
            {children}
        </div>
    );
}

export function IconInput({ icon, style, ...props }) {
    return (
        <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: T.muted, display: 'grid', pointerEvents: 'none' }}>
                <Icon name={icon} size={16}/>
            </span>
            <input {...props} style={{ ...inputStyle, paddingLeft: '38px', ...style }}/>
        </div>
    );
}

export function PasswordField({ value, onChange, show, onToggle, placeholder }) {
    return (
        <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: T.muted, display: 'grid', pointerEvents: 'none' }}>
                <Icon name="lock" size={16}/>
            </span>
            <input type={show ? 'text' : 'password'} value={value} onChange={onChange} maxLength={STORE_PASSWORD_MAX} autoComplete="new-password" placeholder={placeholder} style={{ ...inputStyle, paddingLeft: '38px', paddingRight: '44px' }}/>
            <button type="button" onClick={onToggle} tabIndex={-1} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', padding: '6px', cursor: 'pointer', color: T.muted, display: 'grid', placeItems: 'center' }}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={17}/>
            </button>
        </div>
    );
}

export function PasswordChecklist({ password, confirm }) {
    const checks = [
        [password.length >= STORE_PASSWORD_MIN, `อย่างน้อย ${STORE_PASSWORD_MIN} ตัวอักษร`],
        [password.length > 0 && !/\s/.test(password), 'ไม่มีช่องว่าง'],
        [password.length > 0 && password === confirm, 'ยืนยันรหัสผ่านตรงกัน']
    ];
    return (
        <div style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', margin: '-4px 0 6px' }}>
            {checks.map(([ok, label]) => (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: ok ? T.up : T.muted }}>
                    <Icon name={ok ? 'check' : 'info'} size={13}/>
                    {label}
                </span>
            ))}
        </div>
    );
}

// การ์ดตำแหน่งเจ้าของร้าน (เลือกไว้แล้ว)
export function OwnerRoleCard() {
    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', borderRadius: '14px', border: `1.5px solid ${T.primary}`, background: T.primarySoft, marginBottom: '14px' }}>
            <span style={{ width: '40px', height: '40px', borderRadius: '10px', background: T.surface, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name="store" size={20} color={T.primary}/>
            </span>
            <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: T.ink, fontSize: '14px', fontWeight: 700 }}>เจ้าของร้าน</strong>
                <span style={{ ...captionStyle, display: 'block' }}>จัดการเมนู พนักงาน และดูยอดขายของร้านนี้</span>
            </span>
            <span style={{ position: 'absolute', top: '10px', right: '10px', width: '20px', height: '20px', borderRadius: '50%', background: T.primary, display: 'grid', placeItems: 'center' }}>
                <Icon name="check" size={12} color="#FFFFFF" strokeWidth={3}/>
            </span>
        </div>
    );
}
