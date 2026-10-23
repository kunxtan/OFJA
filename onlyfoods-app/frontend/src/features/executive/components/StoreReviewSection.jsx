import { T, captionStyle } from '../theme';
import { thaiDateTime, money } from '../lib/format';
import { useEffect, useMemo, useState } from 'react';
import { parseOrderDate } from '../lib/dates';
import { callApi } from '../lib/api';
import { Card, EmptyState } from './ui';

export function StarRating({ value, size = 14 }) {
    const rounded = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
    return (<span style={{ fontSize: size, letterSpacing: '1px', whiteSpace: 'nowrap' }} aria-label={`${value} จาก 5 ดาว`}>
      <span style={{ color: T.accent }}>{'★★★★★'.slice(0, rounded)}</span>
      <span style={{ color: T.line }}>{'★★★★★'.slice(rounded)}</span>
    </span>);
}

export function ReviewRow({ review }) {
    return (<div style={{ padding: '12px 0', borderBottom: `1px solid ${T.line}` }}>
      <div style={{display: 'flex',justifyContent: 'space-between',alignItems: 'center',gap: '10px',flexWrap: 'wrap'}}>
        <div style={{ fontWeight: 700, fontSize: '13.5px', color: T.ink }}>
          {review.ReviewerName || 'ลูกค้าไม่ระบุชื่อ'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StarRating value={review.Rating}/>
          <span style={captionStyle}>{thaiDateTime(review.CreatedAt)}</span>
        </div>
      </div>
      {review.Comment && (<p style={{ margin: '6px 0 0', fontSize: '13px', color: T.text, lineHeight: 1.6 }}>
          {review.Comment}
        </p>)}
    </div>);
}

// ===== รีวิวร้านค้า: คะแนนและความพึงพอใจของผู้ใช้ =====
export function StoreReviewSection({ ctx, storeId, style }) {
    const { API } = ctx;
    const [state, setState] = useState({ loading: false, error: null, data: null });
    const [ratingFilter, setRatingFilter] = useState('all');
    useEffect(() => {
        setRatingFilter('all');
    }, [storeId]);
    useEffect(() => {
        if (!storeId) {
            setState({ loading: false, error: null, data: null });
            return undefined;
        }
        let cancelled = false;
        setState({ loading: true, error: null, data: null });
        callApi(`${API}/api/stores/${storeId}/reviews`)
            .then((data) => {
            if (!cancelled)
                setState({ loading: false, error: null, data });
        })
            .catch((err) => {
            if (!cancelled)
                setState({ loading: false, error: err.message, data: null });
        });
        return () => {
            cancelled = true;
        };
    }, [API, storeId]);
    const summary = state.data?.summary || { total: 0, average: 0, breakdown: {} };
    // รีวิวของร้านเป็นข้อมูลแบบ all-time: ไม่ผูกกับช่วงวันที่ของยอดขายด้านบน
    // เรียงรีวิวล่าสุดก่อนเสมอ เพื่อให้รีวิวยังคงแสดงแม้วันที่ที่เลือกจะไม่มีรีวิวใหม่
    const reviews = useMemo(() => {
        const rows = Array.isArray(state.data?.reviews) ? state.data.reviews : [];
        return [...rows].sort((a, b) => {
            const aTime = parseOrderDate(a.CreatedAt)?.getTime() || 0;
            const bTime = parseOrderDate(b.CreatedAt)?.getTime() || 0;
            return bTime - aTime;
        });
    }, [state.data?.reviews]);
    const breakdown = summary.breakdown || {};
    const filteredReviews = useMemo(() => {
        if (ratingFilter === 'all')
            return reviews;
        return reviews.filter((r) => Number(r.Rating) === Number(ratingFilter));
    }, [reviews, ratingFilter]);
    const ratingOptions = [5, 4, 3, 2, 1];
    const filterChip = (active) => ({
        border: `1px solid ${active ? T.primary : T.line}`,
        background: active ? T.primarySoft : '#FFF',
        color: active ? T.primaryDark : T.text,
        borderRadius: '999px',
        padding: '7px 12px',
        fontSize: '12.5px',
        fontWeight: active ? 700 : 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap'
    });
    return (<Card title="รีวิวจากลูกค้า" subtitle="รีวิวทั้งหมดของร้านนี้ " style={{ margin: 0, ...style }} right={summary.total > 0 ? (<div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 700, color: T.ink, lineHeight: 1.2 }}>
              {Number(summary.average || 0).toFixed(1)}
              <span style={{ fontSize: '13px', color: T.muted, fontWeight: 500 }}> / 5</span>
            </div>
            <div style={captionStyle}>{money(summary.total)} รีวิว</div>
          </div>) : null}>
      {state.loading && <EmptyState text="กำลังโหลดรีวิว..."/>}
      {!state.loading && state.error && <EmptyState text={state.error}/>}
      {!state.loading && !state.error && reviews.length === 0 && (<EmptyState text="ร้านนี้ยังไม่มีรีวิวจากลูกค้า"/>)}
      {!state.loading && !state.error && reviews.length > 0 && (<div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
            <span style={{ ...captionStyle, marginRight: '2px' }}>กรองคะแนน:</span>
            <button type="button" onClick={() => setRatingFilter('all')} style={filterChip(ratingFilter === 'all')}>
              ทั้งหมด ({money(reviews.length)})
            </button>
            {ratingOptions.map((star) => (<button key={star} type="button" onClick={() => setRatingFilter(String(star))} style={filterChip(ratingFilter === String(star))}>
                {star} ★ ({money(breakdown[String(star)] ?? reviews.filter((r) => Number(r.Rating) === star).length)})
              </button>))}
          </div>
          {filteredReviews.length > 0 ? (<div>
              {filteredReviews.map((r) => (<ReviewRow key={r.ReviewId ?? r.ReviewID} review={r}/>))}
            </div>) : (<EmptyState text={`ยังไม่มีรีวิว ${ratingFilter} ดาว`}/>) }
        </div>)}
    </Card>);
}
