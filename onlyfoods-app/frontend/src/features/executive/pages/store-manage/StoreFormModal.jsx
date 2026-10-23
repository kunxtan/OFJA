import { useRef, useState } from 'react';
import { MAX_IMAGE_MB, ALLOWED_IMAGE_TYPES, FOOD_CATEGORIES, STORE_PASSWORD_MIN } from './storeForm';
import { T, FONT_STACK, captionStyle, inputStyle, formDateInputStyle, twoColStyle, storeImagePreviewStyle, storeImageShadeStyle, storeImageChangeBadgeStyle, storeImageEmptyStyle, storeImageIconStyle, storeImagePlusStyle, storeImageFormatPillStyle, storeImageFooterStyle, storeImageUploaderStyle } from '../../theme';
import { useIsNarrow, Icon, Button, Modal, Field } from '../../components/ui';
import { FormSectionTitle, IconInput, PasswordField, PasswordChecklist, OwnerRoleCard } from './formParts';
import { formatPhone } from '../../lib/format';
import { StoreImageCropModal } from './StoreImageCropModal';
import { contractEndISO } from '../../lib/dates';

// ===== ฟอร์มเพิ่ม/แก้ไขข้อมูลร้านค้า =====
export function StoreFormModal({ open, mode, form, setForm, errors, setErrors, onClose, onSubmit, saving }) {
    const isCompact = useIsNarrow(700);
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [cropSource, setCropSource] = useState('');
    const [cropFileName, setCropFileName] = useState('');
    const [showPassword, setShowPassword] = useState(false);

      const calculateContractEnd = (startISO, duration) => {
        const months = { '6m': 6, '1y': 12, '2y': 24, '3y': 36 }[duration];
        return contractEndISO(startISO, months);
    };

    const update = (key) => (e) => {
        const value = e.target.value;
        setForm((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'contractStartDate' && prev.contractDuration && prev.contractDuration !== 'custom') {
                next.contractEndDate = calculateContractEnd(value, prev.contractDuration);
            }
            if (key === 'contractDuration') {
                next.contractEndDate = value === 'custom'
                    ? ''
                    : calculateContractEnd(prev.contractStartDate, value);
            }
            return next;
        });
        setErrors((prev) => ({
            ...prev,
            [key]: undefined,
            ...(key === 'contractStartDate' || key === 'contractDuration'
                ? { contractEndDate: undefined }
                : {})
        }));
    };
    const triggerPick = () => fileInputRef.current?.click();
    const handleFile = (file) => {
        if (!file)
            return;
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            setErrors((prev) => ({ ...prev, image: 'รองรับเฉพาะไฟล์ JPG, PNG และ WebP' }));
            return;
        }
        if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
            setErrors((prev) => ({
                ...prev,
                image: `ไฟล์ใหญ่เกินกำหนด (${(file.size / 1024 / 1024).toFixed(2)} MB) — อัปโหลดได้ไม่เกิน ${MAX_IMAGE_MB} MB`
            }));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setCropSource(String(reader.result));
            setCropFileName(file.name);
            setErrors((prev) => ({ ...prev, image: undefined }));
        };
        reader.readAsDataURL(file);
    };
    const onPickImage = (e) => {
        handleFile(e.target.files?.[0]);
        e.target.value = '';
    };
    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files?.[0]);
    };
    return (<>
      <Modal open={open} title={mode === 'edit' ? 'แก้ไขข้อมูลร้านค้า' : 'เพิ่มร้านค้าใหม่'} subtitle="ช่องที่มีเครื่องหมาย * ต้องกรอกให้ครบก่อนจึงจะบันทึกได้" onClose={onClose} width={660} footer={<>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button icon="check" onClick={onSubmit} disabled={saving}>
            {saving ? 'กำลังบันทึก...' : mode === 'edit' ? 'บันทึกการแก้ไข' : 'เพิ่มร้านค้า'}
          </Button>
        </>}>
            <FormSectionTitle icon="store">ข้อมูลร้าน</FormSectionTitle>
      <Field label="ชื่อร้านค้า" required error={errors.name}>
        <input value={form.name} onChange={update('name')} maxLength={100} placeholder="เช่น ร้านข้าวแกงวิศวะเดือด" style={inputStyle}/>
      </Field>
      <div style={twoColStyle}>
        <Field label="ประเภทอาหาร" required error={errors.category}>
          <select value={form.category} onChange={update('category')} style={inputStyle}>
            <option value="">— เลือกประเภทอาหาร —</option>
            {FOOD_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </Field>
        <Field label="ตัวอักษรคิวของร้าน" error={errors.queueCode} hint="คิวจะเป็น A001, A002 ... เว้นว่าง = ระบบเลือกให้">
          <input value={form.queueCode || ''} onChange={update('queueCode')} maxLength={2} placeholder="เช่น A" style={{ ...inputStyle, textTransform: 'uppercase' }}/>
        </Field>
      </div>
      <Field label="คำอธิบายร้าน" error={errors.description} hint={`${form.description.length}/300 ตัวอักษร`}>
        <textarea value={form.description} onChange={update('description')} maxLength={300} rows={2} placeholder="จุดเด่นของร้าน เมนูแนะนำ ฯลฯ" style={{ ...inputStyle, resize: 'vertical', fontFamily: FONT_STACK }}/>
      </Field>
      <Field label="รูปหน้าร้าน" error={errors.image}>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPickImage} style={{ display: 'none' }}/>
        <button
          type="button"
          onClick={triggerPick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={storeImageUploaderStyle(dragOver, !!errors.image, !!form.imageData)}
          aria-label="อัปโหลดรูปหน้าร้าน"
        >
          {form.imageData ? (
            <>
              <img src={form.imageData} alt="ตัวอย่างรูปร้าน" style={storeImagePreviewStyle}/>
              <span style={storeImageShadeStyle}/>
              <span style={storeImageChangeBadgeStyle}>
                <Icon name="edit" size={15} color="#FFFFFF"/>
                คลิกเพื่อเปลี่ยนรูป
              </span>
            </>
          ) : (
            <span style={storeImageEmptyStyle}>
              <span style={storeImageIconStyle}>
                <Icon name="store" size={28} color={T.primary}/>
                <span style={storeImagePlusStyle}>
                  <Icon name="plus" size={13} color="#FFFFFF" strokeWidth={2.2}/>
                </span>
              </span>
              <strong style={{ color: T.ink, fontSize: '14px', fontWeight: 700 }}>อัปโหลดรูปหน้าร้าน</strong>
              <span style={{ color: T.muted, fontSize: '12.5px', fontWeight: 500 }}>
                คลิกเพื่อเลือกรูป หรือ ลากและวางไฟล์ที่นี่
              </span>
              <span style={storeImageFormatPillStyle}>JPG · PNG · WebP · ไม่เกิน {MAX_IMAGE_MB} MB</span>
            </span>
          )}
        </button>

        {form.imageData && (
          <div style={storeImageFooterStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: T.ink, fontSize: '12.5px', fontWeight: 700 }}>รูปหน้าร้านที่เลือก</div>
              <div style={{ ...captionStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
                {form.imageName || 'รูปเดิมของร้านค้า'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button variant="ghost" icon="edit" onClick={triggerPick} style={{ padding: '8px 12px', fontSize: '12.5px' }}>
                เปลี่ยนรูป
              </Button>
              <Button
                variant="danger"
                icon="trash"
                onClick={() => setForm((prev) => ({ ...prev, imageData: '', imageName: '' }))}
                style={{ padding: '8px 12px', fontSize: '12.5px' }}
              >
                ลบรูป
              </Button>
            </div>
          </div>
        )}
      </Field>

      <FormSectionTitle icon="calendar">สัญญาเช่า</FormSectionTitle>
      <Field label="วันที่เริ่มสัญญา (ปี ค.ศ.)" required error={errors.contractStartDate}>
        <input type="date" value={form.contractStartDate || ''} onChange={update('contractStartDate')} style={formDateInputStyle} />
      </Field>
      <div style={twoColStyle}>
        <Field label="ระยะเวลาสัญญา" required error={errors.contractDuration}>
          <select value={form.contractDuration || ''} onChange={update('contractDuration')} style={{ ...inputStyle, display: 'block', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
            <option value="">— เลือกระยะเวลา —</option><option value="6m">6 เดือน</option><option value="1y">1 ปี</option><option value="2y">2 ปี</option><option value="3y">3 ปี</option><option value="custom">กำหนดวันสิ้นสุดเอง</option>
          </select>
        </Field>
        <Field label="วันที่สิ้นสุดสัญญา (ปี ค.ศ.)" required error={errors.contractEndDate} hint={form.contractDuration && form.contractDuration !== 'custom' ? 'ระบบคำนวณให้อัตโนมัติ' : form.contractDuration === 'custom' ? 'เลือกวันสิ้นสุดได้เอง' : 'เลือกระยะเวลาสัญญาก่อน'}>
          <input type="date" value={form.contractEndDate || ''} min={form.contractStartDate || undefined} onChange={update('contractEndDate')} disabled={form.contractDuration !== 'custom'} style={{ ...formDateInputStyle, background: form.contractDuration !== 'custom' ? '#F7F8FB' : inputStyle.background, color: form.contractDuration !== 'custom' ? T.muted : T.ink, cursor: form.contractDuration !== 'custom' ? 'not-allowed' : 'pointer' }} />
        </Field>
      </div>

      <FormSectionTitle icon="account">ผู้ติดต่อ</FormSectionTitle>
      <div style={twoColStyle}>
        <Field label="ชื่อเจ้าของร้าน / ผู้ติดต่อ" required error={errors.contactName} hint={mode === 'create' ? 'ใช้เป็นชื่อบัญชีเจ้าของร้านด้วย' : undefined}>
          <IconInput icon="account" value={form.contactName} onChange={update('contactName')} maxLength={60} placeholder="ชื่อ-นามสกุล"/>
        </Field>
        <Field label="เบอร์โทรติดต่อ" required error={errors.phone} hint="ตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0">
          <IconInput icon="phone" value={form.phone} inputMode="tel" maxLength={12} placeholder="081-234-5678"
            onChange={(e) => { setForm((prev) => ({ ...prev, phone: e.target.value.replace(/[^\d-]/g, '').slice(0, 12) })); setErrors((prev) => ({ ...prev, phone: undefined })); }}
            onBlur={() => setForm((prev) => ({ ...prev, phone: formatPhone(prev.phone) }))}/>
        </Field>
      </div>
      <div style={twoColStyle}>
        <Field label="LINE ID (ไม่บังคับ)" error={errors.lineId} hint="ห้ามเว้นวรรค">
          <IconInput icon="chat" value={form.lineId} onChange={(e) => setForm((prev) => ({ ...prev, lineId: e.target.value.replace(/\s/g, '').slice(0, 30) }))} placeholder="@onlyfoods"/>
        </Field>
        <Field label="อีเมล (ไม่บังคับ)" error={errors.email}>
          <IconInput icon="mail" type="email" value={form.email} onChange={update('email')} maxLength={100} placeholder="shop@example.com"/>
        </Field>
      </div>

      {mode === 'create' && (<>
        <FormSectionTitle icon="key">บัญชีเข้าสู่ระบบ</FormSectionTitle>
        <OwnerRoleCard/>
        <Field label="ชื่อผู้ใช้ (username)" required error={errors.ownerUsername} hint="a-z, 0-9 และ _ ความยาว 4–20 ตัว ห้ามซ้ำกับบัญชีอื่น">
          <IconInput icon="account" value={form.ownerUsername || ''} onChange={(e) => { setForm((prev) => ({ ...prev, ownerUsername: e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) })); setErrors((prev) => ({ ...prev, ownerUsername: undefined })); }} autoComplete="off" placeholder="เช่น owner_shop"/>
        </Field>
        <div style={twoColStyle}>
          <Field label="รหัสผ่าน" required error={errors.ownerPassword}>
            <PasswordField value={form.ownerPassword || ''} onChange={update('ownerPassword')} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder={`อย่างน้อย ${STORE_PASSWORD_MIN} ตัว`}/>
          </Field>
          <Field label="ยืนยันรหัสผ่าน" required error={errors.ownerConfirm}>
            <PasswordField value={form.ownerConfirm || ''} onChange={update('ownerConfirm')} show={showPassword} onToggle={() => setShowPassword((v) => !v)} placeholder="พิมพ์อีกครั้ง"/>
          </Field>
        </div>
        <PasswordChecklist password={form.ownerPassword || ''} confirm={form.ownerConfirm || ''}/>
      </>)}
       </Modal>

    <StoreImageCropModal
      open={Boolean(cropSource)}
      imageSrc={cropSource}
      fileName={cropFileName}
      onCancel={() => {
        setCropSource('');
        setCropFileName('');
      }}
      onConfirm={(dataUrl, name) => {
        setForm((prev) => ({ ...prev, imageData: dataUrl, imageName: name }));
        setErrors((prev) => ({ ...prev, image: undefined }));
        setCropSource('');
        setCropFileName('');
      }}
    />
    </>);
}
