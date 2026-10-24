import { useState, useEffect } from 'react';
import { Icon } from '../../components/ui';
import { ImageUploadZone } from '../../components/image/ImageUploadZone';

export const DESCRIPTION_MAX = 500;

// --- ฟอร์มเพิ่ม/แก้ไขเมนู (ใช้ร่วมกันทั้งสองโหมด) ---
export function MenuFormModal({ mode, product, onClose, onSubmit }) {
  const isEdit = mode === 'edit';
  const originalImage = isEdit ? (product?.img || '') : '';
  const [name, setName] = useState(isEdit ? product?.ProductName || '' : '');
  const [price, setPrice] = useState(isEdit ? String(product?.UnitPrice ?? '') : '');
  const [description, setDescription] = useState(isEdit ? product?.Description || '' : '');
  const [image, setImage] = useState(originalImage);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving, onClose]);

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    const trimmed = name.trim();
    const priceNum = Number(price);
    if (!trimmed) next.name = 'กรุณาระบุชื่อเมนู';
    else if (trimmed.length > 100) next.name = 'ชื่อเมนูต้องไม่เกิน 100 ตัวอักษร';
    if (price === '' || Number.isNaN(priceNum)) next.price = 'กรุณาระบุราคา';
    else if (priceNum < 0) next.price = 'ราคาต้องไม่ติดลบ';
    else if (priceNum > 99999999) next.price = 'ราคาสูงเกินไป';
    if (description.trim().length > DESCRIPTION_MAX) next.description = `รายละเอียดต้องไม่เกิน ${DESCRIPTION_MAX} ตัวอักษร`;
    // เมนูต้องมีรูปอาหารเสมอ ทั้งตอนเพิ่มและตอนแก้ไข (ลูกค้าเลือกจากรูป) ; backend ตรวจซ้ำอีกชั้น
    if (!image) next.image = 'กรุณาเพิ่มรูปอาหารของเมนูนี้';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      await onSubmit({ name: trimmed, price: priceNum, img: image, description: description.trim() });
    } catch (err) {
      setErrors({ form: err.message || 'บันทึกไม่สำเร็จ' });
      setSaving(false);
    }
  };

  return (
    <div className="berry-modal-overlay mf-overlay" onClick={() => { if (!saving) onClose(); }}>
      <div className="mf-modal" role="dialog" aria-modal="true" aria-labelledby="mf-title" onClick={e => e.stopPropagation()}>
        <div className="mf-head">
          <div className="mf-head-icon"><Icon name={isEdit ? 'edit' : 'plus'} size={20} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="mf-title">{isEdit ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</h3>
            <p>{isEdit ? 'ปรับชื่อ รายละเอียด ราคา หรือรูปของเมนูนี้' : 'กรอกข้อมูลเมนูที่จะเปิดขายในร้าน'}</p>
          </div>
          <button type="button" className="mf-close" onClick={onClose} disabled={saving} aria-label="ปิด">
            <Icon name="close" size={18} />
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <div className="mf-body">
            <div className="mf-field">
              <label htmlFor="mf-name">ชื่อเมนู <span className="req">*</span></label>
              <input
                id="mf-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="เช่น ข้าวกะเพราหมูสับ"
                maxLength={100}
                className={errors.name ? 'invalid' : ''}
                disabled={saving}
                autoFocus
              />
              {errors.name && <div className="mf-field-error">{errors.name}</div>}
            </div>

            <div className="mf-field">
              <label htmlFor="mf-desc">
                รายละเอียดเมนู <span className="optional">ไม่บังคับ</span>
                <span className={`mf-counter ${description.length > DESCRIPTION_MAX ? 'over' : ''}`}>{description.length}/{DESCRIPTION_MAX}</span>
              </label>
              <textarea
                id="mf-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="เช่น ไข่ดาวเพิ่ม 10 บาท, เผ็ดน้อย/เผ็ดมากได้"
                maxLength={DESCRIPTION_MAX}
                rows={3}
                className={errors.description ? 'invalid' : ''}
                disabled={saving}
              />
              <div className="mf-hint">ลูกค้าจะเห็นข้อความนี้ใต้ชื่อเมนูตอนสั่งอาหาร</div>
              {errors.description && <div className="mf-field-error">{errors.description}</div>}
            </div>

            <div className="mf-field">
              <label htmlFor="mf-price">ราคา <span className="req">*</span></label>
              <div className={`mf-price ${errors.price ? 'invalid' : ''}`}>
                <span>฿</span>
                <input
                  id="mf-price"
                  type="number"
                  inputMode="decimal"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1"
                  disabled={saving}
                />
                <span className="unit">บาท</span>
              </div>
              {errors.price && <div className="mf-field-error">{errors.price}</div>}
            </div>

            <div className="mf-field">
              <label>รูปภาพเมนู <span className="req">*</span></label>
              <ImageUploadZone image={image} originalImage={originalImage} disabled={saving} invalid={Boolean(errors.image)}
                onChange={(next) => { setImage(next); if (next) setErrors(prev => ({ ...prev, image: undefined })); }} />
              {!errors.image && (
                <div className="mf-hint">{isEdit && !originalImage ? 'เมนูนี้ยังไม่มีรูป กรุณาเพิ่มรูปอาหารก่อนบันทึก' : 'ต้องมีรูปอาหาร ลูกค้าจะเห็นรูปนี้ตอนเลือกเมนู'}</div>
              )}
              {errors.image && <div className="mf-field-error">{errors.image}</div>}
            </div>

            {errors.form && <div className="mf-form-error">{errors.form}</div>}
          </div>

          <div className="mf-footer">
            <button type="button" className="mf-btn ghost" onClick={onClose} disabled={saving}>ยกเลิก</button>
            <button type="submit" className="mf-btn primary" disabled={saving}>
              {saving ? <span className="berry-spinner" /> : <Icon name="check" size={17} />}
              {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มเมนู'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
