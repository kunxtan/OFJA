import { useState, useRef } from 'react';
import { Icon } from '../ui';
import { MAX_IMAGE_MB, MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES, formatBytes, readImageFile } from './imageFile';
import { ImageCropper } from './ImageCropper';

// subject = ใช้ในข้อความ (เมนู / ร้าน) ; ratios = สัดส่วนที่ให้เลือกตอนครอป ; invalid = ช่องนี้ยังไม่ผ่าน (กรอบแดง)
export function ImageUploadZone({ image, originalImage = '', onChange, disabled, subject = 'เมนู', ratios, invalid = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [cropSrc, setCropSrc] = useState(null); // รูปที่กำลังครอปอยู่
  const fileInputRef = useRef(null);
  const isNewImage = Boolean(image) && image !== originalImage;

  // เลือกไฟล์ -> ตรวจชนิด/ขนาด/เปิดได้จริง -> เปิดหน้าครอปทันที
  const processFile = async (file) => {
    if (!file || disabled) return;
    try {
      const result = await readImageFile(file);
      setError('');
      setCropSrc(result.dataUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const openPicker = () => { if (!disabled) fileInputRef.current?.click(); };
  const resetImage = () => { setInfo(null); setError(''); onChange(originalImage || ''); };

  const handleCropped = (dataUrl, meta) => {
    if (meta.size > MAX_IMAGE_BYTES) {
      setError(`รูปหลังครอปมีขนาด ${formatBytes(meta.size)} เกินกำหนด ${MAX_IMAGE_MB} MB`);
      setCropSrc(null);
      return;
    }
    setError('');
    setInfo(meta);
    setCropSrc(null);
    onChange(dataUrl);
  };

  return (
    <div>
      <input
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }}
      />

      {image ? (
        <div className="mf-image-preview">
          <img src={image} alt={`ตัวอย่างรูป${subject}`} />
          <div className="mf-image-meta">
            <div className="mf-image-name">
              {isNewImage ? 'รูปใหม่ (ครอปแล้ว)' : `รูปปัจจุบันของ${subject}`}
            </div>
            <div className="mf-image-sub">
              {isNewImage && info ? `${formatBytes(info.size)} · ${info.width}×${info.height}px` : 'อัปโหลดไว้แล้ว'}
            </div>
            <div className="mf-image-actions">
              <button type="button" className="mf-link-btn" onClick={() => setCropSrc(image)} disabled={disabled}>
                <Icon name="crop" size={15} /> ครอปรูป
              </button>
              <button type="button" className="mf-link-btn" onClick={openPicker} disabled={disabled}>
                <Icon name="upload" size={15} /> เปลี่ยนรูป
              </button>
              {(isNewImage || !originalImage) && (
                <button type="button" className="mf-link-btn danger" onClick={resetImage} disabled={disabled}>
                  <Icon name="close" size={15} /> {originalImage ? 'ใช้รูปเดิม' : 'นำรูปออก'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`mf-dropzone ${isDragging ? 'dragging' : ''} ${error || invalid ? 'has-error' : ''}`}
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]); }}
        >
          <div className="mf-dropzone-icon"><Icon name="photo" size={26} /></div>
          <div className="mf-dropzone-title">
            <span>คลิกเพื่อเลือกรูป</span> หรือลากไฟล์มาวางที่นี่
          </div>
          <div className="mf-dropzone-hint">PNG, JPG, WEBP, GIF · ไม่เกิน {MAX_IMAGE_MB} MB · ครอปได้หลังเลือก</div>
        </div>
      )}

      {error && <div className="mf-field-error">{error}</div>}

      {cropSrc && (
        <ImageCropper src={cropSrc} onCancel={() => setCropSrc(null)} onConfirm={handleCropped} title={`ครอปรูป${subject}`}
          {...(ratios ? { ratios } : {})} />
      )}
    </div>
  );
}
