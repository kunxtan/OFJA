import { parseOrderDate } from '../../lib/dates';
import { fmtMoney } from '../../lib/format';
import { PageHeader, Icon, Skeleton } from '../../components/ui';
import { Stars, RATING_TONE, ReviewCard, ReviewPhotoLightbox } from './ReviewCard';

// หน้ารีวิวจากลูกค้า : สรุปคะแนน กรอง/เรียง รูปรีวิว
// ข้อมูลและ state อยู่ที่ OwnerView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function ReviewsPage({
  reviewsData, reviewSearch, reviewFilter, reviewOnly, reviewSort, setReviewFilter, setReviewSearch,
  setReviewOnly, setReviewSort, loaded, setReviewPhoto, reviewPhoto
}) {
  const all = reviewsData.reviews || [];
  const sm = reviewsData.summary || {};
  const total = sm.total || 0;
  const breakdown = sm.breakdown || {};
  const last30 = sm.last30 || {};
  const prev30 = sm.prev30 || {};
  const trend = last30.average != null && prev30.average != null ? last30.average - prev30.average : null;
  const q = reviewSearch.trim().toLowerCase();
  const shown = all
    .filter(r => reviewFilter === 'all' || String(r.Rating) === reviewFilter)
    .filter(r => reviewOnly !== 'comment' || (r.Comment || '').trim())
    .filter(r => reviewOnly !== 'photo' || r.ImageUrl)
    .filter(r => !q || (r.Comment || '').toLowerCase().includes(q)
      || (r.items || []).some(i => String(i.ProductName || '').toLowerCase().includes(q))
      || String(r.QueueNo || '').toLowerCase().includes(q))
    .sort((a, b) => (reviewSort === 'low' ? a.Rating - b.Rating : reviewSort === 'high' ? b.Rating - a.Rating : 0)
      || (parseOrderDate(b.CreatedAt)?.getTime() || 0) - (parseOrderDate(a.CreatedAt)?.getTime() || 0));
  const menu = reviewsData.menu || [];
  const insights = [
    {
      icon: 'trend', tone: trend == null ? 'blue' : trend >= 0 ? 'green' : 'red',
      value: last30.average != null ? last30.average.toFixed(1) : '—',
      label: `เฉลี่ย 30 วันล่าสุด (${fmtMoney(last30.count || 0)} รีวิว)`,
      sub: trend == null ? 'ยังไม่มีข้อมูลเทียบช่วงก่อน' : `${trend >= 0 ? '▲' : '▼'} ${Math.abs(trend).toFixed(1)} จาก 30 วันก่อนหน้า`,
    },
    { icon: 'award', tone: 'green', value: total ? `${Math.round(((sm.positive || 0) / total) * 100)}%` : '—', label: 'รีวิวดี (4–5 ดาว)' },
    { icon: 'edit', tone: 'orange', value: fmtMoney(sm.with_comment || 0), label: 'รีวิวที่มีความเห็น' },
    { icon: 'photo', tone: 'amber', value: fmtMoney(sm.with_photo || 0), label: 'รีวิวที่มีรูป' },
  ];
  return (
    <>
      <PageHeader title="รีวิวจากลูกค้า" subtitle="คะแนน ความเห็น และเมนูที่ลูกค้ารีวิว" icon="star">
        <div className="op-rating-chip">
          <span className="star">★</span>
          <strong>{(sm.average || 0).toFixed(1)}</strong>
          <span>/ 5 · {fmtMoney(total)} รีวิว</span>
        </div>
      </PageHeader>

      <div className="rv-privacy"><Icon name="lock" size={15} /> เพื่อความเป็นส่วนตัวของลูกค้า ระบบไม่แสดงชื่อ เบอร์ เลขคิว หรือยอดของออเดอร์ที่รีวิว เห็นแค่เมนู วันที่ และช่วงเวลา (ลูกค้าคนเดียวกันใช้รหัสเดิม)</div>

      <div className="rv-overview">
        <section className="rv-score">
          <div className="rv-score-big">{(sm.average || 0).toFixed(1)}</div>
          <Stars value={sm.average || 0} size={22} />
          <div className="rv-score-sub">จาก {fmtMoney(total)} รีวิว</div>
        </section>
        <section className="rv-bars" aria-label="จำนวนรีวิวแยกตามดาว">
          {[5, 4, 3, 2, 1].map(n => {
            const c = breakdown[String(n)] || 0;
            const pct = total ? Math.round((c / total) * 100) : 0;
            const active = reviewFilter === String(n);
            return (
              <button key={n} type="button" className={`rv-bar ${active ? 'active' : ''}`}
                onClick={() => setReviewFilter(active ? 'all' : String(n))} title={active ? 'แสดงทั้งหมด' : `กรองเฉพาะ ${n} ดาว`}>
                <span className="rv-bar-label">{n} ★</span>
                <span className="rv-bar-track"><span className={`rv-bar-fill tone-${RATING_TONE[n]}`} style={{ width: `${pct}%` }} /></span>
                <span className="rv-bar-count">{fmtMoney(c)}</span>
              </button>
            );
          })}
        </section>
        <section className="rv-insights">
          {insights.map(it => (
            <div key={it.label} className={`rv-insight tone-${it.tone}`}>
              <span className="icon"><Icon name={it.icon} size={17} /></span>
              <div style={{ minWidth: 0 }}>
                <strong>{it.value}</strong>
                <span>{it.label}</span>
                {it.sub && <em>{it.sub}</em>}
              </div>
            </div>
          ))}
        </section>
      </div>

      {menu.length > 0 && (
        <section className="rv-menu-card">
          <h4 className="sf-section-title"><Icon name="menu" size={16} /> คะแนนตามเมนู <span className="rv-hint">คำนวณจากคะแนนของออเดอร์ที่มีเมนูนั้น</span></h4>
          <div className="rv-menu-list">
            {menu.slice(0, 8).map(m => (
              <button key={m.ProductId} type="button" className="rv-menu-item" onClick={() => setReviewSearch(m.ProductName)} title="ดูรีวิวของเมนูนี้">
                <span className="rv-item-img lg">{m.ImageUrl ? <img src={m.ImageUrl} alt="" /> : <Icon name="photo" size={16} />}</span>
                <span className="rv-menu-text">
                  <strong>{m.ProductName}</strong>
                  <span><Stars value={m.average} size={12} /> {m.average.toFixed(1)} · {fmtMoney(m.count)} รีวิว</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mm-toolbar mm-wrap-tabs">
        <div className="mm-tabs" role="tablist" aria-label="กรองตามคะแนน">
          {['all', '5', '4', '3', '2', '1'].map(f => (
            <button key={f} type="button" role="tab" aria-selected={reviewFilter === f}
              className={`mm-tab ${reviewFilter === f ? 'active' : ''}`} onClick={() => setReviewFilter(f)}>
              {f === 'all' ? 'ทั้งหมด' : `${f} ★`}
              <span className="count">{f === 'all' ? total : (breakdown[f] || 0)}</span>
            </button>
          ))}
        </div>
        <div className="rv-chips">
          {[{ id: 'comment', label: 'มีความเห็น', icon: 'edit' }, { id: 'photo', label: 'มีรูป', icon: 'photo' }].map(c => (
            <button key={c.id} type="button" className={`rv-chip ${reviewOnly === c.id ? 'active' : ''}`}
              onClick={() => setReviewOnly(reviewOnly === c.id ? null : c.id)}>
              <Icon name={c.icon} size={13} /> {c.label}
            </button>
          ))}
          <select className="mm-select" value={reviewSort} onChange={e => setReviewSort(e.target.value)} aria-label="เรียงรีวิว">
            <option value="new">ล่าสุดก่อน</option>
            <option value="low">คะแนนต่ำก่อน</option>
            <option value="high">คะแนนสูงก่อน</option>
          </select>
        </div>
        <div className="mm-search">
          <Icon name="search" size={16} />
          <input value={reviewSearch} onChange={e => setReviewSearch(e.target.value)} placeholder="ค้นหาในความเห็น หรือชื่อเมนู..." aria-label="ค้นหารีวิว" />
          {reviewSearch && <button type="button" onClick={() => setReviewSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>}
        </div>
      </div>

      {!loaded.reviews ? (
        <div className="rv-grid">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={210} radius={16} />)}</div>
      ) : shown.length === 0 ? (
        <div className="sf-empty">
          <span className="icon"><Icon name="star" size={28} /></span>
          <h3>{total === 0 ? 'ยังไม่มีรีวิว' : 'ไม่มีรีวิวที่ตรงกับตัวกรอง'}</h3>
          <p>{total === 0 ? 'เมื่อลูกค้ารับอาหารแล้วรีวิวร้าน คะแนนและความเห็นจะแสดงที่นี่' : 'ลองเปลี่ยนตัวกรองคะแนน หรือล้างคำค้นหา'}</p>
        </div>
      ) : (
        <div className="rv-grid">
          {shown.map(r => <ReviewCard key={r.ReviewId} review={r} onPhoto={setReviewPhoto} />)}
        </div>
      )}
      {reviewPhoto && <ReviewPhotoLightbox src={reviewPhoto} onClose={() => setReviewPhoto(null)} />}
    </>
  );
}
