// ฟังก์ชันเกี่ยวกับเวลา (เวลาไทย, นับถอยหลัง)

// วินาทีที่เหลือจนถึง CancelDeadline ที่ร้านกำหนด (ไม่รีเซ็ตเป็น 30 นาทีทุกครั้งที่เปิดแอป)
export const secondsUntil = (deadline) => {
  if (!deadline) return 1800;
  const iso = String(deadline).trim().replace(" ", "T");
  // backend ส่งเวลาไทยแบบไม่มี timezone -> อ่านเป็น +07:00 (ไม่ขึ้นกับเขตเวลาของเครื่องลูกค้า)
  const end = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}+07:00`).getTime();
  if (Number.isNaN(end)) return 1800;
  return Math.max(0, Math.floor((end - Date.now()) / 1000));
};

export const formatTimeLeft = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

export const getCurrentTimeFormatted = () => {
  const now = new Date();
  return now.toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " น.";
};

export const getCurrentDateTimeForBackend = () => {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const getPart = (type) => parts.find((p) => p.type === type)?.value || "00";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
};

export const parseBangkokTime = (value) => {
  if (!value) return null;
  const d = new Date(String(value).replace(" ", "T") + "+07:00");
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatBangkokTime = (d) =>
  d.toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false });
