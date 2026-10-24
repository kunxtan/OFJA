import { T, FONT_STACK, dateWrapStyle, dateInputStyle, iconButtonStyle, searchInputStyle, cancelChipStyle, inputStyle } from '../theme';
import { todayISO } from '../../../lib/dates';
import { useEffect, useState } from 'react';
import { Icon } from './ui';
import { TH_MONTH_FULL, monthRange, monthLabelOf } from '../lib/format';

export function PeriodPicker({ anchor, setAnchor, days, setDays, style }) {
    return (<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', ...style }}>
      <div style={dateWrapStyle}>
        
        <input type="date" value={anchor} max={todayISO()} onChange={(e) => setAnchor(e.target.value || todayISO())} style={dateInputStyle} aria-label="เลือกวันที่ที่ต้องการดู"/>
      </div>

      <div style={{display: 'flex',gap: '4px',flexWrap: 'wrap',background:T.primarySoft,padding: '4px',borderRadius:T.radiusMd}}>
        {[1, 7, 14, 30].map((v) => (<button key={v} type="button" onClick={() => setDays(v)} style={{padding: '7px 14px',borderRadius: '6px',fontSize: '13px',fontWeight:600,fontFamily:FONT_STACK,cursor: 'pointer',border: 'none',background:days===v?T.surface: 'transparent',color:days===v?T.primary:T.muted,boxShadow:days===v? '0 1px 3px rgba(18,25,38,.12)': 'none'}}>
            {v === 1 ? 'วันนี้' : `${v} วัน`}
          </button>))}
      </div>
    </div>);
}

// ป้ายสถานะท้ายชื่อร้านในช่องเลือกร้าน — โชว์เฉพาะร้านที่ขายไม่ได้แล้ว
export const pickerStatusOf = (s) => Boolean(s?.IsDeleted) ? { label: 'ลบแล้ว', tone: 'neutral' }
    : s?.ContractState === 'EXPIRED' ? { label: 'หมดสัญญา', tone: 'danger' }
    : null;

export function SearchableStorePicker({ stores, value, onChange, loading = false }) {
    const selected = stores.find((s) => String(s.StoreId) === String(value));
    const [query, setQuery] = useState(selected?.StoreName || '');
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const next = stores.find((s) => String(s.StoreId) === String(value));
        setQuery(next?.StoreName || '');
    }, [value, stores]);
        // all = ทั้งหมด (ค่าเริ่มต้น) | active = ยังไม่ถูกลบ | deleted = ถูกลบแล้ว
    const [statusFilter, setStatusFilter] = useState('all');
    const deletedCount = stores.filter((s) => Boolean(s?.IsDeleted)).length;
    const statusOptions = [
        ['all', 'ทั้งหมด', stores.length],
        ['active', 'ร้านที่ยังอยู่', stores.length - deletedCount],
        ['deleted', 'ร้านที่ถูกลบ', deletedCount]
    ];
    const byStatus = stores.filter((s) => statusFilter === 'all' || (statusFilter === 'deleted') === Boolean(s?.IsDeleted));
    const filtered = byStatus.filter((s) => String(s.StoreName || '').toLowerCase().includes(query.trim().toLowerCase()));
    const choose = (store) => {
        onChange(String(store.StoreId));
        setQuery(store.StoreName || '');
        setOpen(false);
    };
    return (<div style={{ position: 'relative', marginTop: '8px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        {statusOptions.map(([key, label, count]) => (<button key={key} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setStatusFilter(key); setOpen(true); }} style={cancelChipStyle(statusFilter === key)}>
            {label} ({loading ? '–' : count})
          </button>))}
      </div>
      <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px' }}>
        <Icon name="search" size={16} color={T.muted}/>
        <input value={query} onFocus={() => setOpen(true)} onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (value)
                onChange('');
        }} onBlur={() => setTimeout(() => setOpen(false), 120)} placeholder="พิมพ์ชื่อร้าน หรือคลิกเพื่อเลือกร้านค้า" style={{ ...searchInputStyle, padding: '10px 0' }}/>
        {query && (<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                setQuery('');
                onChange('');
                setOpen(true);
            }} style={{ ...iconButtonStyle, width: '26px', height: '26px', border: 'none' }} aria-label="ล้างร้านที่เลือก">
            <Icon name="close" size={14} color={T.muted}/>
          </button>)}
      </div>
      {open && (<div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', zIndex: 45, background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusMd, boxShadow: '0 14px 30px rgba(18,25,38,0.14)', maxHeight: '320px', overflowY: 'auto' }}>
                       {filtered.length ? filtered.map((s) => (<button key={s.StoreId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(s)} style={{ width: '100%', border: 'none', borderBottom: `1px solid ${T.line}`, background: String(s.StoreId) === String(value) ? T.primarySoft : T.surface, color: T.text, padding: '10px 12px', textAlign: 'left', fontFamily: FONT_STACK, cursor: 'pointer', fontSize: '13px' }}>
              {s.StoreName}
              {pickerStatusOf(s) && <span style={{ color: T.muted, marginLeft: '6px' }}>({pickerStatusOf(s).label})</span>}
            </button>)) : (<div style={{ padding: '12px', color: T.muted, fontSize: '13px' }}>{stores.length ? 'ไม่พบร้านที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูลร้านค้า'}</div>)}
        </div>)}
    </div>);
}

export function StorePeriodPicker({ anchor, setAnchor, days, setDays, custom, setCustom, startDate, setStartDate, endDate, setEndDate }) {
    const [monthMode, setMonthMode] = useState(() => custom && Boolean(monthLabelOf(startDate, endDate)));
    const choosePreset = (value) => { setMonthMode(false); setCustom(false); setDays(value); };
    const chooseMonth = (y, m) => { const [start, end] = monthRange(y, m); setStartDate(start); setEndDate(end); };
    const nowY = Number(todayISO().slice(0, 4));
    const nowM = Number(todayISO().slice(5, 7));
    const pickY = Number(startDate.slice(0, 4)) || nowY;
    const pickM = Number(startDate.slice(5, 7)) || nowM;
    const tab = (active) => ({ padding: '7px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', border: 'none', background: active ? T.surface : 'transparent', color: active ? T.primary : T.muted, boxShadow: active ? '0 1px 3px rgba(18,25,38,.12)' : 'none' });
    const monthSelect = { border: `1px solid ${T.line}`, borderRadius: '7px', background: '#FFFFFF', color: T.ink, fontSize: '12.5px', fontFamily: FONT_STACK, padding: '8px 9px' };
    const inputStyle = { ...dateInputStyle, width: '145px' };
    return (<div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', background: T.primarySoft, padding: '4px', borderRadius: T.radiusMd }}>
        {[1, 7, 14, 30].map((v) => (<button key={v} type="button" onClick={() => choosePreset(v)} style={{ padding: '7px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', border: 'none', background: !custom && days === v ? T.surface : 'transparent', color: !custom && days === v ? T.primary : T.muted, boxShadow: !custom && days === v ? '0 1px 3px rgba(18,25,38,.12)' : 'none' }}>{v === 1 ? 'วันนี้' : `${v} วัน`}</button>))}
                <button type="button" onClick={() => { setMonthMode(true); setCustom(true); chooseMonth(nowY, nowM); }} style={tab(custom && monthMode)}>รายเดือน</button>
        <button type="button" onClick={() => { setMonthMode(false); setCustom(true); }} style={tab(custom && !monthMode)}>กำหนดเอง</button>
      </div>
      {custom && monthMode ? (<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: T.surface }}>
        <Icon name="calendar" size={16} color={T.muted}/>
        <select value={pickM} onChange={(e) => chooseMonth(pickY, Number(e.target.value))} style={monthSelect} aria-label="เลือกเดือน">
          {TH_MONTH_FULL.map((name, i) => (<option key={name} value={i + 1} disabled={pickY === nowY && i + 1 > nowM}>{name}</option>))}
        </select>
        <select value={pickY} onChange={(e) => { const y = Number(e.target.value); chooseMonth(y, y === nowY ? Math.min(pickM, nowM) : pickM); }} style={monthSelect} aria-label="เลือกปี">
          {[nowY, nowY - 1, nowY - 2].map((y) => (<option key={y} value={y}>{y}</option>))}
        </select>
      </div>) : custom ? (<div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: T.surface, boxShadow: '0 1px 2px rgba(42,44,65,0.03)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.text, fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
          ตั้งแต่วันที่
          <input type="date" value={startDate} max={endDate || todayISO()} onChange={(e) => { const value = e.target.value || todayISO(); setStartDate(value); if (value > endDate) setEndDate(value); }} style={{ ...inputStyle, width: '136px', minWidth: '136px', boxSizing: 'border-box', padding: '8px 9px', border: `1px solid ${T.line}`, borderRadius: '7px', background: '#FFFFFF', color: T.ink, fontSize: '12.5px' }} aria-label="ตั้งแต่วันที่" />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: T.text, fontSize: '12.5px', fontWeight: 600, whiteSpace: 'nowrap' }}>
          ถึงวันที่
          <input type="date" value={endDate} min={startDate} max={todayISO()} onChange={(e) => setEndDate(e.target.value || todayISO())} style={{ ...inputStyle, width: '136px', minWidth: '136px', boxSizing: 'border-box', padding: '8px 9px', border: `1px solid ${T.line}`, borderRadius: '7px', background: '#FFFFFF', color: T.ink, fontSize: '12.5px' }} aria-label="ถึงวันที่" />
        </label>
      </div>) : (<div style={dateWrapStyle}><Icon name="calendar" size={16} color={T.muted}/><input type="date" value={anchor} max={todayISO()} onChange={(e) => setAnchor(e.target.value || todayISO())} style={dateInputStyle} aria-label="เลือกวันที่สิ้นสุด" /></div>)}
    </div>);
}
