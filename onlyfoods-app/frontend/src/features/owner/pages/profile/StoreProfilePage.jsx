import { useEffect, useState } from 'react';
import { PageHeader, Icon, Skeleton } from '../../components/ui';
import { ImageUploadZone } from '../../components/image/ImageUploadZone';

// หน้าโปรไฟล์ร้าน (เจ้าของร้าน) : แก้รูปร้าน รายละเอียด และข้อมูลติดต่อได้
// ชื่อร้าน / หมวดหมู่ / รหัสคิว / สัญญา = ข้อมูลที่ลงทะเบียนกับผู้บริหาร แสดงอย่างเดียว (backend ก็ไม่รับค่าเหล่านี้จากหน้านี้)
export const STORE_DESCRIPTION_MAX = 500;
const STORE_IMAGE_RATIOS = [
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '4:3', label: '4:3', value: 4 / 3 },
];

const fromStore = (s) => ({
  image: s?.ImageUrl || '',
  description: s?.Description || '',
  contactName: s?.ContactName || '',
  contactPhone: s?.ContactPhone || '',
  contactLine: s?.ContactLine || '',
  contactEmail: s?.ContactEmail || '',
});

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');

function validate(form) {
  const errors = {};
  if (form.description.trim().length > STORE_DESCRIPTION_MAX) errors.description = `รายละเอียดต้องไม่เกิน ${STORE_DESCRIPTION_MAX} ตัวอักษร`;
  const phone = form.contactPhone.replace(/[\s-]/g, '');
  if (phone && !/^0\d{8,9}$/.test(phone)) errors.contactPhone = 'เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0';
  const email = form.contactEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.contactEmail = 'รูปแบบอีเมลไม่ถูกต้อง';
  if (form.contactName.trim().length > 100) errors.contactName = 'ชื่อผู้ติดต่อต้องไม่เกิน 100 ตัวอักษร';
  if (form.contactLine.trim().length > 50) errors.contactLine = 'LINE ID ต้องไม่เกิน 50 ตัวอักษร';
  return errors;
}

export default function StoreProfilePage({ storeDetail, onSave }) {
  // ตั้งค่าฟอร์มจากข้อมูลร้านครั้งแรกเท่านั้น : ข้อมูลร้านรีเฟรชทุก 10 วิ จะได้ไม่ทับสิ่งที่กำลังพิมพ์
  const [form, setForm] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (storeDetail && !form) {
      const init = fromStore(storeDetail);
      setForm(init);
      setBaseline(init);
    }
  }, [storeDetail, form]);

  if (!storeDetail || !form) {
    return (
      <>
        <PageHeader title="โปรไฟล์ร้าน" subtitle="รูปร้าน รายละเอียด และข้อมูลติดต่อ" icon="photo" />
        <div className="sp-grid">
          <div className="berry-card"><Skeleton height={220} /><div style={{ height: 16 }} /><Skeleton height={14} width="60%" /></div>
          <div className="berry-card"><Skeleton height={14} width="40%" /><div style={{ height: 12 }} /><Skeleton height={90} /></div>
        </div>
      </>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const set = (key) => (value) => {
    setForm(f => ({ ...f, [key]: value }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
    setFormError('');
  };
  const onInput = (key) => (e) => set(key)(e.target.value);

  const submit = async (e) => {
    e.preventDefault();
    const next = validate(form);
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setFormError('');
    try {
      await onSave({
        // รูปเดิม (path /uploads/) = ไม่เปลี่ยน ; data URL = รูปใหม่
        image_url: form.image || null,
        description: form.description.trim(),
        contact_name: form.contactName.trim(),
        contact_phone: form.contactPhone.replace(/[\s-]/g, ''),
        contact_line: form.contactLine.trim(),
        contact_email: form.contactEmail.trim(),
      });
      setBaseline(form);
    } catch (err) {
      setFormError(err.message || 'บันทึกโปรไฟล์ร้านไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { setForm(baseline); setErrors({}); setFormError(''); };
  const contractText = storeDetail.ContractStartDate || storeDetail.ContractEndDate
    ? `${fmtDate(storeDetail.ContractStartDate)} ถึง ${fmtDate(storeDetail.ContractEndDate)}` : 'ยังไม่มีสัญญา';

  return (
    <>
      <PageHeader title="โปรไฟล์ร้าน" subtitle="รูปร้าน รายละเอียด และข้อมูลติดต่อที่ลูกค้าและผู้บริหารเห็น" icon="photo" />

      <form onSubmit={submit} noValidate className="sp-grid">
        <div className="sp-main">
          {/* ข้อมูลที่ลงทะเบียนกับผู้บริหาร : แก้ที่นี่ไม่ได้ */}
          <section className="berry-card sp-card">
            <div className="sp-card-head">
              <h3>ข้อมูลร้านที่ลงทะเบียน</h3>
              <span className="sp-lock"><Icon name="lock" size={14} /> แก้ไขได้โดยผู้บริหารเท่านั้น</span>
            </div>
            <div className="sp-reg">
              <div className="sp-reg-item sp-reg-name">
                <span>ชื่อร้าน</span>
                <strong>{storeDetail.StoreName}</strong>
              </div>
              <div className="sp-reg-item"><span>หมวดหมู่</span><strong>{storeDetail.Category || '—'}</strong></div>
              <div className="sp-reg-item"><span>รหัสคิว</span><strong>{storeDetail.QueueCode || '—'}</strong></div>
              <div className="sp-reg-item"><span>สัญญาเช่า</span><strong>{contractText}</strong></div>
            </div>
            <p className="sp-note">ชื่อร้านต้องตรงกับที่ลงทะเบียนไว้กับผู้บริหารศูนย์อาหาร หากต้องการเปลี่ยนชื่อหรือหมวดหมู่ กรุณาติดต่อผู้บริหาร</p>
          </section>

          <section className="berry-card sp-card">
            <div className="sp-card-head"><h3>รูปร้าน</h3></div>
            <div className="mf-field" style={{ marginBottom: 0 }}>
              <ImageUploadZone image={form.image} originalImage={baseline.image} onChange={set('image')} disabled={saving}
                subject="ร้าน" ratios={STORE_IMAGE_RATIOS} />
              <div className="mf-hint">รูปนี้แสดงบนการ์ดร้านในหน้าสั่งอาหารของลูกค้า แนะนำรูปแนวนอน 16:9</div>
            </div>
          </section>

          <section className="berry-card sp-card">
            <div className="sp-card-head"><h3>รายละเอียดร้าน</h3></div>
            <div className="mf-field">
              <label htmlFor="sp-desc">
                แนะนำร้าน <span className="optional">ไม่บังคับ</span>
                <span className={`mf-counter ${form.description.length > STORE_DESCRIPTION_MAX ? 'over' : ''}`}>{form.description.length}/{STORE_DESCRIPTION_MAX}</span>
              </label>
              <textarea id="sp-desc" rows={4} value={form.description} onChange={onInput('description')} maxLength={STORE_DESCRIPTION_MAX}
                placeholder="เช่น อาหารตามสั่งรสจัดจ้าน วัตถุดิบสดใหม่ทุกวัน" className={errors.description ? 'invalid' : ''} disabled={saving} />
              {errors.description && <div className="mf-field-error">{errors.description}</div>}
            </div>
          </section>

          <section className="berry-card sp-card">
            <div className="sp-card-head">
              <h3>ข้อมูลติดต่อ</h3>
              <span className="sp-lock"><Icon name="eye" size={14} /> เห็นเฉพาะผู้บริหารและร้านของคุณ</span>
            </div>
            <div className="sp-two">
              <div className="mf-field">
                <label htmlFor="sp-cname">ชื่อผู้ติดต่อ</label>
                <input id="sp-cname" type="text" value={form.contactName} onChange={onInput('contactName')} maxLength={100}
                  className={errors.contactName ? 'invalid' : ''} disabled={saving} />
                {errors.contactName && <div className="mf-field-error">{errors.contactName}</div>}
              </div>
              <div className="mf-field">
                <label htmlFor="sp-phone">เบอร์โทร</label>
                <input id="sp-phone" type="text" inputMode="tel" value={form.contactPhone} onChange={onInput('contactPhone')} maxLength={20}
                  placeholder="0812345678" className={errors.contactPhone ? 'invalid' : ''} disabled={saving} />
                {errors.contactPhone && <div className="mf-field-error">{errors.contactPhone}</div>}
              </div>
              <div className="mf-field">
                <label htmlFor="sp-line">LINE ID</label>
                <input id="sp-line" type="text" value={form.contactLine} onChange={onInput('contactLine')} maxLength={50}
                  className={errors.contactLine ? 'invalid' : ''} disabled={saving} />
                {errors.contactLine && <div className="mf-field-error">{errors.contactLine}</div>}
              </div>
              <div className="mf-field">
                <label htmlFor="sp-email">อีเมล</label>
                <input id="sp-email" type="text" inputMode="email" value={form.contactEmail} onChange={onInput('contactEmail')} maxLength={100}
                  placeholder="shop@example.com" className={errors.contactEmail ? 'invalid' : ''} disabled={saving} />
                {errors.contactEmail && <div className="mf-field-error">{errors.contactEmail}</div>}
              </div>
            </div>
          </section>

          {formError && <div className="mf-form-error">{formError}</div>}
          <div className="sp-actions">
            <button type="button" className="mf-btn ghost" onClick={reset} disabled={saving || !dirty}>ยกเลิกการแก้ไข</button>
            <button type="submit" className="mf-btn primary" disabled={saving || !dirty}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : 'บันทึกโปรไฟล์ร้าน'}
            </button>
          </div>
        </div>

        {/* ตัวอย่างการ์ดร้านที่ลูกค้าเห็น (อัปเดตตามที่แก้) */}
        <aside className="sp-side">
          <div className="berry-card sp-preview">
            <div className="sp-preview-label">ลูกค้าจะเห็นร้านของคุณแบบนี้</div>
            <div className="sp-preview-card">
              <div className="sp-preview-img">
                {form.image ? <img src={form.image} alt="" /> : <span><Icon name="photo" size={28} /> ยังไม่มีรูปร้าน</span>}
              </div>
              <div className="sp-preview-body">
                <strong>{storeDetail.StoreName}</strong>
                <span className="sp-preview-cat">{storeDetail.Category || 'ร้านอาหาร'}</span>
                <p>{form.description.trim() || 'ยังไม่มีรายละเอียดร้าน'}</p>
              </div>
            </div>
          </div>
        </aside>
      </form>
    </>
  );
}
