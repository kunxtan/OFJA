import { todayISO } from '../../../lib/dates';

export function StorePeriodPicker({ setAnchor, days, setDays, custom, setCustom, startDate, setStartDate, endDate, setEndDate }) {
  // ปุ่มสำเร็จรูป = ย้อนหลังจากวันนี้เสมอ ; อยากเลือกวันเองให้กด "กำหนดเอง"
  const choosePreset = (value) => { setCustom(false); setDays(value); setAnchor(todayISO()); };
  return (
    <div className="berry-period-picker">
      <div className="berry-period-group">
        {[1, 7, 14, 30].map(value => (
          <button
            key={value}
            type="button"
            onClick={() => choosePreset(value)}
            className={`berry-period-btn ${!custom && days === value ? 'active' : ''}`}
          >
            {value === 1 ? 'วันนี้' : `${value} วัน`}
          </button>
        ))}
        <button type="button" onClick={() => setCustom(true)} className={`berry-period-btn ${custom ? 'active' : ''}`}>
          กำหนดเอง
        </button>
      </div>
      {custom && (
        <div className="berry-date-range">
          <label>
            ตั้งแต่วันที่
            <input
              type="date"
              value={startDate}
              max={endDate || todayISO()}
              onChange={e => { const v = e.target.value || todayISO(); setStartDate(v); if (v > endDate) setEndDate(v); }}
              aria-label="ตั้งแต่วันที่"
            />
          </label>
          <label>
            ถึงวันที่
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayISO()}
              onChange={e => setEndDate(e.target.value || todayISO())}
              aria-label="ถึงวันที่"
            />
          </label>
        </div>
      )}
    </div>
  );
}
