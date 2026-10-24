// คำขอที่จำผลไว้ใน lib/apiCache ของหน้าร้าน : แท็บและการโหลดล่วงหน้าใช้ key เดียวกัน
export const counterReportsQuery = (apiBase, storeId) => [`counter:reports:${apiBase}:${storeId}`, async () => {
  const [dashboard, cancellations] = await Promise.all([
    fetch(`${apiBase}/api/reports/dashboard?store_id=${storeId}`).then(r => r.json()),
    fetch(`${apiBase}/api/reports/cancellations?store_id=${storeId}`).then(r => r.json()),
  ]);
  return {
    dashboard: Array.isArray(dashboard) ? dashboard[0] || null : null,
    cancellations: Array.isArray(cancellations) ? cancellations : [],
  };
}];
