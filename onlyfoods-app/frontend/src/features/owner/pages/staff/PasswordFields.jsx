import { Icon } from '../../components/ui';
import { STAFF_PASSWORD_MAX, passwordChecks } from './staffUtils';

export function PasswordInput({ id, value, onChange, show, onToggleShow, invalid, disabled, placeholder, autoComplete = 'new-password' }) {
  return (
    <div className="sf-input-wrap with-icon has-eye">
      <span className="sf-input-icon"><Icon name="lock" size={16} /></span>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        maxLength={STAFF_PASSWORD_MAX}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className={invalid ? 'invalid' : ''}
        disabled={disabled}
      />
      <button type="button" className="sf-eye" onClick={onToggleShow} aria-label={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} tabIndex={-1}>
        <Icon name={show ? 'eyeOff' : 'eye'} size={17} />
      </button>
    </div>
  );
}

export function PasswordRules({ password, confirm }) {
  return (
    <ul className="sf-pw-rules" aria-live="polite">
      {passwordChecks(password, confirm).map(c => (
        <li key={c.id} className={c.ok ? 'ok' : ''}>
          <span className="mark"><Icon name="check" size={11} /></span>{c.label}
        </li>
      ))}
    </ul>
  );
}
