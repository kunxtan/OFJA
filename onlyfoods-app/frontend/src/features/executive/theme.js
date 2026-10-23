// สี/ฟอนต์/สไตล์ inline ของหน้าผู้บริหาร (ใช้ร่วมทุกหน้าของผู้บริหาร)

export const T = {
    primary: '#FF724C',
    primaryDark: '#E8552D',
    primarySoft: '#FFEAE3',
    accent: '#FDBF50',
    accentSoft: '#FFF4DE',
    accentDark: '#E2A430',
    deep: '#2A2C41',
    deepDark: '#1D1F2F',
    deepSoft: '#EDEEF4',
    amber: '#E2A430',
    amberSoft: '#FFF4DE',
    greenSoft: '#E3F6EE',
    redSoft: '#FDEAE6',
    trackSoft: '#EDEEF4',
    ink: '#2A2C41',
    text: '#4B4E66',
    muted: '#8A8FA6',
    line: '#E6E8F0',
    bg: '#F6F7FB',
    surface: '#FFFFFF',
    up: '#17A673',
    down: '#E2452F',
    sideBg: '#FFFFFF',
    sideText: '#4B4E66',
    sideActive: '#FFEAE3',
    radiusLg: '14px',
    radiusMd: '9px',
    shadowSm: '0 2px 10px rgba(42,44,65,0.05)',
    shadowMd: '0 10px 26px rgba(42,44,65,0.10)'
};

export const TOPBAR_H = 80;

export const FONT_STACK = "'Roboto', 'Sarabun', sans-serif";

export const h2Style = { margin: 0, fontSize: '24px', fontWeight: 700, color: T.ink, lineHeight: 1.3 };

export const h3Style = { margin: 0, fontSize: '18px', fontWeight: 600, color: T.ink };

export const bodyStyle = { fontSize: '14px', color: T.text, lineHeight: 1.6 };

export const captionStyle = { margin: '4px 0 0', fontSize: '12.5px', color: T.muted, lineHeight: 1.5 };

export const ellipsisStyle = { overflow: 'hidden', textOverflow: 'ellipsis',whiteSpace: 'nowrap',color: T.ink,
    fontWeight: 600,fontSize: '13px'
};

export const shellStyle = {display: 'flex',flexDirection: 'column',position: 'relative',width: '100%',maxWidth: '100%',minWidth: 0,height: '100dvh',minHeight: '100dvh',overflow: 'hidden',
    background: T.bg,color: T.text,margin: 0,padding: 0};

export const shellBodyStyle = { display: 'flex', alignItems: 'stretch', flex: 1, minHeight: 0, width: '100%', position: 'relative' };

export const mainScrollStyle = { flex: '1 1 0%', minWidth: 0, width: 0, maxWidth: '100%', overflowY: 'auto', overflowX: 'hidden' };

export const sidebarStyle = { width: '260px', minWidth: '260px', padding: '16px 16px 12px', boxSizing: 'border-box', background: T.sideBg, borderRight: `1px solid ${T.line}`, display: 'flex', flexDirection: 'column', alignSelf: 'stretch', overflowY: 'auto', flexShrink: 0, boxShadow: '0 1px 3px rgba(18,25,38,0.02)' };

export const brandStyle = { width: '212px', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', whiteSpace: 'nowrap', minWidth: 0 };

export const brandTitleStyle = { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '20px', fontWeight: 700, color: T.primary };

export const brandSubtitleStyle = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginTop: '4px', color: T.muted };

export const sidebarLabelStyle = { color: T.ink, fontSize: '14px', fontWeight: 500, padding: '12px 16px', marginBottom: '4px' };

export const sidebarItemStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: '16px', padding: '10px 16px', marginBottom: '8px', border: 'none', borderRadius: T.radiusMd, cursor: 'pointer', textAlign: 'left', fontSize: '14px', fontFamily: FONT_STACK, transition: 'background .18s ease, color .18s ease' };

export const avatarStyle = { width: '34px', height: '34px', minWidth: '34px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: T.primary, color: '#FFFFFF', fontWeight: 700, fontSize: '14px' };

export const backdropStyle = { position: 'absolute', inset: 0, background: 'rgba(18,25,38,0.45)', zIndex: 55 };

export const topbarStyle = { minHeight: `${TOPBAR_H}px`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px', background: T.surface, borderBottom: `1px solid ${T.line}`, position: 'sticky', top: 0, zIndex: 70, flexShrink: 0, boxSizing: 'border-box', flexWrap: 'wrap' };

export const iconButtonStyle = { position: 'relative', width: '38px', height: '38px', display: 'grid', placeItems: 'center', border: 'none', borderRadius: T.radiusMd, background: T.primarySoft, color: T.primary, cursor: 'pointer', padding: 0, transition: 'background .2s ease, color .2s ease' };

export const searchWrapStyle = { flex: '0 1 420px', minWidth: '180px', maxWidth: '420px', display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${T.line}`, borderRadius: '8px', background: T.surface, boxShadow: '0 1px 2px rgba(18,25,38,0.02)' };

export const searchInputStyle = { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: T.text, fontSize: '13.5px', fontFamily: FONT_STACK, padding: '6px 0' };

export const courtPillStyle = { display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap' };

export const notifBadgeStyle = { position: 'absolute', top: '-6px', right: '-6px', minWidth: '19px', height: '19px', padding: '0 5px', borderRadius: '999px', background: T.primary, color: '#FFFFFF', fontSize: '11px', fontWeight: 700, display: 'grid', placeItems: 'center', boxSizing: 'border-box' };

export const dropdownBackdropStyle = { position: 'fixed', inset: 0, zIndex: 40 };

export const notifPanelStyle = { position: 'absolute', top: '46px', right: 0, width: 'min(330px, 90vw)', background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, boxShadow: '0 18px 40px rgba(18,25,38,0.16)', overflow: 'hidden', zIndex: 50 };

export const notifHeadStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: `1px solid ${T.line}` };

export const notifItemStyle = { width: '100%', display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 16px', border: 'none', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', textAlign: 'left', fontFamily: FONT_STACK };

export const topAccountStyle = { display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 12px 6px 6px', border: 'none', borderRadius: '999px', background: T.deepSoft, maxWidth: '250px', cursor: 'pointer', fontFamily: FONT_STACK, transition: 'background .2s ease' };

export const profilePanelStyle = { position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 'min(290px, 86vw)', background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, boxShadow: '0 12px 34px rgba(18,25,38,0.14)', padding: '20px', zIndex: 80 };

export const dropdownItemStyle = { width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', marginBottom: '2px', border: 'none', borderRadius: '6px', background: 'transparent', color: T.text, fontSize: '14px', fontFamily: FONT_STACK, textAlign: 'left', cursor: 'pointer', transition: 'background .2s ease, color .2s ease' };

export const contentStyle = { width: '100%', maxWidth: 'none', minWidth: 0, margin: 0, padding: 'clamp(16px, 2.2vw, 24px)', minHeight: `calc(100dvh - ${TOPBAR_H}px)`, boxSizing: 'border-box', overflowX: 'hidden' };

export const courtBannerStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', marginBottom: '18px', borderRadius: T.radiusLg, background: T.redSoft, border: `1px solid ${T.redSoft}`, color: T.down, fontSize: '13.5px', fontWeight: 600 };

export const cardStyle = { background: T.surface, border: 'none', borderRadius: T.radiusLg, padding: 'clamp(18px, 2.2vw, 24px)', boxSizing: 'border-box', position: 'relative', boxShadow: T.shadowSm };

export const cardHeadStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' };

export const chartGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '24px' };

export const toolbarStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '14px', flexWrap: 'wrap' };

export const courtControlStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' };

export const tableStyle = { width: '100%', borderCollapse: 'collapse', minWidth: '760px', marginTop: '12px' };

export const thStyle = { padding: '16px', background: T.surface, color: T.ink, fontSize: '14px', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: `1px solid ${T.line}` };

export const thRightStyle = { ...thStyle, textAlign: 'right' };

export const trStyle = { borderBottom: `1px solid ${T.line}` };

export const tdStyle = { padding: '16px', fontSize: '14px', color: T.text, verticalAlign: 'middle' };

export const tdRightStyle = { ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' };

export const cancelStatRowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' };

export const cancelStatBoxStyle = { background: T.bg, borderRadius: T.radiusMd, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' };

export const cancelStatLabelStyle = { fontSize: '12.5px', color: T.muted, fontWeight: 600 };

export const cancelStatValueStyle = { fontSize: '20px', color: T.ink, fontWeight: 700, lineHeight: 1.3 };

export const cancelChipRowStyle = { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' };

export const cancelChipStyle = (active) => ({ padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 600, fontFamily: FONT_STACK, cursor: 'pointer', whiteSpace: 'nowrap', background: active ? T.primarySoft : T.surface, color: active ? T.primaryDark : T.text, border: `1px solid ${active ? T.primary : T.line}` });

export const storeThumbStyle = { width: '38px', height: '38px', borderRadius: T.radiusMd, display: 'grid', placeItems: 'center', background: T.primarySoft, color: T.primary, fontWeight: 700 };

export const SELECT_CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%238A8FA6' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E\")";

export const inputStyle = { width: '100%', padding: '11px 13px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, fontSize: '13.5px', fontFamily: FONT_STACK, color: T.text, background: T.surface, boxSizing: 'border-box', outlineColor: T.primary };

export const formDateInputStyle = { ...inputStyle, display: 'block', width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' };

export const twoColStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '0 14px' };

export const smallBtn = { padding: '7px 10px', fontSize: '12.5px' };

export const inlineEditButtonStyle = { border: 'none', background: 'transparent', padding: '4px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };

export const storeImagePreviewStyle = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

export const storeImageShadeStyle = { position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(42,44,65,0.02) 48%, rgba(42,44,65,0.62) 100%)', pointerEvents: 'none' };

export const storeImageChangeBadgeStyle = { position: 'absolute', left: '16px', bottom: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 11px', borderRadius: '999px', background: 'rgba(42,44,65,0.78)', color: '#FFFFFF', fontSize: '12px', fontWeight: 700, backdropFilter: 'blur(7px)' };

export const storeImageEmptyStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '7px', width: '100%', height: '100%', padding: '22px', boxSizing: 'border-box' };

export const storeImageIconStyle = { position: 'relative', width: '58px', height: '58px', borderRadius: '18px', display: 'grid', placeItems: 'center', background: T.primarySoft, marginBottom: '4px' };

export const storeImagePlusStyle = { position: 'absolute', right: '-3px', bottom: '-3px', width: '22px', height: '22px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: T.primary, border: `3px solid ${T.surface}`, boxSizing: 'content-box' };

export const storeImageFormatPillStyle = { marginTop: '3px', padding: '5px 10px', borderRadius: '999px', background: T.trackSoft, color: T.muted, fontSize: '11.5px', fontWeight: 600 };

export const storeImageFooterStyle = { marginTop: '10px', padding: '10px 12px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: '#FAFAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' };

export function storeImageUploaderStyle(dragOver, hasError, hasImage) { return { width: '100%', height: hasImage ? '230px' : '190px', position: 'relative', borderRadius: '16px', border: `2px dashed ${hasError ? T.down : dragOver ? T.primary : '#D8DCE8'}`, background: dragOver ? T.primarySoft : hasImage ? '#F4F5F8' : 'linear-gradient(135deg, #FFFDFC 0%, #FAFAFC 100%)', display: 'grid', placeItems: 'center', cursor: 'pointer', overflow: 'hidden', padding: 0, fontFamily: FONT_STACK, boxSizing: 'border-box', transition: 'border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease', boxShadow: dragOver ? `0 0 0 4px ${T.primarySoft}` : 'none' }; }

export const dateWrapStyle = { display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 12px', border: `1px solid ${T.line}`, borderRadius: T.radiusMd, background: T.surface };

export const dateInputStyle = { minWidth: 0, maxWidth: '100%', border: 'none', outline: 'none', background: 'transparent', color: T.text, fontSize: '13px', fontFamily: FONT_STACK };

export const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(42,44,65,0.5)', display: 'grid', placeItems: 'center', padding: '18px', zIndex: 90 };

export const modalStyle = { width: '100%', background: T.surface, borderRadius: '16px', boxShadow: '0 26px 60px rgba(42,44,65,0.26)', overflow: 'hidden', maxHeight: 'calc(100dvh - 24px)' };

export const modalHeadStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', padding: '18px 22px', borderBottom: `1px solid ${T.line}` };

export const modalFootStyle = { display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '14px 22px', borderTop: `1px solid ${T.line}`, background: '#FAFAFC' };

export const popupNoticeOverlayStyle = { position: 'fixed', inset: 0, zIndex: 140, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '90px 18px 18px', pointerEvents: 'none', background: 'rgba(42,44,65,0.10)' };

export const popupNoticeStyle = { width: 'min(520px, 92vw)', background: T.surface, borderRadius: '16px', boxShadow: '0 24px 60px rgba(42,44,65,0.24)', border: `1px solid ${T.line}`, padding: '20px 22px', display: 'flex', alignItems: 'flex-start', gap: '15px', pointerEvents: 'auto' };

export const popupNoticeIconStyle = { width: '54px', height: '54px', minWidth: '54px', borderRadius: '16px', display: 'grid', placeItems: 'center' };

export const popupNoticeCloseStyle = { width: '34px', height: '34px', border: 'none', borderRadius: '9px', background: T.bg, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 };

export const tooltipStyle = { position: 'absolute', top: '8px', padding: '10px 13px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: T.radiusLg, boxShadow: '0 12px 28px rgba(42,44,65,0.16)', pointerEvents: 'none', minWidth: '190px', zIndex: 5 };
