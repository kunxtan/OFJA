import { Badge } from '../components/ui';

// แท็บเมนูและของหมด
// ข้อมูลและ state อยู่ที่ CounterView ส่งมาเป็น props (แท็บไม่ดึงข้อมูลเอง)
export default function MenuTab({
  products, toggleStock
}) {
  return (
    <div className="cv-card">
                  <div className="cv-card-head">
                    <div>
                      <h3>ตั้งค่าสถานะวัตถุดิบหน้าร้าน</h3>
                      <div className="caption">หากวัตถุดิบหมด ให้กดเพื่อระงับการขายชั่วคราว</div>
                    </div>
                  </div>
                  <div className="cv-stock-grid">
                    {products.map(p => (
                      <div key={p.ProductId} className="cv-stock-item">
                        <div>
                          <h4 style={{ margin: '0 0 4px', fontSize: '15px' }}>{p.ProductName}</h4>
                          <Badge tone={p.IsOutOfStock ? 'danger' : 'success'}>
                            {p.IsOutOfStock ? '● สินค้าหมด' : '● พร้อมขาย'}
                          </Badge>
                        </div>
                        <button
                          onClick={() => toggleStock(p)}
                          className={`cv-btn ${p.IsOutOfStock ? 'btn-success-light' : 'btn-danger-light'}`}
                        >
                          {p.IsOutOfStock ? 'เปิดขาย' : 'ของหมด'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
  );
}
