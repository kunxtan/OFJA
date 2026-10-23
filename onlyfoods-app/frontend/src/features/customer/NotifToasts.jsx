import { useEffect } from "react";
import { NotiIcon } from "./icons";

// ป๊อปอัพแจ้งเตือนที่เด้งขึ้นด้านบนของทุกหน้า หายเองใน 6 วินาที แตะเพื่อไปหน้าการแจ้งเตือน
function NotifToastItem({ toast, icon, onClose, onOpen }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.key]);

  return (
    <div
      onClick={onOpen}
      role="alert"
      style={{
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "14px 14px 14px 16px",
        background: "#FFFFFF",
        borderRadius: "16px",
        borderLeft: "5px solid #EA580C",
        boxShadow: "0 12px 32px rgba(42, 44, 65, 0.28)",
        cursor: "pointer",
        animation: "notifToastIn 0.3s ease-out",
        fontFamily: "inherit",
      }}
    >
      <div style={{ color: "#EA580C", flexShrink: 0, marginTop: "1px" }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: "900", fontSize: "14px", color: "#1E293B", marginBottom: "2px" }}>{toast.title}</div>
        <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.45, overflowWrap: "anywhere" }}>{toast.message}</div>
      </div>
      <button
        type="button"
        aria-label="ปิดการแจ้งเตือน"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        style={{
          border: "none",
          background: "transparent",
          color: "#94A3B8",
          fontSize: "18px",
          lineHeight: 1,
          cursor: "pointer",
          padding: "2px 4px",
          fontFamily: "inherit",
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function NotifToasts({ toasts, setToasts, handleSelectTab }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: "max(12px, env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(92vw, 420px)",
        zIndex: 3000,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        pointerEvents: "none",
      }}
    >
      <style>{`@keyframes notifToastIn { from { opacity: 0; transform: translateY(-16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {toasts.map((toast) => (
        <NotifToastItem
          key={toast.key}
          toast={toast}
          icon={<NotiIcon />}
          onClose={() => setToasts((prev) => prev.filter((t) => t.key !== toast.key))}
          onOpen={() => {
            setToasts((prev) => prev.filter((t) => t.key !== toast.key));
            handleSelectTab("notifs");
          }}
        />
      ))}
    </div>
  );
}
