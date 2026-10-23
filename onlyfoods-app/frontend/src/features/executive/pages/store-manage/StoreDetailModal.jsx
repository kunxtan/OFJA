import { useEffect, useRef, useState } from 'react';
import { MAX_IMAGE_MB, ALLOWED_IMAGE_TYPES, FOOD_CATEGORIES, STORE_PASSWORD_MIN, storePhoneError } from './storeForm';
import { T, bodyStyle, captionStyle, inputStyle, inlineEditButtonStyle } from '../../theme';
import { Icon, Button, Modal } from '../../components/ui';
import { StoreImageCropModal } from './StoreImageCropModal';

// ดูร้าน
export function StoreDetailModal({ open, store, detail, account, onClose, onSaveStore, onSaveAccount, saving , pushToast }) {
    const imageInputRef = useRef(null);
    const [editing, setEditing] = useState(null);
    const [value, setValue] = useState('');
    const [accountValue, setAccountValue] = useState('');
    const [imageValue, setImageValue] = useState('');
    const [cropSource, setCropSource] = useState('');
    const [cropFileName, setCropFileName] = useState('');
    useEffect(() => {
        if (!open) {
            setEditing(null);
            setValue('');
            setAccountValue('');
            setImageValue('');
            setCropSource('');
            setCropFileName('');
        }
    }, [open, store?.StoreId]);

    if (!store) return null;

    const storeValue = (key) => {
        if (key === 'StoreName') return store.StoreName || '';
        return detail?.[key] || '';
    };

    const startEdit = (key) => {
        setEditing(key);
        setValue(String(storeValue(key) || ''));
    };

        const startImageEdit = () => {
        setEditing('ImageUrl');
        setImageValue(detail?.ImageUrl || '');
    };

    const handleImageChange = (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';

        if (!file) return;

        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            pushToast('รองรับเฉพาะไฟล์ JPG, PNG และ WebP', 'error');
            return;
        }

        if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
            pushToast(`ไฟล์ใหญ่เกินกำหนด อัปโหลดได้ไม่เกิน ${MAX_IMAGE_MB} MB`, 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = () => {
            setCropSource(String(reader.result));
            setCropFileName(file.name);
        };

        reader.readAsDataURL(file);
    };

    const saveImage = async () => {
        const current = detail?.ImageUrl || '';

        if (imageValue === current) {
            setEditing(null);
            return;
        }

        const patch = {
            StoreName: store.StoreName,
            Category: detail?.Category || '',
            ContactName: detail?.ContactName || '',
            ContactPhone: detail?.ContactPhone || '',
            ContactLine: detail?.ContactLine || '',
            ContactEmail: detail?.ContactEmail || '',
            Description: detail?.Description || '',
            ImageUrl: imageValue
        };

        const ok = await onSaveStore(patch);

        if (ok) {
            setEditing(null);
            setImageValue('');
        }
    };

        const saveStoreField = async (key) => {
        let next = value.trim();
        if (key === 'ContactPhone') {
            const phoneError = storePhoneError(next);
            if (phoneError) {
                pushToast(phoneError, 'error');
                return;
            }
            next = next.replace(/\D/g, '');
        }
        const current = String(storeValue(key) || '').trim();
        if (next === current) {
            setEditing(null);
            return;
        }
        const patch = {
            StoreName: key === 'StoreName' ? next : store.StoreName,
            Category: key === 'Category' ? next : (detail.Category || ''),
            ContactName: key === 'ContactName' ? next : (detail.ContactName || ''),
            ContactPhone: key === 'ContactPhone' ? next : (detail.ContactPhone || ''),
            ContactLine: key === 'ContactLine' ? next : (detail.ContactLine || ''),
            ContactEmail: key === 'ContactEmail' ? next : (detail.ContactEmail || ''),
            Description: key === 'Description' ? next : (detail.Description || '')
        };
        const ok = await onSaveStore(patch);
        if (ok) setEditing(null);
    };

    const startAccountEdit = (key) => {
        setEditing(`account:${key}`);
        setAccountValue(key === 'Password' ? '' : String(account?.[key] || ''));
    };

    const saveAccountField = async (key) => {
        const next = accountValue.trim();
                if (key === 'Password' && next.length < STORE_PASSWORD_MIN) {
            pushToast(`รหัสผ่านต้องยาวอย่างน้อย ${STORE_PASSWORD_MIN} ตัวอักษร`, 'error');
            return;
        }
        const current = String(account?.[key] || '').trim();
        if (key !== 'Password' && next === current) {
            setEditing(null);
            return;
        }
        const ok = await onSaveAccount(key, next);
        if (ok) {
            setEditing(null);
            setAccountValue('');
        }
    };

    const editableStoreItem = (key, label) => {
        const current = storeValue(key);
        const isEditing = editing === key;
        return (
            <div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ ...captionStyle, marginBottom: '4px' }}>{label}</div>
                                {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '7px' }}>
                        {key === 'Category' ? (
                            <select autoFocus value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
                                {!FOOD_CATEGORIES.includes(value) && <option value={value}>{value || '— เลือกประเภทอาหาร —'}</option>}
                                {FOOD_CATEGORIES.map((c) => (<option key={c} value={c}>{c}</option>))}
                            </select>
                                                ) : key === 'ContactPhone' ? (
                            <input autoFocus value={value} inputMode="tel" maxLength={12} placeholder="081-234-5678" onChange={(e) => setValue(e.target.value.replace(/[^\d-]/g, ''))} style={{ ...inputStyle, flex: 1, minWidth: 0 }}/>
                        ) : (
                            <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }}/>
                        )}
                        <Button variant="primary" icon="check" disabled={saving} onClick={() => saveStoreField(key)}>บันทึก</Button>
                        <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>ยกเลิก</Button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', minHeight: '30px' }}>
                        <div style={{ ...bodyStyle, color: current ? T.ink : T.muted, minWidth: 0 }}>{current || '—'}</div>
                        <button type="button" onClick={() => startEdit(key)} style={inlineEditButtonStyle} aria-label={`แก้ไข${label}`}>
                            <Icon name="edit" size={15} color={T.primary}/>
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const accountItem = (key, label, masked = false) => {
        const isEditing = editing === `account:${key}`;
        const shown = key === 'Password' ? '••••••••' : (account?.[key] || '—');
        return (
            <div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
                <div style={{ ...captionStyle, marginBottom: '4px' }}>{label}</div>
                {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '7px' }}>
                        <input
                            autoFocus
                            type={key === 'Password' ? 'password' : 'text'}
                            value={accountValue}
                            onChange={(e) => setAccountValue(e.target.value)}
                            placeholder={key === 'Password' ? 'ตั้งรหัสผ่านใหม่' : ''}
                            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                        />
                        <Button variant="primary" icon="check" disabled={saving} onClick={() => saveAccountField(key)}>บันทึก</Button>
                        <Button variant="ghost" disabled={saving} onClick={() => setEditing(null)}>ยกเลิก</Button>
                    </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', minHeight: '30px' }}>
                        <div style={{ ...bodyStyle, color: account ? T.ink : T.muted, minWidth: 0 }}>
                            {account ? shown : 'ยังไม่มีบัญชีเจ้าของร้าน'}
                        </div>
                        {account && key !== 'Username' && (
                            <button type="button" onClick={() => startAccountEdit(key)} style={inlineEditButtonStyle} aria-label={`แก้ไข${label}`}>
                                <Icon name="edit" size={15} color={T.primary}/>
                            </button>
                        )}
                    </div>

                    {key === 'Username' && account && (
                        <div style={{ ...captionStyle, fontSize: '11.5px' }}>
                            แก้ชื่อผู้ใช้ไม่ได้
                        </div>
                    )}
                  </>
                )}
            </div>
        );
    };

    return (<>
        <Modal open={open} title="ข้อมูลร้านค้า" subtitle={store.StoreName} onClose={onClose} width={720}
            footer={<Button variant="ghost" onClick={onClose}>ปิด</Button>}>
            <div>
                {editableStoreItem('StoreName', 'ชื่อร้านค้า')}
                {editableStoreItem('Category', 'ประเภท')}
                {editableStoreItem('ContactName', 'ชื่อผู้ติดต่อ')}
                {editableStoreItem('ContactPhone', 'เบอร์โทรศัพท์')}
                {editableStoreItem('ContactLine', 'LINE (ไม่บังคับ)')}
                {editableStoreItem('ContactEmail', 'อีเมล (ไม่บังคับ)')}
                {editableStoreItem('Description', 'รายละเอียดร้าน')}

                <div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
    <div style={{ ...captionStyle, marginBottom: '4px' }}>
        รูปหน้าร้าน
    </div>

    {editing === 'ImageUrl' ? (
        <div style={{ marginTop: '8px' }}>
            <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
                style={{ display: 'none' }}
            />

            {imageValue ? (
                <img
                    src={imageValue}
                    alt="ตัวอย่างรูปร้าน"
                    style={{
                        width: '100%',
                        maxWidth: '320px',
                        height: '180px',
                        objectFit: 'cover',
                        borderRadius: T.radiusMd,
                        border: `1px solid ${T.line}`,
                        display: 'block',
                        marginBottom: '10px'
                    }}
                />
            ) : (
                <div style={{
                    width: '100%',
                    maxWidth: '320px',
                    height: '180px',
                    border: `1px dashed ${T.line}`,
                    borderRadius: T.radiusMd,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: T.muted,
                    marginBottom: '10px'
                }}>
                    ไม่มีรูปหน้าร้าน
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button
                    variant="soft"
                    icon="edit"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={saving}
                >
                    {imageValue ? 'เปลี่ยนรูป' : 'เลือกรูป'}
                </Button>

                {imageValue && (
                    <Button
                        variant="danger"
                        icon="trash"
                        onClick={() => setImageValue('')}
                        disabled={saving}
                    >
                        ลบรูป
                    </Button>
                )}

                <Button
                    variant="primary"
                    icon="check"
                    onClick={saveImage}
                    disabled={saving}
                >
                    บันทึก
                </Button>

                <Button
                    variant="ghost"
                    onClick={() => {
                        setEditing(null);
                        setImageValue('');
                    }}
                    disabled={saving}
                >
                    ยกเลิก
                </Button>
            </div>
        </div>
    ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', minHeight: '30px' }}>
          {detail?.ImageUrl ? (
            <img
                src={detail.ImageUrl}
                alt="รูปร้าน"
                style={{
                    width: '100%',
                    maxWidth: '320px',
                    height: '180px',
                    objectFit: 'cover',
                    borderRadius: T.radiusMd,
                    border: `1px solid ${T.line}`,
                    display: 'block'
                }}
            />
          ) : (
            <div style={{ ...bodyStyle, color: T.muted }}>
                ยังไม่มีรูปหน้าร้าน
            </div>
          )}
          <button type="button" onClick={startImageEdit} style={inlineEditButtonStyle} aria-label="แก้ไขรูปหน้าร้าน">
            <Icon name="edit" size={15} color={T.primary}/>
          </button>
        </div>
    )}
</div>

<div style={{ marginTop: '22px', marginBottom: '4px', color: T.ink, fontWeight: 700, fontSize: '15px' }}>
    บัญชีเจ้าของร้าน
</div>
                {accountItem('FullName', 'ชื่อ-นามสกุล')}
                {accountItem('Username', 'Username')}
                <div style={{ padding: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                        <div style={{ ...captionStyle, marginBottom: '4px' }}>ตำแหน่ง</div>
                    </div>
                    <div style={{ ...bodyStyle, color: account ? T.ink : T.muted }}>
                        {account?.Role === 'Shop Owner' ? 'เจ้าของร้าน' : (account?.Role || '—')}
                    </div>
                </div>
                {accountItem('Password', 'รหัสผ่าน')}
            </div>
        </Modal>

        <StoreImageCropModal
          open={Boolean(cropSource)}
          imageSrc={cropSource}
          fileName={cropFileName}
          onCancel={() => {
            setCropSource('');
            setCropFileName('');
          }}
          onConfirm={(dataUrl) => {
            setImageValue(dataUrl);
            setCropSource('');
            setCropFileName('');
          }}
        />
    </>);
}
