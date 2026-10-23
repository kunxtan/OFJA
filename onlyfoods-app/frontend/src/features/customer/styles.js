// สไตล์พื้นฐานของหน้าลูกค้า
import { COLORS } from "./constants";

// STYLE
export const pageStyle = { minHeight: "100vh", height: "100vh", overflowY: "auto", scrollbarWidth: "none", background: COLORS.bg, color: COLORS.text, fontFamily: "'Sarabun', 'Roboto', sans-serif", boxSizing: "border-box" };

export const containerStyle = { width: "100%", maxWidth: "1450px", margin: "0 auto", padding: "20px 20px 110px", boxSizing: "border-box" };

export const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "15px", marginBottom: "25px", flexWrap: "wrap" };


export const searchStyle = { flex: "1", minWidth: "220px", maxWidth: "560px", padding: "13px 20px", border: `1px solid ${COLORS.border}`, borderRadius: "30px", outline: "none", fontSize: "14px", background: COLORS.white, boxSizing: "border-box" };

export const profileStyle = { display: "flex", alignItems: "center", gap: "10px", background: COLORS.white, borderRadius: "30px", padding: "7px 14px 7px 7px", boxShadow: "0 4px 18px rgba(42,44,65,0.06)", cursor: "pointer" };

export const avatarStyle = { width: "40px", height: "40px", borderRadius: "50%", background: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "19px", overflow: "hidden" };

export const heroStyle = { background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.yellow})`, borderRadius: "28px", padding: "32px", color: COLORS.white, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", marginBottom: "28px", overflow: "hidden" };

export const cardStyle = { background: COLORS.white, borderRadius: "20px", padding: "13px", boxShadow: "0 7px 25px rgba(42,44,65,0.07)", border: `1px solid ${COLORS.border}` };
