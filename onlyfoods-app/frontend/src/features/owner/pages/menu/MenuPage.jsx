import { Icon, PageHeader, Skeleton } from '../../components/ui';
import { fmtMoney } from '../../lib/format';

// หน้าจัดการเมนู : ค้นหา/กรอง/เรียง เปิด-ปิดของหมด เพิ่ม/แก้/ลบเมนู
// ข้อมูลและ state อยู่ที่ OwnerView ส่งมาเป็น props (หน้าไม่ดึงข้อมูลเอง)
export default function MenuPage({
  products, menuSearch, menuFilter, todaySold, menuSort, selectedIds, selectMode, toggleSelected, toggleStock,
  openEditModal, handleDeleteMenu, loaded, openAddModal, setMenuFilter, setMenuSearch, setMenuSort, menuView,
  setMenuView, exitSelectMode, setSelectMode, setSelectedIds, bulkBusy, bulkSetStock
}) {
  const inStockCount = products.filter(p => !p.IsOutOfStock).length;
  const outOfStockCount = products.length - inStockCount;
  const keyword = menuSearch.trim().toLowerCase();
  const visibleProducts = products.filter(p => {
    if (menuFilter === 'in' && p.IsOutOfStock) return false;
    if (menuFilter === 'out' && !p.IsOutOfStock) return false;
    return !keyword || `${p.ProductName || ''} ${p.Description || ''}`.toLowerCase().includes(keyword);
  });
  const sold = (p) => todaySold[String(p.ProductId)] || 0;
  const sorters = {
    best: (a, b) => sold(b) - sold(a) || String(a.ProductName).localeCompare(String(b.ProductName), 'th'),
    priceAsc: (a, b) => Number(a.UnitPrice) - Number(b.UnitPrice),
    priceDesc: (a, b) => Number(b.UnitPrice) - Number(a.UnitPrice),
    name: (a, b) => String(a.ProductName).localeCompare(String(b.ProductName), 'th'),
  };
  if (sorters[menuSort]) visibleProducts.sort(sorters[menuSort]);
  const visibleIds = visibleProducts.map(p => p.ProductId);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
  const soldTodayTotal = products.reduce((acc, p) => acc + sold(p), 0);
  const filters = [
    { id: 'all', label: 'ทั้งหมด', count: products.length },
    { id: 'in', label: 'พร้อมขาย', count: inStockCount, tone: 'green' },
    { id: 'out', label: 'สินค้าหมด', count: outOfStockCount, tone: 'red' },
  ];
  // props ที่ใช้ร่วมกันของการ์ด/แถว เวลาอยู่ในโหมดเลือก
  const selectProps = (p) => {
    const selected = selectedIds.includes(p.ProductId);
    return selectMode ? {
      onClick: () => toggleSelected(p.ProductId),
      role: 'checkbox',
      'aria-checked': selected,
      tabIndex: 0,
      onKeyDown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleSelected(p.ProductId); } },
    } : {};
  };
  const stockButton = (p, compact = false) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggleStock(p.ProductId, p.ProductName, p.IsOutOfStock); }}
      className={`mm-stock-btn ${p.IsOutOfStock ? 'to-in' : 'to-out'} ${compact ? 'compact' : ''}`}
      title={p.IsOutOfStock ? 'กดเพื่อเปิดขายเมนูนี้' : 'กดเมื่อเมนูนี้หมด'}
    >
      <Icon name={p.IsOutOfStock ? 'check' : 'soldout'} size={15} />
      {p.IsOutOfStock ? 'ปรับเป็นพร้อมขาย' : 'ปรับเป็นสินค้าหมด'}
    </button>
  );
  const actionButtons = (p) => (
    <>
      <button type="button" className="mm-icon-btn" title="แก้ไขเมนู" aria-label={`แก้ไข ${p.ProductName}`} onClick={(e) => { e.stopPropagation(); openEditModal(p); }}>
        <Icon name="edit" size={16} />
      </button>
      <button type="button" className="mm-icon-btn danger" title="ลบเมนู" aria-label={`ลบ ${p.ProductName}`} onClick={(e) => { e.stopPropagation(); handleDeleteMenu(p.ProductId, p.ProductName); }}>
        <Icon name="trash" size={16} />
      </button>
    </>
  );
  const thumb = (p, cls) => p.img
    ? <img src={p.img} alt="" className={cls} />
    : <div className={`${cls} mm-noimg`}><Icon name="photo" size={cls === 'mm-card-img' ? 30 : 18} /></div>;

  return (
    <div className="mm-page" style={{ paddingBottom: selectMode ? '110px' : '40px' }}>
      <PageHeader
        title="จัดการเมนูและสต็อก"
        subtitle={loaded.products
          ? `${fmtMoney(products.length)} เมนู · พร้อมขาย ${fmtMoney(inStockCount)} · หมด ${fmtMoney(outOfStockCount)} · วันนี้ขายไป ${fmtMoney(soldTodayTotal)} จาน`
          : 'กำลังโหลดเมนู...'}
        icon="menu"
      >
        <button type="button" className="berry-btn btn-primary berry-add-menu-btn" onClick={openAddModal}>
          <Icon name="plus" size={16} /> เพิ่มเมนูใหม่
        </button>
      </PageHeader>

      {/* ===== แถบเครื่องมือ ===== */}
      <div className="mm-toolbar">
        <div className="mm-tabs" role="tablist" aria-label="กรองตามสถานะสต็อก">
          {filters.map(f => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={menuFilter === f.id}
              onClick={() => setMenuFilter(f.id)}
              className={`mm-tab ${menuFilter === f.id ? 'active' : ''} ${f.tone ? `tone-${f.tone}` : ''}`}
            >
              {f.tone && <span className="dot" />}
              {f.label}
              <span className="count">{f.count}</span>
            </button>
          ))}
        </div>

        <div className="mm-search">
          <Icon name="search" size={16} />
          <input value={menuSearch} onChange={e => setMenuSearch(e.target.value)} placeholder="ค้นหาชื่อหรือรายละเอียดเมนู..." aria-label="ค้นหาเมนู" />
          {menuSearch && (
            <button type="button" onClick={() => setMenuSearch('')} aria-label="ล้างคำค้นหา"><Icon name="close" size={14} /></button>
          )}
        </div>

        <div className="mm-tool-group">
          <select className="mm-select" value={menuSort} onChange={e => setMenuSort(e.target.value)} aria-label="เรียงเมนู">
            <option value="default">เรียง: ค่าเริ่มต้น</option>
            <option value="best">เรียง: ขายดีวันนี้</option>
            <option value="priceAsc">เรียง: ราคาต่ำ → สูง</option>
            <option value="priceDesc">เรียง: ราคาสูง → ต่ำ</option>
            <option value="name">เรียง: ชื่อ ก–ฮ</option>
          </select>

          <div className="mm-view-toggle" role="group" aria-label="รูปแบบการแสดงผล">
            <button type="button" className={menuView === 'grid' ? 'active' : ''} onClick={() => setMenuView('grid')} title="แสดงเป็นการ์ด" aria-pressed={menuView === 'grid'}>
              <Icon name="grid" size={16} />
            </button>
            <button type="button" className={menuView === 'list' ? 'active' : ''} onClick={() => setMenuView('list')} title="แสดงเป็นรายการ" aria-pressed={menuView === 'list'}>
              <Icon name="list" size={16} />
            </button>
          </div>

          <button
            type="button"
            className={`mm-select-btn ${selectMode ? 'active' : ''}`}
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            disabled={!products.length}
          >
            <Icon name={selectMode ? 'close' : 'check'} size={15} />
            {selectMode ? 'ยกเลิกเลือก' : 'เลือกหลายเมนู'}
          </button>
        </div>
      </div>

      {/* ===== แจ้งเตือนเมนูหมด ===== */}
      {loaded.products && outOfStockCount > 0 && menuFilter !== 'out' && (
        <div className="mm-alert">
          <Icon name="soldout" size={17} />
          <span>มี <strong>{outOfStockCount}</strong> เมนูที่หมดอยู่ ลูกค้าจะสั่งเมนูเหล่านี้ไม่ได้</span>
          <button type="button" onClick={() => setMenuFilter('out')}>ดูเมนูที่หมด <Icon name="arrowRight" size={14} /></button>
        </div>
      )}

      {/* ===== เนื้อหา ===== */}
      {!loaded.products ? (
        menuView === 'grid' ? (
          <div className="mm-grid">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
              <div key={i} className="mm-card">
                <Skeleton height={140} radius={0} />
                <div className="mm-card-body">
                  <Skeleton height={15} width="70%" />
                  <Skeleton height={11} width="90%" />
                  <Skeleton height={34} style={{ marginTop: 10 }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mm-list">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="mm-row"><Skeleton height={48} /></div>)}</div>
        )
      ) : products.length === 0 ? (
        <div className="mm-empty">
          <div className="icon"><Icon name="box" size={32} /></div>
          <div className="title">ยังไม่มีเมนูในร้าน</div>
          <div className="caption">เพิ่มเมนูแรกเพื่อให้ลูกค้าเริ่มสั่งอาหารได้</div>
          <button type="button" className="berry-btn btn-primary" onClick={openAddModal}><Icon name="plus" size={16} /> เพิ่มเมนูใหม่</button>
        </div>
      ) : visibleProducts.length === 0 ? (
        <div className="mm-empty">
          <div className="icon"><Icon name="search" size={30} /></div>
          <div className="title">ไม่พบเมนูที่ตรงกับเงื่อนไข</div>
          <div className="caption">ลองเปลี่ยนตัวกรองหรือคำค้นหา</div>
          <button type="button" className="mm-select-btn" onClick={() => { setMenuFilter('all'); setMenuSearch(''); }}>ล้างตัวกรอง</button>
        </div>
      ) : menuView === 'grid' ? (
        /* ----- มุมมองการ์ด ----- */
        <div className="mm-grid">
          {visibleProducts.map(p => {
            const selected = selectedIds.includes(p.ProductId);
            return (
              <div
                key={p.ProductId}
                className={`mm-card ${p.IsOutOfStock ? 'is-out' : ''} ${selectMode ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
                {...selectProps(p)}
              >
                <div className="mm-card-media">
                  {thumb(p, 'mm-card-img')}
                  <span className={`mm-status ${p.IsOutOfStock ? 'out' : 'in'}`}>
                    <span className="dot" />{p.IsOutOfStock ? 'สินค้าหมด' : 'พร้อมขาย'}
                  </span>
                  {sold(p) > 0 && <span className="mm-sold-badge"><Icon name="trend" size={12} /> {fmtMoney(sold(p))} จานวันนี้</span>}
                  {selectMode && <span className="mm-check">{selected && <Icon name="check" size={15} />}</span>}
                  {!selectMode && <div className="mm-card-hover-actions">{actionButtons(p)}</div>}
                </div>
                <div className="mm-card-body">
                  <div className="mm-card-title-row">
                    <h4 title={p.ProductName}>{p.ProductName}</h4>
                    <span className="mm-price">฿{fmtMoney(p.UnitPrice)}</span>
                  </div>
                  <p className={`mm-desc ${p.Description ? '' : 'empty'}`} title={p.Description || ''}>
                    {p.Description || 'ยังไม่มีรายละเอียดเมนู'}
                  </p>
                  {!selectMode && <div className="mm-card-footer">{stockButton(p)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ----- มุมมองรายการ ----- */
        <div className="mm-list">
          <div className="mm-row mm-row-head">
            {selectMode && <span className="col-check" />}
            <span className="col-menu">เมนู</span>
            <span className="col-price">ราคา</span>
            <span className="col-sold">ขายวันนี้</span>
            <span className="col-status">สถานะ</span>
            <span className="col-actions">จัดการ</span>
          </div>
          {visibleProducts.map(p => {
            const selected = selectedIds.includes(p.ProductId);
            return (
              <div
                key={p.ProductId}
                className={`mm-row ${p.IsOutOfStock ? 'is-out' : ''} ${selectMode ? 'selectable' : ''} ${selected ? 'selected' : ''}`}
                {...selectProps(p)}
              >
                {selectMode && <span className="col-check"><span className="mm-check inline">{selected && <Icon name="check" size={14} />}</span></span>}
                <div className="col-menu">
                  {thumb(p, 'mm-row-img')}
                  <div className="mm-row-text">
                    <div className="name" title={p.ProductName}>{p.ProductName}</div>
                    <div className={`desc ${p.Description ? '' : 'empty'}`} title={p.Description || ''}>{p.Description || 'ยังไม่มีรายละเอียด'}</div>
                  </div>
                </div>
                <span className="col-price mm-price">฿{fmtMoney(p.UnitPrice)}</span>
                <span className={`col-sold ${sold(p) ? '' : 'zero'}`}>{fmtMoney(sold(p))} จาน</span>
                <span className="col-status">
                  <span className={`mm-status inline ${p.IsOutOfStock ? 'out' : 'in'}`}><span className="dot" />{p.IsOutOfStock ? 'สินค้าหมด' : 'พร้อมขาย'}</span>
                </span>
                <span className="col-actions">
                  {!selectMode && <>{stockButton(p, true)}{actionButtons(p)}</>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ===== แถบจัดการหลายเมนู ===== */}
      {selectMode && (
        <div className="berry-bulk-bar" role="region" aria-label="จัดการหลายเมนู">
          <div className="info">
            <strong>{selectedIds.length}</strong> เมนูที่เลือก
            <button
              type="button"
              className="link"
              onClick={() => setSelectedIds(allVisibleSelected ? selectedIds.filter(id => !visibleIds.includes(id)) : Array.from(new Set([...selectedIds, ...visibleIds])))}
              disabled={!visibleIds.length}
            >
              {allVisibleSelected ? 'ไม่เลือกทั้งหมด' : `เลือกทั้งหมดที่แสดง (${visibleIds.length})`}
            </button>
          </div>
          <div className="actions">
            <button type="button" className="mm-stock-btn to-out" disabled={!selectedIds.length || bulkBusy} onClick={() => bulkSetStock(true)}>
              {bulkBusy ? <span className="berry-spinner" /> : <Icon name="soldout" size={16} />} ปรับเป็นสินค้าหมด
            </button>
            <button type="button" className="mm-stock-btn to-in" disabled={!selectedIds.length || bulkBusy} onClick={() => bulkSetStock(false)}>
              {bulkBusy ? <span className="berry-spinner" /> : <Icon name="check" size={16} />} ปรับเป็นพร้อมขาย
            </button>
            <button type="button" className="mm-icon-btn on-dark" onClick={exitSelectMode} disabled={bulkBusy} title="ปิดโหมดเลือก" aria-label="ปิดโหมดเลือก">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
