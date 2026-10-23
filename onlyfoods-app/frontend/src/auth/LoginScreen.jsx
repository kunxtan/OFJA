import { PALETTE } from './theme';
import { GOOGLE_CLIENT_ID } from './google';
import { Food, PizzaArt, SkewerArt, EggArt, BurgerArt, NoodleBowlArt, ThaiTeaArt, LimeArt, SparkleArt } from './FoodArt';

// หน้าเข้าสู่ระบบ / สมัครสมาชิก / Google Login
// state การ login อยู่ที่ App ส่งมาเป็น props
export default function LoginScreen({
  viewportRef, foodCourtOpen, authTab, setAuthTab, setAuthError, authError, handleAuthSubmit, authForm,
  setAuthForm, showPassword, setShowPassword, setShowForgotModal, authBusy, triggerGoogleConnect
}) {
  return (
    <div className="orange-viewport" ref={viewportRef}>
              <div className="cursor-glow" aria-hidden="true"></div>
              <div className="card-glowing-wrapper">
                <div className="modern-card">

                  {/* Form Side */}
                  <div className="form-pane">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                          <div style={{ 
                            width: 12, height: 12, borderRadius: '50%', 
                            background: PALETTE.primary, 
                            boxShadow: '0 0 10px rgba(255,107,0,0.6)' 
                          }}></div>
                          <span style={{ fontSize: '15px', fontWeight: 800, color: PALETTE.slateText, letterSpacing: '1.2px' }}>
                            ONLYFOODS
                          </span>
                        </div>

                        {/* Badge แสดงสถานะการเปิด-ปิด โรงอาหาร */}
                        <div style={{
                          fontSize: '11px', fontWeight: 700,
                          color: foodCourtOpen ? '#059669' : '#DC2626',
                          background: foodCourtOpen ? '#ECFDF5' : '#FEF2F2',
                          padding: '4px 10px', borderRadius: '20px',
                          border: `1px solid ${foodCourtOpen ? '#A7F3D0' : '#FECACA'}`,
                          display: 'flex', alignItems: 'center', gap: '6px'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: foodCourtOpen ? '#10B981' : '#EF4444' }}></span>
                          {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
                        </div>
                      </div>

                      <h2 style={{ margin: '0 0 6px 0', fontSize: '25px', fontWeight: 800, color: PALETTE.slateText }}>
                        {authTab === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
                      </h2>
                      <p style={{ margin: '0 0 22px 0', color: PALETTE.subText, fontSize: '13px', lineHeight: 1.5 }}>
                        {authTab === 'login' ? 'ยินดีต้อนรับ! เข้าสู่ระบบเพื่อเริ่มสั่งอาหาร' : 'สร้างบัญชีผู้ใช้ใหม่ เพื่อสั่งอาหารและใช้งานระบบ'}
                      </p>

                      <div className="tab-switcher">
                        <div 
                          className="tab-pill" 
                          style={{ transform: authTab === 'login' ? 'translateX(0)' : 'translateX(100%)' }}
                        ></div>
                        <button 
                          type="button" 
                          className={`tab-btn ${authTab === 'login' ? 'active' : ''}`}
                          onClick={() => { setAuthTab('login'); setAuthError(''); }}
                        >
                          เข้าสู่ระบบ
                        </button>
                        <button 
                          type="button" 
                          className={`tab-btn ${authTab === 'register' ? 'active' : ''}`}
                          onClick={() => { setAuthTab('register'); setAuthError(''); }}
                        >
                          สมัครสมาชิก
                        </button>
                      </div>

                      {authError && (
                        <div style={{ 
                          background: '#FEF2F2', color: PALETTE.danger, padding: '11px 14px', 
                          borderRadius: '12px', fontSize: '12.5px', marginBottom: '16px', fontWeight: 600, 
                          border: `1px solid ${PALETTE.danger}25`, display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                          <span>{authError}</span>
                        </div>
                      )}

                      <form onSubmit={handleAuthSubmit}>
                        {authTab === 'register' && (
                          <>
                            <div className="input-group">
                              <input 
                                type="text" 
                                required 
                                placeholder="ชื่อ-นามสกุล" 
                                className="modern-input" 
                                value={authForm.name} 
                                onChange={e => setAuthForm({ ...authForm, name: e.target.value })} 
                              />
                              <div className="input-icon">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                              </div>
                            </div>

                            <div className="input-group">

                              <input 
                                type="tel" 
                                required 
                                inputMode="numeric"
                                autoComplete="tel"
                                maxLength={12}
                                placeholder="เบอร์โทรศัพท์ เช่น 0812345678" 
                                className="modern-input" 
                                value={authForm.phone} 
                                onChange={e => setAuthForm({ ...authForm, phone: e.target.value })} 
                              />
                              <div className="input-icon">
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                              </div>
                            </div>
                          </>
                        )}

                        <div className="input-group">
                          <input 
                            type="text" 
                            required 

                            autoComplete="username"
                            placeholder={authTab === 'login' ? 'ชื่อผู้ใช้' : 'ชื่อผู้ใช้ (a-z, 0-9, _ ยาว 4–20 ตัว)'} 
                            className="modern-input" 
                            value={authForm.username} 
                            onChange={e => setAuthForm({ ...authForm, username: e.target.value })} 
                          />
                          <div className="input-icon">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"></circle><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>
                          </div>
                        </div>

                        <div className="input-group" style={{ marginBottom: authTab === 'login' ? '8px' : '20px' }}>
                          <input 
                            type={showPassword ? "text" : "password"} 
                            required 
                            autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
                            placeholder={authTab === 'login' ? 'รหัสผ่าน' : 'รหัสผ่าน (อย่างน้อย 8 ตัว ไม่มีช่องว่าง)'} 
                            className="modern-input" 
                            style={{ paddingRight: '44px' }}
                            value={authForm.password} 
                            onChange={e => setAuthForm({ ...authForm, password: e.target.value })} 
                          />
                          <div className="input-icon">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                              position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                              background: 'none', border: 'none', color: PALETTE.subText, cursor: 'pointer', padding: 0, display: 'flex'
                            }}
                          >
                            {showPassword ? (
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                            ) : (
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            )}
                          </button>
                        </div>

                        {authTab === 'login' && (
                          <div style={{ textAlign: 'right', marginBottom: '18px' }}>
                            <button
                              type="button"
                              onClick={() => setShowForgotModal(true)}
                              style={{
                                background: 'none', border: 'none', color: PALETTE.primary,
                                fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0,
                                transition: 'opacity 0.2s'
                              }}
                            >
                              ลืมรหัสผ่าน?
                            </button>
                          </div>
                        )}

                        <button type="submit" className="btn-primary" disabled={authBusy} aria-busy={authBusy}>
                          <span>{authBusy ? 'กำลังเชื่อมต่อ...' : authTab === 'login' ? 'เข้าสู่ระบบ' : 'สร้างบัญชีผู้ใช้'}</span>
                        </button>
                      </form>

                      {GOOGLE_CLIENT_ID && <>
                      <div className="or-divider">หรือเชื่อมต่อผ่าน</div>

                      <button type="button" onClick={triggerGoogleConnect} className="btn-google">
                        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                        <span>ลงชื่อเข้าใช้ด้วย Google</span>
                      </button>
                      </>}
                    </div>

                    <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '11px', color: PALETTE.subText }}>
                      OnlyFoods Platform © 2026
                    </div>
                  </div>

                  {/* Banner Pane (Orange Side) */}
                  <div
                    className="banner-pane"
                    onPointerMove={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      e.currentTarget.style.setProperty('--bx', `${e.clientX - r.left}px`);
                      e.currentTarget.style.setProperty('--by', `${e.clientY - r.top}px`);
                    }}
                  >
                    <svg className="doodle" viewBox="0 0 470 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                      <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M-20 540 C60 470 150 560 110 600 C70 640 20 560 120 520 C220 480 300 600 500 470" />
                        <circle cx="398" cy="232" r="62" />
                        <circle cx="64" cy="344" r="26" />
                        <path d="M470 330 C400 300 380 380 430 410" />
                        <path d="M300 84 q20 -26 40 0 t40 0 t40 0" />
                      </g>
                    </svg>

                    <div className="banner-top">
                      <span className="banner-label">ONLYFOODS SYSTEM</span>

                      {/* Realtime Live Status Indicator */}
                      <div className="status-pill-light" style={{ color: foodCourtOpen ? '#059669' : '#DC2626' }}>
                        <div className="radar-box">
                          <div className="radar-wave" style={{ background: foodCourtOpen ? '#10B981' : '#EF4444' }}></div>
                          <div className="radar-dot" style={{ background: foodCourtOpen ? '#10B981' : '#EF4444' }}></div>
                        </div>
                        {foodCourtOpen ? 'เปิดให้บริการ' : 'ปิดให้บริการ'}
                      </div>
                    </div>

                    <h3 className="banner-title">สะดวก รวดเร็ว จบในที่เดียว</h3>

                    <div className="banner-stage" aria-hidden="true">
                      <div className="stage-sun"></div>

                      <Food cls="f-pizza" d={12} r={3} delay="-1s" dur="7s"><PizzaArt style={{ transform: 'rotate(16deg)' }} /></Food>
                      <Food cls="f-skewer" d={14} r={5} delay="-3s" dur="8s"><SkewerArt style={{ transform: 'rotate(26deg)' }} /></Food>
                      <Food cls="f-egg" d={20} r={-6} delay="-2s" dur="6s"><EggArt style={{ transform: 'rotate(-10deg)' }} /></Food>
                      <Food cls="f-burger" d={18} r={2} delay="0s" dur="6.5s"><BurgerArt /></Food>
                      <Food cls="f-noodle" d={28} r={-3} delay="-4s" dur="7.5s"><NoodleBowlArt /></Food>
                      <Food cls="f-tea" d={26} r={4} delay="-2.5s" dur="6.8s"><ThaiTeaArt style={{ transform: 'rotate(6deg)' }} /></Food>
                      <Food cls="f-lime" d={36} r={10} delay="-1.5s" dur="5.5s"><LimeArt /></Food>
                      <Food cls="f-spark f-spark1" d={30} delay="-1s" dur="3.5s"><SparkleArt /></Food>
                      <Food cls="f-spark f-spark2" d={24} delay="-2s" dur="4s"><SparkleArt /></Food>
                      <Food cls="f-spark f-spark3" d={32} delay="-3s" dur="3.8s"><SparkleArt /></Food>
                    </div>

                    <div className="banner-footer">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#FFFFFF', opacity: 0.9 }}></span>
                      Real-time Sync Active
                    </div>
                  </div>

                </div>
              </div>
            </div>
  );
}
