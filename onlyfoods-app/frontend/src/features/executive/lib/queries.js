// คำขอข้อมูลของหน้าผู้บริหารที่จำผลไว้ใน lib/apiCache : [key, fetcher]
// หน้าและการโหลดล่วงหน้า (ExecutiveView) ต้องใช้ key เดียวกัน จึงรวมไว้ที่นี่ที่เดียว
import { callApi } from './api';
import { daysAgoISO } from './format';
import { auditCodesMatching } from '../../../lib/auditText';

const asList = (data) => (Array.isArray(data) ? data : []);

// รายชื่อร้านรวมร้านที่ถูกลบ (ยอดขายรายร้าน)
export const storesHistoryQuery = (API) => [`exec:stores-history:${API}`, () => callApi(`${API}/api/stores/history`).then(asList)];

// บัญชีฝั่งร้าน (หน้าบัญชีร้านค้า + เจ้าของร้านในหน้าจัดการร้าน ใช้ชุดเดียวกัน)
export const storeAccountsQuery = (API) => [`exec:store-accounts:${API}`, () => callApi(`${API}/api/store-accounts`).then(asList)];

// อุทธรณ์การระงับบัญชีที่รอพิจารณา (หน้าข้อมูลผู้ใช้)
export const appealsQuery = (API) => [`exec:appeals:${API}`, () => callApi(`${API}/api/executive/suspension-appeals`).then(asList)];

// รายงานปัญหา : params '' = ทั้งศูนย์ไม่กรอง (กระดิ่ง + Dashboard) ; หน้ารายงานปัญหาส่งตัวกรองของตัวเอง
export const ISSUE_DEFAULT_RANGE = '30';
export function issueParams({ storeId = '', typeCode = '', range = ISSUE_DEFAULT_RANGE, customStart = '', customEnd = '' } = {}) {
    const params = new URLSearchParams();
    if (storeId) params.set('store_id', storeId);
    if (typeCode) params.set('type_code', typeCode);
    if (range === 'custom') {
        if (customStart) params.set('date_from', customStart);
        if (customEnd) params.set('date_to', customEnd);
    } else if (range !== 'all') {
        params.set('date_from', daysAgoISO(Number(range) - 1));
    }
    return params.toString();
}
export const issuesQuery = (API, params = '') => [`exec:issues:${API}?${params}`, () => callApi(`${API}/api/executive/issues?${params}`)];

// Audit Log : จำเฉพาะหน้าแรกของแต่ละคำค้น/ตัวกรอง (กด "โหลดเพิ่ม" ต่อจากนั้นตามปกติ)
export const AUDIT_PAGE_SIZE = 100;
export function auditUrl(API, { query = '', filter = 'all', actionFilter = '' } = {}, offset = 0) {
    const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(offset) });
    const keyword = query.trim().toLowerCase();
    if (keyword) {
        params.set('q', keyword);
        const codes = auditCodesMatching(keyword);
        if (codes.length) params.set('actions', codes.join(','));
    }
    if (filter !== 'all') params.set('group', filter);
    if (actionFilter) params.set('action', actionFilter);
    return `${API}/api/audit-logs?${params}`;
}
export const auditFirstPageQuery = (API, filters) => {
    const url = auditUrl(API, filters, 0);
    return [`exec:audit:${url}`, () => callApi(url).then(asList)];
};
