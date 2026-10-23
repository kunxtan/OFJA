import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../ui';
import { CROP_RATIOS, CROP_OUTPUT_MAX } from './imageFile';

// ความกว้างสูงสุดของรูปที่ส่งขึ้น server (px)

// ratios / title / outputMax / round : ใช้ซ้ำกับรูปโปรไฟล์พนักงาน (1:1 วงกลม) ได้
export function ImageCropper({ src, onCancel, onConfirm, ratios = CROP_RATIOS, title = 'ครอปรูปเมนู', outputMax = CROP_OUTPUT_MAX, round = false }) {
  const [natural, setNatural] = useState(null); // { w, h }
  const [loadError, setLoadError] = useState('');
  const [ratioId, setRatioId] = useState(ratios[0].id);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [frameW, setFrameW] = useState(440);
  const [busy, setBusy] = useState(false);
  const stageRef = useRef(null);
  const dragRef = useRef(null);

  const ratio = (ratios.find(r => r.id === ratioId) || ratios[0]).value;
  const frameH = Math.round(frameW / ratio);
  const baseScale = natural ? Math.max(frameW / natural.w, frameH / natural.h) : 1;
  const scale = baseScale * zoom;

  const clamp = (p, sc = scale) => {
    if (!natural) return p;
    const minX = frameW - natural.w * sc;
    const minY = frameH - natural.h * sc;
    return { x: Math.min(0, Math.max(minX, p.x)), y: Math.min(0, Math.max(minY, p.y)) };
  };

  // วางรูปให้อยู่กลางกรอบ (ตอนโหลดเสร็จ / เปลี่ยนสัดส่วน / ปรับขนาดจอ)
  const centerImage = () => {
    if (!natural) return;
    const sc = Math.max(frameW / natural.w, frameH / natural.h);
    setZoom(1);
    setPos({ x: (frameW - natural.w * sc) / 2, y: (frameH - natural.h * sc) / 2 });
  };

  useEffect(() => {
    const measure = () => {
      const max = Math.min(460, window.innerWidth - 64);
      setFrameW(Math.max(220, Math.round(max)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => { centerImage(); }, [natural, ratioId, frameW]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onCancel]);

  // ซูมโดยรักษาจุดกึ่งกลางกรอบไว้ที่เดิม
  const applyZoom = (nextZoom) => {
    if (!natural) return;
    const z = Math.min(4, Math.max(1, nextZoom));
    const nextScale = baseScale * z;
    const cx = (frameW / 2 - pos.x) / scale;
    const cy = (frameH / 2 - pos.y) / scale;
    setZoom(z);
    setPos(clamp({ x: frameW / 2 - cx * nextScale, y: frameH / 2 - cy * nextScale }, nextScale));
  };

  const onPointerDown = (e) => {
    if (!natural) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp({ x: d.origin.x + (e.clientX - d.startX), y: d.origin.y + (e.clientY - d.startY) }));
  };
  const onPointerUp = () => { dragRef.current = null; };

  // ล้อเมาส์ซูม (ต้องผูกแบบ passive: false จึงกัน scroll หน้าได้)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const confirmCrop = () => {
    if (!natural) return;
    setBusy(true);
    const img = new Image();
    img.onload = () => {
      const sx = -pos.x / scale;
      const sy = -pos.y / scale;
      const sw = frameW / scale;
      const sh = frameH / scale;
      const outW = Math.max(1, Math.round(Math.min(outputMax, sw)));
      const outH = Math.max(1, Math.round(outW / ratio));
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF'; // พื้นขาวแทนส่วนโปร่งใส (บันทึกเป็น JPG)
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      let dataUrl;
      try {
        dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      } catch (err) {
        setBusy(false);
        setLoadError('ไม่สามารถครอปรูปนี้ได้ กรุณาเลือกไฟล์รูปใหม่');
        return;
      }
      const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);
      setBusy(false);
      onConfirm(dataUrl, { width: outW, height: outH, size: bytes });
    };
    img.onerror = () => { setBusy(false); setLoadError('ไม่สามารถครอปรูปนี้ได้'); };
    img.src = src;
  };

  // render ไว้ท้าย .berry-root (ได้ตัวแปรสีของธีม) เพื่อให้ลอยเหนือฟอร์มเมนูเสมอ
  return createPortal(
    <div className="crop-overlay" onClick={() => { if (!busy) onCancel(); }}>
      <div className="crop-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="crop-head">
          <div>
            <h3>{title}</h3>
            <p>ลากรูปเพื่อจัดตำแหน่ง และซูมให้ได้ส่วนที่ต้องการ</p>
          </div>
          {ratios.length > 1 && (
            <div className="crop-ratios" role="group" aria-label="สัดส่วนรูป">
              {ratios.map(r => (
                <button key={r.id} type="button" className={ratioId === r.id ? 'active' : ''} onClick={() => setRatioId(r.id)} disabled={busy}>
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          ref={stageRef}
          className="crop-stage"
          style={{ width: frameW, height: frameH }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={src}
            alt=""
            draggable={false}
            onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setLoadError('ไม่สามารถเปิดรูปนี้ได้')}
            style={natural ? {
              width: natural.w * scale,
              height: natural.h * scale,
              transform: `translate(${pos.x}px, ${pos.y}px)`,
            } : { opacity: 0 }}
          />
          <div className="crop-grid" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          {round && <div className="crop-round-mask" aria-hidden="true" />}
        </div>

        <div className="crop-zoom">
          <button type="button" onClick={() => applyZoom(zoom - 0.25)} disabled={busy || zoom <= 1} aria-label="ซูมออก">−</button>
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            value={zoom}
            onChange={e => applyZoom(Number(e.target.value))}
            disabled={busy || !natural}
            aria-label="ระดับการซูม"
          />
          <button type="button" onClick={() => applyZoom(zoom + 0.25)} disabled={busy || zoom >= 4} aria-label="ซูมเข้า">+</button>
          <button type="button" className="crop-reset" onClick={centerImage} disabled={busy || !natural}>รีเซ็ต</button>
        </div>

        {loadError && <div className="mf-field-error" style={{ textAlign: 'center' }}>{loadError}</div>}

        <div className="crop-footer">
          <button type="button" className="mf-btn ghost" onClick={onCancel} disabled={busy}>ยกเลิก</button>
          <button type="button" className="mf-btn primary" onClick={confirmCrop} disabled={busy || !natural}>
            {busy ? <span className="berry-spinner" /> : <Icon name="crop" size={17} />}
            {busy ? 'กำลังครอป...' : 'ใช้รูปนี้'}
          </button>
        </div>
      </div>
    </div>,
    document.querySelector('.berry-root') || document.body
  );
}
