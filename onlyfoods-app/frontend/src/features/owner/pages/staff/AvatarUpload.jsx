import { useState, useRef } from 'react';
import { Icon } from '../../components/ui';
import { MAX_IMAGE_MB, MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES, formatBytes, readImageFile } from '../../components/image/imageFile';
import { ImageCropper } from '../../components/image/ImageCropper';
import { AVATAR_CROP } from './staffUtils';
import { StaffAvatar } from './StaffAvatar';

// รูปโปรไฟล์: เลือกไฟล์ -> ตรวจ -> ครอป 1:1 (วงกลม) -> ส่ง data URL ให้ฟอร์ม
export function AvatarUpload({ image, name, onChange, disabled }) {
  const [error, setError] = useState('');
  const [cropSrc, setCropSrc] = useState(null);
  const inputRef = useRef(null);
  const pick = () => { if (!disabled) inputRef.current?.click(); };

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

  const handleCropped = (dataUrl, meta) => {
    setCropSrc(null);
    if (meta.size > MAX_IMAGE_BYTES) {
      setError(`รูปหลังครอปมีขนาด ${formatBytes(meta.size)} เกินกำหนด ${MAX_IMAGE_MB} MB`);
      return;
    }
    setError('');
    onChange(dataUrl);
  };

  return (
    <div className="sf-avatar-upload">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={e => { processFile(e.target.files[0]); e.target.value = ''; }}
      />
      <button type="button" className="sf-avatar-btn" onClick={pick} disabled={disabled} aria-label="เลือกรูปโปรไฟล์">
        <StaffAvatar name={name} src={image} size={88} />
        <span className="sf-avatar-cam"><Icon name="photo" size={15} /></span>
      </button>
      <div className="sf-avatar-meta">
        <div className="title">รูปโปรไฟล์ <span className="optional">ไม่บังคับ</span></div>
        <div className="hint">รูปหน้าตรงช่วยให้จำพนักงานได้ง่าย · PNG, JPG, WEBP, GIF ไม่เกิน {MAX_IMAGE_MB} MB</div>
        <div className="mf-image-actions">
          <button type="button" className="mf-link-btn" onClick={pick} disabled={disabled}>
            <Icon name="upload" size={15} /> {image ? 'เปลี่ยนรูป' : 'อัปโหลดรูป'}
          </button>
          {image && (
            <>
              <button type="button" className="mf-link-btn" onClick={() => setCropSrc(image)} disabled={disabled}>
                <Icon name="crop" size={15} /> ครอปใหม่
              </button>
              <button type="button" className="mf-link-btn danger" onClick={() => { setError(''); onChange(''); }} disabled={disabled}>
                <Icon name="close" size={15} /> นำรูปออก
              </button>
            </>
          )}
        </div>
        {error && <div className="mf-field-error">{error}</div>}
      </div>
      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          ratios={AVATAR_CROP}
          title="ครอปรูปโปรไฟล์"
          outputMax={512}
          round
          onCancel={() => setCropSrc(null)}
          onConfirm={handleCropped}
        />
      )}
    </div>
  );
}
