/* พิมพ์ใบคิว/ใบเสร็จขนาดกระดาษความร้อน 80mm ผ่านหน้าต่างพิมพ์ของเบราว์เซอร์ (window.print)
   ใช้ข้อมูล print_data ที่ backend ตอบกลับ (ข้อมูลจริงที่บันทึกใน PrintJob) ไม่ใช่ข้อมูลในหน้าจอ
   พิมพ์ใน iframe ที่ซ่อนไว้ : หน้าแอปไม่เปลี่ยน ไม่โดนตัวบล็อก popup และ CSS ของแอปไม่ปนกับใบเสร็จ */

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function receiptHtml({ storeName, data, reprint = false, printedAt = new Date() }) {
  const items = (data?.items || []).map((i) => {
    const qty = Number(i.qty) || 0;
    const price = Number(i.unit_price) || 0;
    return `<tr><td class="name">${esc(i.product)}</td><td class="qty">${qty}</td><td class="amt">${money(qty * price)}</td></tr>`
      + (qty > 1 ? `<tr class="sub"><td colspan="3">@ ${money(price)}</td></tr>` : '');
  }).join('');
  const when = printedAt.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คิว ${esc(data?.queueNo)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { width: 80mm; padding: 4mm; font: 12px/1.35 Tahoma, "Noto Sans Thai", sans-serif; }
  .c { text-align: center; }
  .store { font-size: 15px; font-weight: 700; }
  .tag { display: inline-block; margin-top: 2mm; padding: 0.5mm 2mm; border: 1px solid #000; font-size: 11px; }
  .qlabel { margin-top: 3mm; font-size: 11px; }
  .queue { font-size: 34px; font-weight: 800; letter-spacing: 1px; line-height: 1.1; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2.5mm 0; }
  .meta { display: flex; justify-content: space-between; gap: 2mm; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font: inherit; }
  td { padding: 0.6mm 0; vertical-align: top; }
  .name { word-break: break-word; }
  .qty { width: 9mm; text-align: center; }
  .amt { width: 19mm; text-align: right; }
  .sub td { padding-top: 0; font-size: 10px; color: #333; }
  .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; }
  .foot { margin-top: 3mm; font-size: 10px; }
</style></head><body>
  <div class="c">
    <div class="store">${esc(storeName || 'OnlyFoods')}</div>
    ${reprint ? '<div class="tag">พิมพ์ซ้ำ (สำเนา)</div>' : ''}
    <div class="qlabel">หมายเลขคิว</div>
    <div class="queue">${esc(data?.queueNo)}</div>
  </div>
  <hr>
  <div class="meta"><span>ลูกค้า: ${esc(data?.customerName || '-')}</span><span>#${esc(data?.orderId)}</span></div>
  <div class="meta"><span>${esc(when)}</span></div>
  <hr>
  <table>${items}</table>
  <hr>
  <div class="total"><span>รวม</span><span>฿${money(data?.totalAmount)}</span></div>
  <div class="c foot">ขอบคุณที่ใช้บริการ OnlyFoods<br>แสดงเลขคิวนี้เมื่อรับอาหาร</div>
</body></html>`;
}

// คืน true ถ้าเปิดหน้าต่างพิมพ์ได้
export function printReceipt(opts) {
  try {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(receiptHtml(opts));
    doc.close();
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.isConnected && frame.remove(), 60000); // เผื่อเบราว์เซอร์ไม่ส่ง afterprint
    }, 50);
    return true;
  } catch {
    return false;
  }
}
