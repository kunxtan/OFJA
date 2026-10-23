import { useEffect, useState } from 'react';
import Cropper from 'react-easy-crop';
import { T } from '../../theme';
import { Button, Modal } from '../../components/ui';

// ===== ครอปรูปหน้าร้านก่อนนำไปบันทึก =====
export function StoreImageCropModal({ open, imageSrc, fileName, onCancel, onConfirm }) {
    const [crop, setCrop] = useState({ x: 0, y: 0 }), [zoom, setZoom] = useState(1), [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    useEffect(() => {
        if (!open) return;
        setCrop({ x: 0, y: 0 }); setZoom(1); setCroppedAreaPixels(null);
    }, [open, imageSrc]);

    if (!open || !imageSrc) return null;

    const applyCrop = async () => {
        if (!croppedAreaPixels) return;
        try {
            const image = new Image(); image.src = imageSrc;
            await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });

            const sourceCanvas = document.createElement('canvas'), sourceCtx = sourceCanvas.getContext('2d');
            if (!sourceCtx) return;
            sourceCanvas.width = croppedAreaPixels.width; sourceCanvas.height = croppedAreaPixels.height;
            sourceCtx.imageSmoothingEnabled = true; sourceCtx.imageSmoothingQuality = 'high';
            sourceCtx.drawImage(image, croppedAreaPixels.x, croppedAreaPixels.y, croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, croppedAreaPixels.width, croppedAreaPixels.height);

            const outputCanvas = document.createElement('canvas'), outputCtx = outputCanvas.getContext('2d');
            if (!outputCtx) return;
            outputCanvas.width = 1280; outputCanvas.height = 720;
            outputCtx.imageSmoothingEnabled = true; outputCtx.imageSmoothingQuality = 'high';
            outputCtx.drawImage(sourceCanvas, 0, 0, 1280, 720);

            const dataUrl = outputCanvas.toDataURL('image/jpeg', 0.94);
            const safeName = String(fileName || 'store-image').replace(/\.[^.]+$/, '') + '-cropped.jpg';
            onConfirm(dataUrl, safeName);
        } catch (error) { console.error('Crop image error:', error); }
    };

    return (
        <Modal open={open} title="ครอปรูปหน้าร้าน" subtitle="เลื่อนและซูมรูปให้ส่วนที่ต้องการอยู่ในกรอบ" onClose={onCancel} width={720}
            footer={<>
                <Button variant="ghost" onClick={() => { setCrop({ x: 0, y: 0 }); setZoom(1); }} style={{ marginRight: 'auto' }}>รีเซ็ต</Button>
                <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>
                <Button icon="check" onClick={applyCrop}>ใช้รูปนี้</Button>
            </>}
        >
            <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: '430px', background: '#11131A', borderRadius: T.radiusMd, overflow: 'hidden' }}>
                <Cropper image={imageSrc} crop={crop} zoom={zoom} minZoom={0.5}   maxZoom={3} aspect={16 / 9} showGrid={false} onCropChange={setCrop} onCropComplete={(croppedArea, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)} onZoomChange={setZoom} />
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button variant="ghost" onClick={() => setZoom(prev => Math.max(0.5, Number((prev - 0.1).toFixed(1))))}>−</Button>
                <input type="range" min={0.5} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
                <Button variant="ghost" onClick={() => setZoom(prev => Math.min(3, Number((prev + 0.1).toFixed(1))))}>+</Button>
                <span style={{ minWidth: '48px', textAlign: 'right', color: T.muted, fontSize: '12px' }}>{Math.round(zoom * 100)}%</span>
            </div>

            <div style={{ marginTop: '10px', color: T.muted, fontSize: '12px', textAlign: 'center' }}>
                ลากรูปเพื่อจัดตำแหน่ง · ใช้สองนิ้วเพื่อซูมบนมือถือและ iPad
            </div>
        </Modal>
    );
}
