// Google Login : client id (ตั้งตอน build) + อ่าน payload ของ id token

// ตั้งตอน build (docker-compose.cloud.yml ส่ง GOOGLE_CLIENT_ID จาก .env มาเป็น VITE_GOOGLE_CLIENT_ID) ; ว่าง = ซ่อนปุ่ม Google
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

// JWT ใช้ base64url และชื่อเป็น UTF-8 (ชื่อไทย) : atob() ตรง ๆ จะพัง
export function decodeJwtPayload(token) {
  try {
    const b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}
