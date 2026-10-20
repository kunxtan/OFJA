import { useEffect, useMemo, useRef, useState } from "react";
import { startPolling } from "../../utils/polling";
import { useHistoryNav } from "../../utils/historyNav";
import Cropper from "react-easy-crop";
import { newRequestKey, applyServerPrices } from "../../utils/requestKey";
import { createCartRow, getNotifKey, getOrderStatusLabel, getOutOfStockItem, previewLateArrival, summarizeRefunds } from "./utils/orders";
import { addProductToCart, countCartDishes, decreaseRowQty, increaseRowQty, splitOneFromRow, sumCart } from "./utils/cart";
import { formatBangkokTime, getCurrentDateTimeForBackend, getCurrentTimeFormatted, secondsUntil } from "./utils/time";
import { getPickupHours, getPickupRange, isPickupMinuteDisabled, pad2, toMinutes } from "./utils/pickupTime";
import { COLORS, MAX_FILE_SIZE } from "./constants";
import { buildQueueSchedule, canEstimateOrder, countOrderDishes, formatPickupRange, formatScheduledPickupRange, isImmediatePickup, kitchenBuffer, orderStatusKey, scheduledWindowMinutes } from "./utils/queueEstimate";
import { avatarStyle, cardStyle, containerStyle, headerStyle, heroStyle, logoStyle, pageStyle, profileStyle, searchStyle } from "./styles";
import { BigUserIcon, CameraIcon, CartIcon, CartIconPlus, HiIcon, HomeIcon, NoodleBowlArt, NotiIcon, OrderIcon, SparkleArt, StarIcon, ThaiTeaArt, UserIcon } from "./icons";
import { PaymentModal, TopUpModal, OutOfStockModal } from "./modals/PaymentModals";
import RefundPayoutModal from "./modals/RefundPayoutModal";
import { ReviewModal, StoreReviewsModal } from "./modals/ReviewModals";
import { ReportModal, ViewReportsModal } from "./modals/ReportModals";
import NotifToasts from "./NotifToasts";
import CustomAlert from "./modals/CustomAlert";

export default function CustomerView({ user, apiBase, onLogout }) {

  // USER & PROFILE STATE
  const userId = user?.UserId || user?.id;
  const [fullName, setFullName] = useState(user?.FullName || user?.name || "Customer");
  const username = user?.username || user?.Username || "";
  const [phone, setPhone] = useState(user?.Phone || "");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(fullName);
  const [editPhone, setEditPhone] = useState(phone);
  const [profileImage, setProfileImage] = useState(user?.ProfileImg || user?.ProfileImage || user?.avatar || null);
  const [cropImage, setCropImage] = useState(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // DATA STATE
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [isFoodCourtOpen, setIsFoodCourtOpen] = useState(true);
  const [foodCourtMode, setFoodCourtMode] = useState("AUTO");

  // LATE PICKUP STATE
  const [latePickupOrder, setLatePickupOrder] = useState({});
  const [latePickupMinutes, setLatePickupMinutes] = useState({});

  // OUT OF STOCK & CHANGE ORDER STATE
  const [outOfStockOrder, setOutOfStockOrder] = useState(null);
  const [isChangeMenuMode, setIsChangeMenuMode] = useState(false);
  const [newSelectedProduct, setNewSelectedProduct] = useState(null);
  const [timeLeft, setTimeLeft] = useState(1800);

  // TOP-UP
  const [topUpSlip, setTopUpSlip] = useState(null);
  const [isSubmittingTopUp, setIsSubmittingTopUp] = useState(false);
  const [hiddenTopUpOrderId, setHiddenTopUpOrderId] = useState(null);

  // NAVIGATION & VIEWS
  const [activeTab, setActiveTab] = useState("menu");
  const [search, setSearch] = useState("");
  const [selectedStore, setSelectedStore] = useState(null);
  const [viewMode, setViewMode] = useState("stores");
  // ปุ่มย้อนกลับ : #menu (รายชื่อร้าน) / #menu/store (เมนูของร้าน) / #orders / #notifs / #profile
  useHistoryNav(activeTab === "menu" && viewMode === "products" ? "menu/store" : activeTab, (hash) => {
    if (hash === null) hash = "menu";
    const [tab, sub] = hash.split("/");
    if (!["menu", "orders", "notifs", "profile"].includes(tab)) return false;
    if (sub === "store" && !selectedStore) return false;
    handleSelectTab(tab);
    if (sub === "store") setViewMode("products");
    return true;
  });

  // CART & ORDER FORM STATE
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pickupHour, setPickupHour] = useState("");
  const [pickupMinute, setPickupMinute] = useState("");
  const pickupTime = pickupHour !== "" && pickupMinute !== "" ? `${pickupHour}:${pickupMinute}` : "";
  const setPickupTime = (value) => {
    const [h = "", m = ""] = String(value || "").split(":");
    setPickupHour(h);
    setPickupMinute(m);
  };
  const [queueEstimateOrders, setQueueEstimateOrders] = useState([]);
  const [orderQueueEstimates, setOrderQueueEstimates] = useState({}); // { [storeId]: orders[] } สำหรับหน้าคำสั่งซื้อ
  const [toasts, setToasts] = useState([]); // ป๊อปอัพแจ้งเตือนที่กำลังแสดง
  const orderRequestKeyRef = useRef(null); // รหัสคำขอของการกดจ่ายครั้งนี้ (M6) ; ตะกร้าเปลี่ยน = รหัสใหม่
  const seenToastKeysRef = useRef(null); // คีย์การแจ้งเตือนที่เห็นแล้ว (null = ยังไม่โหลดครั้งแรก จึงไม่เด้งของเก่า)
  const activeTabRef = useRef(activeTab); // ให้ fetchNotifs ที่อยู่ใน setInterval อ่านแท็บล่าสุดได้
  activeTabRef.current = activeTab;
  useEffect(() => {
    seenToastKeysRef.current = null;
    setToasts([]);
  }, [userId]);
  const [foodCourtOpenTime, setFoodCourtOpenTime] = useState("");
  const [foodCourtCloseTime, setFoodCourtCloseTime] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PromptPay");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
 
  // PAYMENT MODAL & SLIP
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);

  // NOTIFICATION STATE
  const [readNotifIds, setReadNotifIds] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // REVIEW STATE
  const [reviewOrder, setReviewOrder] = useState(null);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImageFile, setReviewImageFile] = useState(null);
  const [reviewImagePreview, setReviewImagePreview] = useState(null);
  const [isReadOnlyReview, setIsReadOnlyReview] = useState(false);
  const [reviewedOrderIds, setReviewedOrderIds] = useState({});

  // STORE REVIEWS MODAL STATE
  const [selectedStoreForReviews, setSelectedStoreForReviews] = useState(null);
  const [storeReviewsList, setStoreReviewsList] = useState([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  // ISSUE REPORT STATE
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedOrderForReport, setSelectedOrderForReport] = useState(null);
  const [issueType, setIssueType] = useState("อาหารไม่ตรงตามออเดอร์");
  const [issueDescription, setIssueDescription] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [myIssueReports, setMyIssueReports] = useState([]);
  const [isViewReportsModalOpen, setIsViewReportsModalOpen] = useState(false);

  // CUSTOM ALERT STATE
  const [alertData, setAlertData] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "success",
  });

  const customAlert = (title, message = "", type = "success", onConfirm = null) => {
    setAlertData({ isOpen: true, title, message, type, onConfirm });
  };

  // กดซ้ำระหว่างรอคำตอบ  ไม่ยิงซ้ำ
  const busyRef = useRef(new Set());
  const once = async (key, fn) => {
    if (busyRef.current.has(key)) return undefined;
    busyRef.current.add(key);
    try {
      return await fn();
    } finally {
      busyRef.current.delete(key);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await fetch(`${apiBase}/api/stores`);
      if (!res.ok) return;
      const allStores = await res.json();
      const data = Array.isArray(allStores) ? allStores.filter((store) => !store.IsSuspended && store.ContractState === "ACTIVE"): [];
      const storesWithReviews = await Promise.all(
        data.map(async (store) => {
          try {
            const reviewRes = await fetch(`${apiBase}/api/stores/${store.StoreId}/reviews`);
            if (!reviewRes.ok) return { ...store, RatingAverage: 0, ReviewCount: 0 };
            const reviewData = await reviewRes.json();
            const summary = reviewData?.summary || {};
            return {
              ...store,
              RatingAverage: Number(summary.average || 0),
              ReviewCount: Number(summary.total || 0),
            };
          } catch (error) {
            return { ...store, RatingAverage: 0, ReviewCount: 0 };
          }
        })
      );

      setStores(storesWithReviews);
      setSelectedStore((prev) => {
        if (prev && storesWithReviews.some((store) => Number(store.StoreId) === Number(prev))) return prev;
        if (storesWithReviews.length > 0) return Number(storesWithReviews[0].StoreId);
        return null;
      });
    } catch (error) {
      console.error("Error fetching stores:", error);
    }
  };

  const fetchProducts = async () => {
    if (!selectedStore) return;
    try {
      const res = await fetch(`${apiBase}/api/products?store_id=${selectedStore}`);
      if (!res.ok) return;
      const data = await res.json();
      setProducts(data);
    } catch (error) {
      console.error("Error fetching products:", error);
    }
  };

  const [refundsByOrder, setRefundsByOrder] = useState({});
  const fetchMyRefunds = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${apiBase}/api/refunds?limit=500`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      const map = {};
      data.forEach((r) => { (map[r.OrderId] = map[r.OrderId] || []).push(r); });
      setRefundsByOrder(map);
    } catch (error) {
      console.error("Error fetching refunds:", error);
    }
  };

  const [payoutOrder, setPayoutOrder] = useState(null); // ออเดอร์ที่กำลังเลือกวิธีรับเงินคืน
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutError, setPayoutError] = useState("");

  const savePayout = async (body) => {
    const first = (refundsByOrder[payoutOrder.OrderID] || []).find((r) => r.RefundStatus === "PENDING");
    if (!first) return;
    setPayoutSaving(true);
    setPayoutError("");
    try {
      const res = await fetch(`${apiBase}/api/refunds/${first.RefundId}/payout`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.detail === "string" ? data.detail : "บันทึกไม่สำเร็จ");
      }
      setPayoutOrder(null);
      await fetchMyRefunds();
      customAlert("บันทึกแล้ว", body.method === "TRANSFER" ? "เจ้าของร้านจะโอนเงินคืนเข้าบัญชีของคุณ คุณจะได้รับแจ้งเตือนเมื่อโอนแล้ว" : `รับเงินสดที่ร้านโดยแจ้งเลขคิว ${payoutOrder.QueueNo}`, "success");
    } catch (error) {
      setPayoutError(error.message || "บันทึกไม่สำเร็จ");
    } finally {
      setPayoutSaving(false);
    }
  };

  const renderRefundNote = (order) => {
    const sum = summarizeRefunds(refundsByOrder[order.OrderID]);
    if (!sum.pending && !sum.done) return null;
    const pending = sum.pending > 0;
    return (
      <div role="status" style={{ marginTop: "10px", padding: "10px 12px", borderRadius: "12px", fontSize: "13px", lineHeight: 1.5,
        background: pending ? "#FEF3C7" : "#D1FAE5", color: pending ? "#92400E" : "#065F46", fontWeight: "700" }}>
        {pending ? (
          <>รอรับเงินคืน {sum.pending.toFixed(2)} ฿ ที่ร้าน {order.StoreName}
            <div style={{ fontWeight: "500", fontSize: "12px" }}>
              {(refundsByOrder[order.OrderID] || []).some((r) => r.RefundStatus === "PENDING" && r.PayoutMethod === "TRANSFER")
                ? "เลือกให้เจ้าของร้านโอนคืนแล้ว รอร้านดำเนินการ"
                : `แจ้งเลขคิว #${order.QueueNo} กับพนักงานหน้าร้านเพื่อรับเงินคืน หรือเลือกให้ร้านโอนให้`}
            </div>
            <button type="button" onClick={() => { setPayoutError(""); setPayoutOrder(order); }}
              style={{ marginTop: "8px", padding: "8px 14px", borderRadius: "10px", border: "none", background: "#92400E", color: "#fff", fontWeight: "800", fontSize: "12px", cursor: "pointer" }}>
              เลือกวิธีรับเงินคืน
            </button></>
        ) : (
          <>รับเงินคืนแล้ว {sum.done.toFixed(2)} ฿{sum.doneAt ? ` · ${new Date(String(sum.doneAt).replace(" ", "T")).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}` : ""}</>
        )}
        {pending && sum.done > 0 && <div style={{ fontWeight: "500", fontSize: "12px" }}>รับคืนไปแล้ว {sum.done.toFixed(2)} ฿</div>}
      </div>
    );
  };

  const fetchMyOrders = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${apiBase}/api/orders?user_id=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMyOrders(data);
      setLatePickupOrder((prev) => {
        const updated = { ...prev };
        data.forEach((order) => {
          const orderId = order.OrderID ?? order.OrderId ?? order.order_id;
          if (!orderId) return;
          const arrival = order.LatePickupArrivalTime;
          let arrivalTime = "";
          if (arrival) {
            const date = new Date(arrival);
            if (!Number.isNaN(date.getTime())) {
              arrivalTime = date.toLocaleTimeString("th-TH", {
                timeZone: "Asia/Bangkok",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
            }
          }

          updated[orderId] = {
            ...updated[orderId],
            count: Number(order.LatePickupCount || 0),
            minutes: Number(order.LatePickupMinutes || 0),
            arrivalTime,
          };
        });

        return updated;
      });
    } catch (error) {
      console.error("Error fetching orders:", error);
    }
  };

  const fetchNotifs = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${apiBase}/api/notifications/${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setNotifs(data);

      // เด้งป๊อปอัพเฉพาะการแจ้งเตือนที่เพิ่งเข้ามาหลังเปิดแอป
      if (Array.isArray(data)) {
        if (seenToastKeysRef.current === null) {
          seenToastKeysRef.current = new Set(data.map((n) => getNotifKey(n)));
        } else {
          const fresh = data.filter((n) => !seenToastKeysRef.current.has(getNotifKey(n)));
          fresh.forEach((n) => seenToastKeysRef.current.add(getNotifKey(n)));
        }
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const fetchFoodCourtStatus = async () => {
    try {
      const res = await fetch(`${apiBase}/api/food-court/status`);
      if (!res.ok) return;
      const data = await res.json();
      setIsFoodCourtOpen(Boolean(data?.is_open));
      setFoodCourtMode(data?.mode || "AUTO");
      if (data?.open_time) {
        setFoodCourtOpenTime(data.open_time.slice(0, 5));
      }
      if (data?.close_time) {
        setFoodCourtCloseTime(data.close_time.slice(0, 5));
      }
    } catch (error) {
      console.error("Error fetching food court status:", error);
    }
  };

  const fetchStoreReviews = async (storeId) => {
    if (!storeId) return;
    setIsLoadingReviews(true);
    try {
      const res = await fetch(`${apiBase}/api/stores/${storeId}/reviews`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStoreReviewsList([]);
        return;
      }
      const reviews = Array.isArray(data) ? data : Array.isArray(data.reviews) ? data.reviews : [];
      setStoreReviewsList(reviews);
    } catch (error) {
      setStoreReviewsList([]);
    } finally {
      setIsLoadingReviews(false);
    }
  };

  const fetchMyIssueReports = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${apiBase}/api/reports/issue/user/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setMyIssueReports(data);
      }
    } catch (error) {
      console.error("Error fetching issue reports:", error);
    }
  };

  useEffect(() => {
    fetchStores();
    fetchMyOrders();
    fetchMyRefunds();
    fetchNotifs();
    fetchFoodCourtStatus();

    const stopLive = startPolling(() => Promise.allSettled([fetchMyOrders(), fetchNotifs()]), 5000);
    const stopSlow = startPolling(() => Promise.allSettled([fetchStores(), fetchMyRefunds()]), 30000);
    return () => { stopLive(); stopSlow(); };
  }, [userId, apiBase]);

  useEffect(() => {
    const loadUserProfile = async () => {
      if (!userId) return;
      try {
        const res = await fetch(`${apiBase}/api/users/${userId}`);
        if (!res.ok) {
          console.error("โหลดข้อมูลโปรไฟล์ไม่สำเร็จ");
        return;
        }
        const data = await res.json();

        setFullName(data.FullName || "");
        setPhone(data.Phone || "");
        setProfileImage(data.ProfileImg || data.ProfileImage || data.avatar || null);

        setEditName(data.FullName || "");
        setEditPhone(data.Phone || "");
      } catch (error) {
        console.error("Load user profile error:", error);
      }
    };

    loadUserProfile();
  }, [userId, apiBase]);

  useEffect(() => {
    if (!selectedStore) return undefined;
    fetchProducts();
    return startPolling(fetchProducts, 10000);
  }, [selectedStore, apiBase]);

  useEffect(() => {
    fetchMyIssueReports();
  }, [userId]);

  useEffect(() => {
    const pendingOutOfStock = myOrders.find(
      (ord) =>
        ord.Status === "Pending_Cancellation" ||
        ord.Status === "OutOfStock_Pending" ||
        ord.Status === "Item_Unavailable"
    );

    if (pendingOutOfStock) {
      if (!outOfStockOrder || outOfStockOrder.OrderID !== pendingOutOfStock.OrderID) {
        setOutOfStockOrder(pendingOutOfStock);
        const storeId = pendingOutOfStock.StoreId || pendingOutOfStock.StoreID || pendingOutOfStock.store_id;
        if (storeId) setSelectedStore(Number(storeId));
      }
    } else {
      setOutOfStockOrder(null);
      setIsChangeMenuMode(false);
      setNewSelectedProduct(null);
    }
  }, [myOrders]);

  useEffect(() => {
    if (!outOfStockOrder) return undefined;
    const tick = () => setTimeLeft(secondsUntil(outOfStockOrder.CancelDeadline));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [outOfStockOrder?.OrderID, outOfStockOrder?.CancelDeadline]);

  useEffect(() => {
    if (notifs.length > 0 && !isInitialized) {
      const keys = notifs.map((n) => getNotifKey(n));
      setReadNotifIds(keys);
      setIsInitialized(true);
    }
  }, [notifs, isInitialized]);

  useEffect(() => {
    const fetchFoodCourtStatus = async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/food-court/status`
        );
        if (!res.ok) return;
        const data = await res.json();
        setFoodCourtOpenTime(data?.open_time || "");
        setFoodCourtCloseTime(data?.close_time || "");
      } catch (error) {
        console.error(
          "โหลดเวลาเปิด-ปิดศูนย์อาหารไม่สำเร็จ:",
          error
        );
      }
    };

    fetchFoodCourtStatus();
    return startPolling(fetchFoodCourtStatus, 30000);
  }, [apiBase]);

  const activeStore = useMemo(
    () => stores.find((store) => Number(store.StoreId) === Number(selectedStore)) || {},
    [stores, selectedStore]
  );

  const cartStoreId = cart.length ? Number(cart[0].StoreId || cart[0].store_id) || null : null;
  const cartStore = useMemo(
    () => stores.find((store) => Number(store.StoreId) === Number(cartStoreId)) || {},
    [stores, cartStoreId]
  );

  const cartCount = useMemo(() => countCartDishes(cart), [cart]);

  const totalAmount = useMemo(
    () => sumCart(cart),
    [cart]
  );

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const contracted = stores.filter((store) => store.ContractState === "ACTIVE");
    if (!keyword) return contracted;
    return contracted.filter((store) => String(store.StoreName || "").toLowerCase().includes(keyword));
  }, [stores, search]);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => String(product.ProductName || "").toLowerCase().includes(keyword));
  }, [products, search]);

  const unreadNotifsCount = useMemo(
    () => notifs.filter((n) => !readNotifIds.includes(getNotifKey(n))).length,
    [notifs, readNotifIds]
  );

  const handleSelectTab = (tabName) => {
    setActiveTab(tabName);
    if (tabName === "menu") setViewMode("stores");
    if (tabName === "notifs") {
      const currentKeys = notifs.map((notification) => getNotifKey(notification));
      setReadNotifIds((prev) => Array.from(new Set([...prev, ...currentKeys])));
    }
  };

  const handleSelectStore = (storeId) => {
    setSelectedStore(storeId);
    setViewMode("products");
  };

  const addToCart = (product) => {
    if (cart.length > 0) {
      const currentCartStoreId = Number(cart[0].StoreId || cart[0].store_id);
      const newProductStoreId = Number(product.StoreId || product.store_id || selectedStore);
      if (currentCartStoreId !== newProductStoreId) {
        customAlert(
          "เปลี่ยนร้านค้า?", "ในตะกร้าของคุณมีสินค้าจากร้านอื่นอยู่ หากเพิ่มสินค้าจากร้านนี้ ตะกร้าเดิมจะถูกล้างออก", "warning",
          () => {
            setCart([createCartRow(product)]);
            setIsCartOpen(true);
          }
        );
        return;
      }
    }
    setCart((prev) => addProductToCart(prev, product));
    setIsCartOpen(true);
  };

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const increaseQty = (index) => {
    setCart((prev) => increaseRowQty(prev, index));
  };

  const decreaseQty = (index) => {
    setCart((prev) => decreaseRowQty(prev, index));
  };

  // แยก 1 จานออกเพื่อใส่หมายเหตุเฉพาะ
  const splitOneFromCart = (index) => {
    setCart((prev) => splitOneFromRow(prev, index));
  };

  const updateItemNote = (index, note) => {
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, item_note: note } : item)));
  };

  // OUT OF STOCK HANDLERS
  const handleCancelOutOfStockOrder = async (customReason = "ลูกค้าขอยกเลิกเนื่องจากวัตถุดิบหมด") => {
    if (!outOfStockOrder) return;
    try {
      const res = await fetch(`${apiBase}/api/orders/${outOfStockOrder.OrderID}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, reason: customReason }),
      });
      if (res.ok) {
        customAlert("ยกเลิกคำสั่งซื้อแล้ว", `กรุณารับเงินคืนที่ร้าน ${outOfStockOrder.StoreName || ""} โดยแจ้งเลขคิว ${outOfStockOrder.QueueNo}`, "success");
        setOutOfStockOrder(null);
        setIsChangeMenuMode(false);
        setNewSelectedProduct(null);
        await fetchMyOrders();
      } else {
        const err = await res.json().catch(() => ({}));
        customAlert("เกิดข้อผิดพลาด", err.detail || "ไม่สามารถยกเลิกออเดอร์ได้", "error");
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
    }
  };

  const handleChangeOrderMenu = async () => {
    if (!outOfStockOrder || !newSelectedProduct) return;
    const originalItem = getOutOfStockItem(outOfStockOrder);

    try {
      const res = await fetch(`${apiBase}/api/orders/${outOfStockOrder.OrderID}/change-item`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: Number(userId),
          detail_id: originalItem?.DetailID || originalItem?.DetailId || null,
          product_id: Number(originalItem?.ProductId || 0),
          new_product_id: Number(newSelectedProduct.ProductId),
          new_product_name: String(newSelectedProduct.ProductName),
          unit_price: Number(newSelectedProduct.UnitPrice),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.message)) {
        if (Number(data.top_up_due) > 0) {
          customAlert("เปลี่ยนเมนูสำเร็จ", `กรุณาโอนส่วนต่าง ${Number(data.top_up_due).toFixed(2)} บาท และแนบสลิป ร้านจะเริ่มทำอาหารหลังตรวจสลิปแล้ว`, "success");
        } else {
          customAlert("สำเร็จ", "เปลี่ยนเมนูสำเร็จ ระบบได้ส่งข้อมูลปรับเปลี่ยนไปยังหน้าร้านเรียบร้อยแล้ว", "success");
        }
        setOutOfStockOrder(null);
        setIsChangeMenuMode(false);
        setNewSelectedProduct(null);
        await fetchMyOrders();
      } else {
        customAlert("เกิดข้อผิดพลาด", data.detail || "ไม่สามารถเปลี่ยนเมนูได้", "error");
      }
    } catch (error) {
      console.error("Error changing menu:", error);
      customAlert("เกิดข้อผิดพลาด", "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้", "error");
    }
  };

  // TOP-UP HANDLERS
  const topUpOrder = myOrders.find((ord) => ord.Status === "Awaiting_Top_Up") || null;

  const handleTopUpSlipChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      customAlert("รองรับเฉพาะไฟล์รูป PNG, JPG หรือ WEBP", "", "warning");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      customAlert("ขนาดไฟล์สลิปต้องไม่เกิน 5MB", "", "warning");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setTopUpSlip(reader.result);
    reader.onerror = () => customAlert("อ่านไฟล์สลิปไม่สำเร็จ", "กรุณาเลือกรูปใหม่อีกครั้ง", "error");
    reader.readAsDataURL(file);
  };

  const submitTopUpSlip = async () => {
    if (!topUpOrder || !topUpSlip || isSubmittingTopUp) return;
    setIsSubmittingTopUp(true);
    try {
      const res = await fetch(`${apiBase}/api/orders/${topUpOrder.OrderID}/top-up-slip`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slip_url: topUpSlip }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        customAlert("ส่งสลิปแล้ว", "รอร้านตรวจสลิปส่วนต่าง แล้วร้านจะเริ่มทำอาหาร", "success");
        setTopUpSlip(null);
        await fetchMyOrders();
      } else {
        customAlert("เกิดข้อผิดพลาด", data.detail || "ส่งสลิปไม่สำเร็จ", "error");
      }
    } catch (error) {
      console.error("Error uploading top-up slip:", error);
      customAlert("เกิดข้อผิดพลาด", "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้", "error");
    } finally {
      setIsSubmittingTopUp(false);
    }
  };

  const cancelTopUpOrder = async () => {
    if (!topUpOrder) return;
    try {
      const res = await fetch(`${apiBase}/api/orders/${topUpOrder.OrderID}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "ลูกค้ายกเลิกแทนการโอนส่วนต่าง" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        customAlert("ยกเลิกคำสั่งซื้อแล้ว", `กรุณารับเงินคืนที่ร้าน ${topUpOrder.StoreName || ""} โดยแจ้งเลขคิว ${topUpOrder.QueueNo}`, "success");
        setTopUpSlip(null);
        await fetchMyOrders();
      } else {
        customAlert("เกิดข้อผิดพลาด", data.detail || "ไม่สามารถยกเลิกออเดอร์ได้", "error");
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
    }
  };

  // PROFILE HANDLERS
  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      customAlert("ขนาดไฟล์รูปโปรไฟล์ต้องไม่เกิน 5MB", "", "warning");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setCropImage(event.target.result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setIsCropModalOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const createCroppedImage = async () => {
    if (!cropImage || !croppedAreaPixels) return;

    try {
      const image = new Image();
      image.src = cropImage;

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;

      ctx.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height, 0, 0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );

      const croppedBase64 = canvas.toDataURL("image/jpeg", 0.8);
      setProfileImage(croppedBase64);
      setIsCropModalOpen(false);
      setCropImage(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);

      const res = await fetch(`${apiBase}/api/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          full_name: fullName,
          phone: phone,
          profile_img: croppedBase64,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || "ไม่สามารถอัปเดตรูปไปยังเซิร์ฟเวอร์ได้");
      }

      const updatedUser = await res.json();
      setProfileImage(updatedUser.ProfileImg || croppedBase64);
      customAlert("สำเร็จ", "อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว!", "success");
    } catch (error) {
      console.error("Crop/Save image error:", error);
      setIsCropModalOpen(false);
      setCropImage(null);
      customAlert("เกิดข้อผิดพลาด", error.message || "ไม่สามารถบันทึกรูปภาพได้", "error");
    }
  };

  const handleRemoveProfileImage = () => {
    setProfileImage(null);
    customAlert("สำเร็จ", "ลบรูปโปรไฟล์เรียบร้อยแล้ว", "success");
  };

  const handleSaveProfileData = async (e) => {
    e.preventDefault();

    if (!editName.trim()) return customAlert("กรุณากรอกชื่อ-นามสกุล", "", "warning");
    if (!editPhone.trim()) return customAlert("กรุณากรอกเบอร์โทรศัพท์", "", "warning");
    if (!/^\d{10}$/.test(editPhone.trim())) return customAlert("เบอร์โทรศัพท์ไม่ถูกต้อง", "กรุณากรอกตัวเลข 10 หลัก", "warning");

    try {
      const res = await fetch(`${apiBase}/api/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          full_name: editName,
          phone: editPhone,
          profile_img: profileImage,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || "แก้ไขข้อมูลไม่สำเร็จ");
      }

      const updatedUser = await res.json();
      setFullName(updatedUser.FullName || editName);
      setPhone(updatedUser.Phone || editPhone);
      setProfileImage(updatedUser.ProfileImg || profileImage || null);
      setIsEditing(false);
      customAlert("อัปเดตข้อมูลส่วนตัวเรียบร้อยแล้ว!");
    } catch (err) {
      console.error("Update profile error:", err);
      customAlert("เกิดข้อผิดพลาดในการบันทึกข้อมูล", err.message, "error");
    }
  };

  const checkFoodCourtOrderTime = () => {
    if (!foodCourtOpenTime || !foodCourtCloseTime) {
      customAlert(
        "ไม่สามารถตรวจสอบเวลาได้",
        "กรุณารอสักครู่แล้วลองใหม่อีกครั้ง",
        "warning"
      );
      return false;
    }

    if (foodCourtMode === "CLOSED" || !isFoodCourtOpen) {
      customAlert(
        "ไม่สามารถสั่งอาหารได้",
        `เวลาสั่งอาหารคือ ${foodCourtOpenTime}–${foodCourtCloseTime} น.`,
        "error"
      );
      return false;
    }

    if (foodCourtMode === "OPEN") {
      return true;
    }

    const currentTime = getCurrentDateTimeForBackend()
      .split(" ")[1]
      .slice(0, 5);

    if (
      currentTime < foodCourtOpenTime ||
      currentTime >= foodCourtCloseTime
    ) {
      customAlert(
        "ไม่สามารถสั่งอาหารได้",
        `เวลาสั่งอาหารคือ ${foodCourtOpenTime}–${foodCourtCloseTime} น.`,
        "error"
      );
      return false;
    }

    return true;
  };

  // ORDER SUBMISSION & PAYMENT HANDLERS
  const isPickupInPast = () =>
    Boolean(pickupTime) && toMinutes(pickupTime) < toMinutes(formatBangkokTime(new Date()));

  useEffect(() => { orderRequestKeyRef.current = null; }, [cart, pickupTime, paymentMethod]);

  // M5: ราคาเมนูอาจเปลี่ยนหลังใส่ตะกร้า -> ถามยอดจริงก่อนแสดง QR (ไม่งั้นลูกค้าโอนผิดยอด)
  const priceChanged = (items, total) => {
    setCart((prev) => applyServerPrices(prev, items));
    customAlert("ราคาเมนูเปลี่ยนแล้ว", `ยอดที่ถูกต้องคือ ${Number(total).toFixed(2)} บาท กรุณาตรวจตะกร้าแล้วกดชำระเงินอีกครั้ง`, "warning");
  };

  const handleProceedToPayment = async () => {
    if (!checkFoodCourtOrderTime()) return;
    if (isPickupInPast()) {
      return customAlert("เวลารับอาหารที่เลือกผ่านไปแล้ว", "กรุณาเลือกเวลารับใหม่ หรือกด \"รับทันที\"", "warning");
    }
    if (cart.length === 0) return customAlert("กรุณาเลือกอาหารลงตะกร้าก่อนสั่งซื้อ", "", "error");
    if (!cartStoreId) return customAlert("กรุณาเลือกร้านอาหาร", "", "error");
    try {
      const res = await fetch(`${apiBase}/api/orders/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: cartStoreId, items: cart.map((item) => ({ product_id: Number(item.ProductId), qty: Number(item.qty) || 1 })) }),
      });
      const quote = await res.json().catch(() => ({}));
      if (!res.ok) return customAlert(quote.detail || "ตรวจสอบราคาไม่สำเร็จ", "", "error");
      if (Math.abs(Number(quote.total) - totalAmount) > 0.001) return priceChanged(quote.items, quote.total);
    } catch {
      return customAlert("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่", "", "error");
    }
    setIsCartOpen(false);
    setIsPaymentModalOpen(true);
  };

  const handleLatePickup = async (order, minutes) => {
    const orderId = order.OrderID;

    const currentData = latePickupOrder[orderId] || {
      count: 0,
      arrivalTime: "",
    };

    if (currentData.count >= 3) {
      customAlert(
        "แจ้งครบจำนวนแล้ว",
        "คุณแจ้งเวลามารับช้าออเดอร์นี้ครบ 3 ครั้งแล้ว",
        "warning"
      );
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/orders/${orderId}/late-pickup`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            minutes: Number(minutes),
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        customAlert(
          "แจ้งเวลามารับไม่สำเร็จ",
          data.detail || "ไม่สามารถบันทึกเวลามารับได้ กรุณาลองใหม่",
          "warning"
        );
        return;
      }

      // ใช้เวลาที่ Backend คำนวณและบันทึกลงฐานข้อมูลแล้ว
      const arrivalDate = new Date(data.arrival_time);

      const arrivalTime = arrivalDate.toLocaleTimeString("th-TH", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      // อัปเดตหน้าจอหลังจากบันทึกฐานข้อมูลสำเร็จเท่านั้น
      setLatePickupOrder((prev) => ({
        ...prev,
        [orderId]: {
          count: Number(data.count),
          arrivalTime,
          minutes: Number(data.minutes),
        },
      }));

      customAlert(
        "แจ้งเวลามารับเรียบร้อย",
        `คุณแจ้งว่าจะมาถึงเวลา ${arrivalTime} น. (แจ้งแล้ว ${data.count}/3 ครั้ง)`,
        "success"
      );
    } catch (error) {
      customAlert(
        "เชื่อมต่อไม่สำเร็จ",
        "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง",
        "error"
      );
    }
  };

  // อ่านสลิปเป็น data URL (base64) เพื่อส่งให้ backend บันทึกเป็นไฟล์
  const handleSlipChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      customAlert("รองรับเฉพาะไฟล์รูป PNG, JPG หรือ WEBP", "", "warning");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      customAlert("ขนาดไฟล์สลิปต้องไม่เกิน 5MB", "", "warning");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSlipFile(file);
      setSlipPreview(reader.result);
    };
    reader.onerror = () => customAlert("อ่านไฟล์สลิปไม่สำเร็จ", "กรุณาเลือกรูปใหม่อีกครั้ง", "error");
    reader.readAsDataURL(file);
  };

  // โหลดเฉพาะข้อมูลคิวที่จำเป็นสำหรับประเมินเวลารอให้ลูกค้า
  useEffect(() => {
    if (!cartStoreId || !isCartOpen) {
      setQueueEstimateOrders([]);
      return;
    }
  
    let cancelled = false;
    const loadQueueEstimate = async () => {
      try {
        const res = await fetch(`${apiBase}/api/orders/queue-estimate?store_id=${cartStoreId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setQueueEstimateOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch (error) {
        // การประเมินเวลาเป็นข้อมูลเสริม จึงไม่ขัดขวางการสั่งอาหารหากโหลดไม่สำเร็จ
      }
    };
  
    loadQueueEstimate();
    const stop = startPolling(loadQueueEstimate, 10000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [apiBase, cartStoreId, isCartOpen]);

  // ช่วงเวลารับโดยประมาณของตะกร้า (ต่อท้ายคิวที่ค้างอยู่)
  const getCustomerPickupRange = () => {
    const cartDishCount = countCartDishes(cart);
    if (!cartDishCount) return "กำลังคำนวณเวลา...";
    const { newOrder } = buildQueueSchedule(queueEstimateOrders, cartDishCount);
    return formatPickupRange(newOrder.start, newOrder.end);
  };

  // โหลดคิวของร้านที่ลูกค้ามีออเดอร์ค้างอยู่ เฉพาะตอนเปิดแท็บคำสั่งซื้อ
  const activeOrderStoreKey = myOrders
    .filter((o) => canEstimateOrder(o))
    .map((o) => o.StoreId)
    .filter(Boolean)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .sort()
    .join(",");

  useEffect(() => {
    if (activeTab !== "orders" || !activeOrderStoreKey) return;
    let cancelled = false;
    const storeIds = activeOrderStoreKey.split(",");
    const load = async () => {
      const entries = await Promise.all(
        storeIds.map(async (id) => {
          try {
            const res = await fetch(`${apiBase}/api/orders/queue-estimate?store_id=${id}`);
            if (!res.ok) return [id, null];
            const data = await res.json();
            return [id, Array.isArray(data.orders) ? data.orders : []];
          } catch (e) {
            return [id, null];
          }
        })
      );
      if (cancelled) return;
      setOrderQueueEstimates((prev) => {
        const next = { ...prev };
        entries.forEach(([id, orders]) => {
          if (orders) next[id] = orders;
        });
        return next;
      });
    };
    load();
    const stop = startPolling(load, 10000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [apiBase, activeTab, activeOrderStoreKey]);

  const getOrderPickupRange = (order) => {
    const status = orderStatusKey(order);
    if (status === "ready") return "พร้อมรับแล้ว";
    if (!canEstimateOrder(order)) return "-";

    // ออเดอร์ที่นัดเวลารับไว้ ใช้เวลานัดตามที่ลูกค้าเลือก
    if (!isImmediatePickup(order.PickupTime, order.OrderTime)) {
      const dishes = countOrderDishes(order);
      const queueForStore = orderQueueEstimates[order.StoreId];
      // ยังโหลดคิวไม่เสร็จ -> ใช้จำนวนจานของออเดอร์นี้ประเมินตัวคูณไปก่อน
      const buffer = queueForStore ? buildQueueSchedule(queueForStore, dishes).buffer : kitchenBuffer(dishes);
      const windowMinutes = scheduledWindowMinutes(dishes, buffer);
      return formatScheduledPickupRange(order.PickupTime, windowMinutes);
    }

    const queue = orderQueueEstimates[order.StoreId];
    if (!queue) return "กำลังคำนวณเวลา...";

    // อยู่ในคิวครัวแล้ว (Pending/Cooking) -> ใช้ช่วงของคิวตัวเองในโซ่
    const { slots } = buildQueueSchedule(queue);
    const slot = slots[order.OrderID];
    if (slot) return formatPickupRange(slot.start, slot.end);

    // ยังไม่อยู่ในคิวครัว
    const dishes = countOrderDishes(order);
    const { newOrder } = buildQueueSchedule(queue, dishes);
    return formatPickupRange(newOrder.start, newOrder.end);
  };
  const submitOrder = async () => {
    if (isSubmittingOrder) return;
    if (!checkFoodCourtOrderTime()) return;
    if (isPickupInPast()) {
      setIsPaymentModalOpen(false);
      setIsCartOpen(true);
      return customAlert("เวลารับอาหารที่เลือกผ่านไปแล้ว", "กรุณาเลือกเวลารับใหม่ หรือกด \"รับทันที\"", "warning");
    }

    if (!slipFile || !slipPreview) {
      return customAlert("ไม่พบรูปภาพสลิป", "กรุณาอัปโหลดรูปภาพสลิปชำระเงินก่อนกดสั่งซื้อ", "warning");
    }

    const currentOrderTime = getCurrentDateTimeForBackend();
    const displayOrderTime = getCurrentTimeFormatted();
    const finalPickupTime = pickupTime ? `${pickupTime} น.` : null;

    const orderItems = cart.map((item) => ({
      product_id: Number(item.ProductId),
      qty: Number(item.qty) || 1,
      unit_price: Number(item.UnitPrice || 0),
      item_note: item.item_note || "",
    }));

    const orderData = {
      store_id: cartStoreId,
      user_id: userId,
      items: orderItems,
      payment_method: paymentMethod,
      slip_url: slipPreview,
      note: orderNote || "",
      pickup_time: finalPickupTime,
      order_time: currentOrderTime,
      expected_total: Number(totalAmount.toFixed(2)),
      // กดซ้ำ / เน็ตหลุดแล้วกดใหม่ด้วยตะกร้าเดิม = ได้ออเดอร์เดิมกลับ ไม่สร้างซ้ำ
      client_request_id: orderRequestKeyRef.current || (orderRequestKeyRef.current = newRequestKey()),
    };

    setIsSubmittingOrder(true);
    try {
      const res = await fetch(`${apiBase}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.price_changed) {
        setIsPaymentModalOpen(false);
        setIsCartOpen(true);
        return priceChanged(data.items, data.total);
      }
      if (!res.ok) return customAlert(data.detail || "ไม่สามารถสั่งซื้อได้", "", "error");
      orderRequestKeyRef.current = null;

      // รับทันที -> แสดงช่วงเวลาโดยประมาณเหมือนในตะกร้า / นัดเวลา -> แสดงเวลานัด
      const pickupLabel = pickupTime ? finalPickupTime : (getCustomerPickupRange() || displayOrderTime);
      customAlert(
        `สั่งซื้อสำเร็จ!`,
        `หมายเลขคิว: ${data.queue_no || "-"}\nเวลาที่สั่ง: ${displayOrderTime}\nเวลารับอาหารโดยประมาณ: ${pickupLabel}`
      );

      setCart([]);
      setOrderNote("");
      setPickupTime("");
      setSlipFile(null);
      setSlipPreview(null);
      setIsPaymentModalOpen(false);
      setActiveTab("orders");
      fetchMyOrders();
      fetchNotifs();
    } catch (error) {
      console.error("Submit order error:", error);
      customAlert("เกิดข้อผิดพลาดในการเชื่อมต่อ Backend", "", "error");
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // REVIEWS HANDLERS
  const handleOpenStoreReviews = (e, store) => {
    e.stopPropagation();
    setSelectedStoreForReviews(store);
    fetchStoreReviews(store.StoreId);
  };

  const handleOpenReviewModal = (order) => {
    setReviewOrder(order);
    const localReview = reviewedOrderIds[order.OrderID];
    if (localReview || order.IsReviewed || order.review) {
      setIsReadOnlyReview(true);
      setRating(localReview?.rating || order.review?.rating || order.Rating || 5);
      setReviewComment(localReview?.comment || order.review?.comment || order.ReviewComment || "ไม่มีข้อความรีวิว");
      setReviewImagePreview(localReview?.imageUrl || order.review?.image_url || order.ReviewImage || null);
    } else {
      setIsReadOnlyReview(false);
      setRating(5);
      setHoverRating(0);
      setReviewComment("");
      setReviewImageFile(null);
      setReviewImagePreview(null);
    }
  };

  const handleReviewImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      customAlert("ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB", "", "warning");
      e.target.value = "";
      return;
    }

    setReviewImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const maxWidth = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        setReviewImagePreview(compressedBase64);
      };
    };
    reader.readAsDataURL(file);
  };

  const submitReview = async () => {
    if (!reviewOrder) return;

    try {
      const res = await fetch(`${apiBase}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: reviewOrder.OrderID,
          user_id: userId,
          rating: Number(rating),
          comment: reviewComment.trim() || "",
          image_url: reviewImagePreview || "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return customAlert(data.detail || "ไม่สามารถส่งรีวิวได้", "", "error");
      customAlert("ส่งรีวิวเรียบร้อยแล้ว ");
      setReviewedOrderIds((prev) => ({
        ...prev,
        [reviewOrder.OrderID]: {
          rating: Number(rating),
          comment: reviewComment.trim() || "ไม่มีข้อความรีวิว",
          imageUrl: reviewImagePreview,
        },
      }));
      setReviewOrder(null);
      setReviewComment("");
      setReviewImageFile(null);
      setReviewImagePreview(null);
      fetchMyOrders();
    } catch (error) {
      console.error(error);
      customAlert("เกิดข้อผิดพลาดในการส่งรีวิว", "", "error");
    }
  };

  // REPORT HANDLERS
  const handleOpenReportModal = (order = null) => {
    if (order) {
      const hasReportedIssue = myIssueReports.some(
        (report) => Number(report.OrderID || report.order_id) === Number(order.OrderID)
      );

      if (hasReportedIssue) {
        fetchMyIssueReports();
        setIsViewReportsModalOpen(true);
        return;
      }
    }

    setSelectedOrderForReport(order);
    setIssueType(order?.Status === "Cancelled" ? "ออเดอร์ถูกยกเลิก / ขอตรวจสอบเหตุผล" : "อาหารไม่ตรงตามออเดอร์");
    setIssueDescription("");
    setIsReportModalOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!issueDescription.trim()) return customAlert("", "กรุณากรอกรายละเอียดปัญหาที่พบ", "warning");

    if (selectedOrderForReport) {
      const hasReportedIssue = myIssueReports.some(
        (report) => Number(report.OrderID || report.order_id) === Number(selectedOrderForReport.OrderID)
      );

      if (hasReportedIssue) {
        setIsReportModalOpen(false);
        fetchMyIssueReports();
        setIsViewReportsModalOpen(true);
        return;
      }
    }

    setIsSubmittingReport(true);
    try {
      const res = await fetch(`${apiBase}/api/reports/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          order_id: selectedOrderForReport ? selectedOrderForReport.OrderID : null,
          store_id: selectedOrderForReport ? selectedOrderForReport.StoreId || selectedOrderForReport.StoreID : null,
          issue_type: issueType,
          description: issueDescription,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        customAlert("ส่งรายงานปัญหาเรียบร้อยแล้ว เจ้าหน้าที่จะดำเนินการตรวจสอบโดยเร็วที่สุด");
        setIsReportModalOpen(false);
        setIssueDescription("");

        if (selectedOrderForReport) {
          setMyIssueReports((prev) => [
            ...prev,
            {
              OrderID: selectedOrderForReport.OrderID,
              order_id: selectedOrderForReport.OrderID,
              IssueType: issueType,
              Description: issueDescription,
              Status: "Pending",
              CreatedAt: new Date().toISOString(),
            },
          ]);
        }

        setSelectedOrderForReport(null);
        fetchMyIssueReports();
        fetchNotifs();
      } else {
        customAlert(data.detail || "ไม่สามารถส่งรายงานปัญหาได้", "", "error");
      }
    } catch (error) {
      console.error("Submit report error:", error);
      customAlert("เกิดข้อผิดพลาดในการส่งข้อมูล", "", "error");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // MENU TAB 
  const renderMenu = () => {
    return (
      <>
        <div className="hero-banner" style={heroStyle}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "0px" }}>สวัสดี {fullName} <HiIcon/></div>
            <h1 style={{ margin: "0 0 8px", fontSize: "clamp(27px, 4vw, 40px)", fontWeight: "900" }}>หิวแล้วใช่ไหม?</h1>
            <p style={{ margin: 0, fontSize: "14px" }}>เลือกอาหารร้านโปรด แล้วสั่งได้ง่าย ๆ</p>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 4 }}>
            <div style={{ filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.18))" }}>
              <NoodleBowlArt width={150} height={120} />
            </div>
            <div style={{ position: "absolute", top: "-15px", right: "-10px", transform: "rotate(15deg)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))"}}>
              <ThaiTeaArt width={45} height={85} />
            </div>
            <div className="animated-sparkle" style={{ position: "absolute", bottom: "-5px", left: "-25px"}}>
              <SparkleArt width={24} height={24} />
            </div>
            <div className="animated-sparkle" style={{ position: "absolute", top: "-10px", left: "10px", animationDelay: "1s" }}>
              <SparkleArt width={18} height={18} />
            </div>
          </div>
        </div>

        {viewMode === "stores" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h2 style={{ margin: 0, fontSize: "23px", fontWeight: "900" }}>ร้านอาหารแนะนำ </h2>
              {isFoodCourtOpen && <span style={{ fontSize: "13px", color: COLORS.gray }}>{filteredStores.length} ร้านค้า</span>}
            </div>

            {!isFoodCourtOpen ? (
              <div style={{ ...cardStyle, textAlign: "center", padding: "60px 20px", background: "#FFF0ED", border: `1px solid ${COLORS.red}40`, borderRadius: "24px" }}>
                <div style={{ fontSize: "55px", marginBottom: "12px" }}>🛑</div>
                <h3 style={{ fontSize: "22px", fontWeight: "900", color: COLORS.red, margin: "0 0 8px 0" }}>
                  ไม่สามารถสั่งอาหารได้เนื่องจากศูนย์อาหารปิด
                </h3>
                <p style={{ color: COLORS.gray, fontSize: "14px", margin: 0 }}>
                  ศูนย์อาหารปิดให้บริการชั่วคราว กรุณากลับมาใหม่ในเวลาทำการ
                </p>
              </div>
            ) : (
              <div className="customer-store-grid"
                style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                {filteredStores.map(store => {
                  const avgRating = Number(store.RatingAverage || store.rating || 0);
                  const totalReviews = Number(store.ReviewCount || store.review_count || 0);
                  const isStoreUnavailable = store.IsSuspended || !store.IsOpen;

                  return (
                    <div
                      key={store.StoreId}
                      onClick={() => {
                        if (store.IsSuspended) {
                          customAlert("ร้านค้านี้ถูกระงับสิทธิ์การจำหน่ายชั่วคราว", "ไม่สามารถเข้าชมหรือสั่งซื้อได้", "warning");
                          return;
                        }
                        if (!store.IsOpen) {
                          customAlert("ร้านค้านี้ปิดให้บริการชั่วคราว", "ไม่สามารถเข้าชมหรือสั่งซื้อได้", "warning");
                          return;
                        }
                        handleSelectStore(store.StoreId);
                      }}
                      style={{
                        ...cardStyle,
                        cursor: isStoreUnavailable ? "not-allowed" : "pointer",
                        opacity: isStoreUnavailable ? 0.6 : 1,
                        transition: "transform 0.2s, box-shadow 0.2s",
                        display: "flex",
                        flexDirection: "column"
                      }}
                      onMouseEnter={(e) => {
                        if (!store.IsSuspended) {
                          e.currentTarget.style.transform = "translateY(-4px)";
                          e.currentTarget.style.boxShadow = "0 12px 30px rgba(42,44,65,0.12)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!store.IsSuspended) {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = "0 7px 25px rgba(42,44,65,0.07)";
                        }
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                        <img
                          src={store.ImageUrl || "https://via.placeholder.com/400x200?text=Store+Image"}
                          alt={store.StoreName}
                          style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "15px", marginBottom: "12px" }}
                        />
                        <div style={{ fontSize: "18px", fontWeight: "900", marginBottom: "4px" }}>{store.StoreName}</div>
                        <div style={{ fontSize: "12px", color: COLORS.gray, marginBottom: "10px", flex: 1 }}>
                          {store.Description || "ร้านอาหารอร่อย คุณภาพดี ศูนย์อาหาร KMITL"}
                        </div>

                        <div 
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "space-between", 
                            flexWrap: "wrap",
                            gap: "8px",
                            background: "#FFF9F0", 
                            padding: "8px 12px", 
                            borderRadius: "12px", 
                            marginBottom: "10px",
                            border: `1px solid ${COLORS.yellow}50`
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}>
                            <span style={{ color: COLORS.yellow, display: "flex", alignItems: "center", flexShrink: 0 }}><StarIcon size={24}/></span>
                            <span style={{ fontWeight: "900", fontSize: avgRating > 0 ? "14px" : "12px", color: COLORS.navy, whiteSpace: "nowrap" }}>
                              {avgRating > 0 ? avgRating.toFixed(1) : "ยังไม่มีรีวิว"}
                            </span>
                            {totalReviews > 0 && (
                              <span style={{ fontSize: "11px", color: COLORS.gray, whiteSpace: "nowrap" }}>({totalReviews})</span>
                            )}
                          </div>

                          <button
                            className="customer-review-btn"
                            onClick={(e) => handleOpenStoreReviews(e, store)}
                            style={{
                              background: COLORS.white,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: "15px",
                              boxSizing: "border-box",
                              maxWidth: "100%",
                              whiteSpace: "nowrap",
                              padding: "5px 12px",
                              minHeight: "28px",
                              fontSize: "11px",
                              fontWeight: "600",
                              color: COLORS.navy,
                              cursor: "pointer",
                              boxShadow: "0 2px 5px rgba(0,0,0,0.04)"
                            }}
                          >
                            ดูรีวิวทั้งหมด
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${COLORS.border}`, paddingTop: "10px", marginTop: "6px" }}>
                        <span style={{
                          padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "800",
                          background: store.IsSuspended ? "#FFF0ED" : store.IsOpen ? "#E8F8F3" : "#FFF7DD",
                          color: store.IsSuspended ? COLORS.red : store.IsOpen ? COLORS.green : "#9A7100"
                        }}>
                          {store.IsSuspended ? "● ถูกระงับ" : store.IsOpen ? "● เปิด" : "● ปิดชั่วคราว"}
                        </span>
                        <span className="customer-select-store" style={{ color: isStoreUnavailable ? COLORS.gray : COLORS.orange, fontWeight: "800", fontSize: "14px", whiteSpace: "nowrap" }}>
                          {store.IsSuspended ? "ถูกระงับสิทธิ์" : !store.IsOpen ? "ปิดให้บริการ" : "เลือกร้านนี้ ➔"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {viewMode === "products" && (
          <div>
            <div className="customer-products-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "20px" }}>
              <button
                className="customer-back-btn"
                onClick={() => setViewMode("stores")}
                style={{
                  background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: "20px",
                  padding: "8px 16px", cursor: "pointer", fontWeight: "800", fontSize: "13px", color: COLORS.navy,
                  display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", flexShrink: 0
                }}
              >
                ← เลือกร้านอื่น
              </button>
              <h2 className="customer-products-title" style={{ margin: 0, fontSize: "22px", fontWeight: "900", minWidth: 0, textAlign: "right" }}>
                <span className="customer-products-title-prefix">ร้าน: </span>{activeStore.StoreName}
              </h2>
            </div>

            {Boolean(activeStore.IsSuspended) && (
              <div style={{ background: "#FFF0ED", color: COLORS.red, padding: "15px", borderRadius: "15px", marginBottom: "20px", textAlign: "center", fontWeight: "700" }}>
                ร้านค้านี้ถูกระงับการจำหน่ายชั่วคราว
              </div>
            )}
            {!activeStore.IsOpen && !activeStore.IsSuspended && (
              <div style={{ background: "#FFF7DD", color: "#9A7100", padding: "15px", borderRadius: "15px", marginBottom: "20px", textAlign: "center", fontWeight: "700" }}>
                ร้านค้านี้ปิดให้บริการชั่วคราว
              </div>
            )}

            <div className="customer-product-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
              {filteredProducts.map(product => (
                <div key={product.ProductId} style={{ ...cardStyle, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <img
                    src={product.img || product.ImageUrl || "https://via.placeholder.com/400x280?text=Food"}
                    alt={product.ProductName}
                    style={{ width: "100%", height: "175px", objectFit: "cover", borderRadius: "15px 15px 0 0" }}
                  />
                  <div style={{ padding: "5px 2px 0" }}>
                    <div style={{ fontSize: "17px", fontWeight: "900", marginTop: "7px" }}>{product.ProductName}</div>
                    <div style={{ fontSize: "12px", color: COLORS.gray, minHeight: "34px", marginTop: "4px" }}>
                      {product.Description || "ไม่มีรายละเอียดเพิ่มเติม"}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "10px", gap: "8px" }}>
                      <span style={{ color: COLORS.orange, fontSize: "19px", fontWeight: "900" }}>{product.UnitPrice} ฿</span>
                      {product.IsOutOfStock ? (
                        <span style={{ color: COLORS.red, fontSize: "12px", fontWeight: "800" }}> สินค้าหมด</span>
                      ) : (
                        <button
                          onClick={() => addToCart(product)}
                          aria-label={`เพิ่ม ${product.ProductName} ลงตะกร้า`}
                          style={{width: "44px", height: "44px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                            padding: 0, border: "none", borderRadius: "50%", background: COLORS.orange, color: COLORS.white, cursor: "pointer", lineHeight: 0,
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredProducts.length === 0 && (
              <div style={{ ...cardStyle, textAlign: "center", padding: "50px 20px", color: COLORS.gray }}>
                <br />ไม่พบเมนูอาหารในร้านนี้
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  // ชิปโปรไฟล์ (รูป + ชื่อ) ใช้ทั้งหัวหน้าเมนูและหัวข้อของแต่ละแท็บ
  const renderProfileChip = () => (
    <div className="customer-profile-chip" onClick={() => handleSelectTab("profile")} style={profileStyle}>
      <div style={avatarStyle}>
        {profileImage ? (
          <img src={profileImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <UserIcon/>
        )}
      </div>
      <div className="customer-profile-name">
        <div style={{ fontSize: "13px", fontWeight: "800" }}>{fullName}</div>
      </div>
    </div>
  );

  // หัวข้อแท็บ + รูปโปรไฟล์อยู่แถวเดียวกัน
  const renderTabTitle = (title) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", margin: "5px 0 20px" }}>
      <h2 style={{ margin: 0, fontSize: "25px", fontWeight: "900", minWidth: 0 }}>{title}</h2>
      {renderProfileChip()}
    </div>
  );

  // PROFILE TAB
  const renderProfile = () => (
    <div>
      {renderTabTitle("โปรไฟล์ของฉัน")}
      <div style={{ background: COLORS.white, borderRadius: "25px", padding: "30px 25px", width: "100%", margin: "0 auto 30px", boxShadow: "0 7px 25px rgba(42,44,65,0.07)", border: `1px solid ${COLORS.border}`, overflow: "visible" }}>
        <div style={{ textAlign: "center", position: "relative" }}>
          <div style={{ position: "relative", width: "120px", height: "120px", margin: "0 auto 15px" }}>
            {profileImage ? (
              <img
                src={profileImage}
                alt="Profile Avatar"
                style={{ width: "120px", height: "120px", borderRadius: "50%", objectFit: "cover", border: `3px solid ${COLORS.orange}` }}
              />
            ) : (
              <div style={{ width: "120px", height: "120px", borderRadius: "50%", background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.yellow})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "56px" }}>
                <BigUserIcon />
              </div>
            )}

            <label
              htmlFor="profile-upload-input"
              style={{position: "absolute", bottom: "-2px", right: "-2px", background: COLORS.navy, color: COLORS.white, borderRadius: "50%", width: "44px", 
                height: "44px", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 0, boxSizing: "border-box",
                cursor: "pointer", boxShadow: "0 3px 10px rgba(0,0,0,0.2)", border: `3px solid ${COLORS.white}`
              }}
              title="เปลี่ยนรูปโปรไฟล์"
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
                  <path d="M3 8a2 2 0 0 1 2-2h2.5l1.4-2h6.2l1.4 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
              </span>
            </label>
            <input
              id="profile-upload-input" type="file" accept="image/*" onChange={handleProfileImageChange}
              style={{ display: "none" }}
            />
          </div>

          {profileImage && (
            <button
              onClick={handleRemoveProfileImage}
              style={{background: "none", border: "none", color: COLORS.red, fontSize: "12px", fontWeight: "800", cursor: "pointer", marginBottom: "12px", textDecoration: "underline"
              }}
            >
              ลบรูปโปรไฟล์
            </button>
          )}

          <h2 style={{ margin: "0", fontSize: "24px", fontWeight: "900" }}>{fullName}</h2>
          <div style={{ color: COLORS.gray, fontSize: "13px", marginTop: "4px" }}>{username ? `@${username}` : "Customer"}</div>
        </div>

        {/* SECTION 1: EDIT PROFILE NAME & PHONE */}
        {isEditing ? (
          <form onSubmit={handleSaveProfileData} style={{ marginTop: "25px" }}>
            <div style={{ marginBottom: "15px", textAlign: "left" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "5px" }}>ชื่อ-นามสกุล</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontFamily: "inherit" }}
                required
              />
            </div>
            <div style={{ marginBottom: "20px", textAlign: "left" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "5px" }}>เบอร์โทรศัพท์</label>
              <input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]{10}"
                maxLength={10}
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="08XXXXXXXX"
                style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontFamily: "inherit" }}
                required
              />
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="submit"
                style={{ flex: 1, padding: "11px", background: COLORS.orange, color: COLORS.white, border: "none", borderRadius: "10px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
              >
                บันทึกข้อมูลส่วนตัว
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                style={{ flex: 1, padding: "11px", background: COLORS.lightGray, color: COLORS.navy, border: "none", borderRadius: "10px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
              >
                ยกเลิก
              </button>
            </div>
          </form>
        ) : (
          <>
            <div style={{ marginTop: "25px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 5px", borderBottom: `1px solid ${COLORS.border}`, fontSize: "14px" }}>
                <span>ชื่อผู้ใช้</span><strong>{username || fullName}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 5px", borderBottom: `1px solid ${COLORS.border}`, fontSize: "14px" }}>
                <span>เบอร์โทรศัพท์</span><strong>{phone || "ยังไม่ได้ระบุ"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 5px", borderBottom: `1px solid ${COLORS.border}`, fontSize: "14px" }}>
                <span>สั่งซื้อทั้งหมด</span><strong>{myOrders.length} รายการ</strong>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "20px" }}>
              <button
                onClick={() => {
                  setEditName(fullName);
                  setEditPhone(phone);
                  setIsEditing(true);
                }}
                style={{ width: "100%", padding: "12px", background: COLORS.orange, color: COLORS.white, border: "none", borderRadius: "12px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
              >
                แก้ไขข้อมูลส่วนตัว
              </button>
              <button
                onClick={() => {
                  fetchMyIssueReports();
                  setIsViewReportsModalOpen(true);
                }}
                style={{ width: "100%", padding: "12px", background: COLORS.white, color: COLORS.navy, border: `1px solid ${COLORS.border}`, borderRadius: "12px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
              >
                ดูปัญหาที่แจ้งไว้{Array.isArray(myIssueReports) && myIssueReports.length > 0 ? ` (${myIssueReports.length})` : ""}
              </button>
            </div>
          </>
        )}

        {/* LOGOUT BUTTON */}
        <div style={{ marginTop: "12px" }}>
          <button
            onClick={() => {
              customAlert("สำเร็จ", "ออกจากระบบสำเร็จ", "success");
              setTimeout(() => { if (onLogout) onLogout(); }, 1000);
            }}
            style={{ width: "100%", padding: "12px", background: "#FFF0ED", color: COLORS.red, border: `1px solid ${COLORS.red}40`, borderRadius: "12px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
          >
            ออกจากระบบ
          </button>
        </div>
      </div>

      <div style={{ width: "100%", margin: "0 auto" }}>
        <h3 style={{ fontSize: "20px", fontWeight: "900", marginBottom: "15px" }}> ประวัติการสั่งซื้อและรีวิวของฉัน</h3>
        {myOrders.length === 0 ? (
          <div style={{ ...cardStyle, padding: "55px 20px", width: "100%", textAlign: "center", color: COLORS.gray }}>
            <div style={{ fontSize: "45px", marginBottom: "10px" }}><OrderIcon/> </div> ยังไม่มีประวัติการสั่งซื้อ 
          </div>
        ) : (
          <div style={{ display: "grid", gap: "15px" }}>
            {myOrders.map((order) => {
              const hasReview = order.IsReviewed || order.review || reviewedOrderIds[order.OrderID];
              return (
                <div key={order.OrderID} style={{ ...cardStyle, padding: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                      <span style={{ fontWeight: "900", fontSize: "16px", color: COLORS.navy }}>
                        คิว #{order.QueueNo}
                      </span>
                      <span style={{ fontSize: "13px", color: COLORS.gray, marginLeft: "10px" }}>
                        ({order.StoreName})
                      </span>
                    </div>
                    <span style={{ background: "#FFF0EB", color: COLORS.orange, padding: "4px 12px", borderRadius: "15px", fontSize: "11px", fontWeight: "800" }}>
                      {getOrderStatusLabel(order.Status)}
                    </span>
                  </div>

                  <div style={{ fontSize: "12px", color: COLORS.gray, marginTop: "8px" }}>
                    เวลาสั่งซื้อ: {order.OrderTime || order.order_time || order.CreatedAt || "-"}
                  </div>

                  {order.items && order.items.length > 0 && (
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: `1px dashed ${COLORS.border}` }}>
                      {order.items.map((item, index) => (
                        <div key={item.OrderDetailID || index} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "4px 0", fontSize: "13px" }}>
                          <div>
                            <b>• {item.ProductName}</b> <span style={{ color: COLORS.orange, fontWeight: "700" }}>x{item.Qty}</span>
                            {item.ItemNote && <div style={{ color: COLORS.gray, fontSize: "11px", marginLeft: "10px" }}> {item.ItemNote}</div>}
                          </div>
                          <span>{(Number(item.UnitPrice || 0) * Number(item.Qty || 1)).toFixed(2)} ฿</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {renderRefundNote(order)}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "10px", borderTop: `1px solid ${COLORS.border}` }}>
                    <div>
                      <span style={{ fontSize: "12px", color: COLORS.gray }}>ราคารวม: </span>
                      <strong style={{ fontSize: "16px", color: COLORS.orange }}>{Number(order.TotalAmount || 0).toFixed(2)} ฿</strong>
                    </div>

                    {order.Status === "Awaiting_Top_Up" && (
                      <button
                        onClick={() => setHiddenTopUpOrderId(null)}
                        style={{ padding: "7px 14px", border: "none", borderRadius: "10px", background: COLORS.orange, color: COLORS.white, fontSize: "12px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        โอนส่วนต่าง {Number(order.TopUpAmount || 0).toFixed(2)} ฿
                      </button>
                    )}
                    {order.Status === "Completed" && (
                      <button
                        onClick={() => handleOpenReviewModal(order)}
                        style={{padding: "7px 14px", border: "none", borderRadius: "10px", background: hasReview ? COLORS.yellow : COLORS.orange,
                          color: hasReview ? COLORS.navy : COLORS.white, fontSize: "12px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit"
                        }}
                      >
                        {hasReview ? "ดูรีวิวของฉัน" : "ให้คะแนนรีวิว"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // ORDERS TAB
  const renderOrders = () => (
    <div>
      {renderTabTitle("คำสั่งซื้อของฉัน")}
      {myOrders.length === 0 ? (
        <div style={{ ...cardStyle, padding: "55px 20px", width: "100%", textAlign: "center", color: COLORS.gray }}>
          <div style={{ fontSize: "45px", marginBottom: "10px" }}><CartIcon /></div>
          ยังไม่มีคำสั่งซื้อ
        </div>
      ) : (
        <div style={{ display: "grid", gap: "15px" }}>
          {myOrders.map(order => {
            const hasReview = order.IsReviewed || order.review || reviewedOrderIds[order.OrderID];
            const reportedIssue = Array.isArray(myIssueReports)
              ? myIssueReports.find((rep) => Number(rep.order_id || rep.OrderID) === Number(order.OrderID))
              : null;
            const hasReportedIssue = !!reportedIssue || Boolean(order.IsReported);
           const canNotifyLatePickup = ["pending", "cooking", "ready"].includes(String(order.Status || "").trim().toLowerCase());
            const handleReportClick = () => {
              if (hasReportedIssue) {
                if (typeof fetchMyIssueReports === "function") fetchMyIssueReports();
                if (typeof setIsViewReportsModalOpen === "function") setIsViewReportsModalOpen(true);
              } else {
                handleOpenReportModal(order);
              }
            };
            return (
              <div key={order.OrderID} style={{ ...cardStyle, padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                  <div style={{
                    background: order.Status === "Completed" ? "#FFEBD9" : "#FF8A00",
                    color: order.Status === "Completed" ? "#D96000" : "#1E293B",
                    padding: "12px 20px", borderRadius: "14px", textAlign: "left",
                    boxShadow: order.Status === "Completed" ? "none" : "0 4px 12px rgba(255, 138, 0, 0.25)",
                    width: "100%", boxSizing: "border-box", marginBottom: "14px", transition: "all 0.3s ease"
                  }}>
                    <div
                    style={{display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px",
                    }}
                  >
                    {/* ฝั่งซ้าย: ข้อมูลคิว */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{fontSize: "10px", opacity: 0.85, textTransform: "uppercase",
                        }}
                      >
                        คิวของคุณ
                      </div>

                      <div style={{ fontSize: "20px", fontWeight: "900" }}>
                        #{order.QueueNo}
                      </div>

                      <div
                        style={{ fontSize: "13px", fontWeight: "700", marginTop: "2px",
                        }}
                      >
                        {order.StoreName}
                      </div>
                    </div>

                    {/* ฝั่งขวา: เวลารับอาหาร */}
                    <div
                      style={{flex: "0 1 180px", minWidth: 0, textAlign: "right", overflowWrap: "anywhere",
                      }}
                    >
                      <div
                        style={{fontSize: "10px", opacity: 0.85, marginBottom: "5px",
                        }}
                      >
                        เวลารับอาหาร
                      </div>
                      <div
                        style={{fontSize: "13px", fontWeight: "900",
                        }}
                      >
                        {getOrderPickupRange(order)}
                      </div>
                      {getOrderPickupRange(order) === "กำลังคำนวณเวลา..." && (
                        <div
                          style={{fontSize: "10px", opacity: 0.85, marginTop: "4px", lineHeight: 1.4,
                          }}
                        >
                          เวลาโดยประมาณ
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", margin: "12px 0 16px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: COLORS.gray }}>
                    {(order.OrderTime || order.CreatedAt || order.order_time) && (
                      <div>เวลาที่สั่ง: {order.OrderTime || order.order_time || order.CreatedAt}</div>
                    )}
                    <div>
                      เวลารับอาหาร: {isImmediatePickup(order.PickupTime || order.pickup_time, order.OrderTime || order.CreatedAt) ? 'รับทันที' : (order.PickupTime || order.pickup_time)}
                    </div>
                  </div>
                  <span style={{ background: "#FFF0EB", color: COLORS.orange, padding: "7px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: "800", whiteSpace: "nowrap" }}>
                    {getOrderStatusLabel(order.Status)}
                  </span>
                </div>

                {order.items && order.items.length > 0 && (
                  <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${COLORS.border}` }}>
                    {order.items.map((item, index) => (
                      <div key={item.OrderDetailID || index} style={{ display: "flex", justifyContent: "space-between", gap: "15px", padding: "6px 0", fontSize: "13px" }}>
                        <div>
                          <b>{item.ProductName}</b> x{item.Qty}
                          {item.ItemNote && <div style={{ color: COLORS.gray, fontSize: "12px", marginTop: "2px" }}>📝 {item.ItemNote}</div>}
                        </div>
                        <span>{(Number(item.UnitPrice || 0) * Number(item.Qty || 1)).toFixed(2)} ฿</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${COLORS.border}`, fontWeight: "900" }}>
                  <span>ยอดรวม</span>
                  <span style={{ color: COLORS.orange, fontSize: "18px" }}>{Number(order.TotalAmount || 0).toFixed(2)} ฿</span>
                </div>
                {renderRefundNote(order)}

                {/* แจ้งร้านว่าจะมารับช้า */}
                {canNotifyLatePickup && (
                  <div
                    style={{marginTop: "14px", padding: "12px", border: `1px solid ${COLORS.border}`, borderRadius: "12px", background: "#FFF9F5",
                    }}
                  >
                    <div style={{ fontWeight: "800", color: COLORS.navy, fontSize: "14px" }}>
                      แจ้งร้านว่าจะมารับช้า
                    </div>

                    {(() => {
                      const orderId = order.OrderID;
                      const lateInfo = latePickupOrder[orderId] || {
                        count: 0,
                        arrivalTime: "",
                      };
                      const selectedMinutes = latePickupMinutes[orderId] || "15";
                      return (
                        <>
                          <div style={{ fontSize: "12px", color: COLORS.gray, marginTop: "5px" }}>
                            แจ้งได้ไม่เกิน 3 ครั้งต่อออเดอร์ · แจ้งใหม่จะใช้แทนเวลาเดิม (นับจากเวลานัดรับ)
                          </div>
                          {lateInfo.arrivalTime && (
                            <div style={{ marginTop: "8px", fontSize: "13px", color: COLORS.orange, fontWeight: "700" }}>
                              เวลามาถึงล่าสุด: {lateInfo.arrivalTime} น.
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                            {[
                              { value: "15", label: "15 นาที" },
                              { value: "30", label: "30 นาที" },
                              { value: "60", label: "1 ชั่วโมง" },
                              { value: "120", label: "2 ชั่วโมง" },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                disabled={lateInfo.count >= 3}
                                onClick={() =>
                                  setLatePickupMinutes((prev) => ({
                                    ...prev,
                                    [orderId]: option.value,
                                  }))
                                }
                                style={{padding: "10px 14px", minHeight: "40px", borderRadius: "10px", border: `1px solid ${
                                    selectedMinutes === option.value ? COLORS.orange : COLORS.border
                                  }`, background: selectedMinutes === option.value ? "#FFF0EB" : "#FFFFFF",
                                  color: COLORS.navy, fontSize: "13px", cursor: lateInfo.count >= 3 ? "not-allowed" : "pointer",
                                  opacity: lateInfo.count >= 3 ? 0.5 : 1,
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          {lateInfo.count < 3 && (
                            <div style={{ marginTop: "8px", fontSize: "13px", color: COLORS.navy, fontWeight: "700" }}>
                              ถ้ายืนยัน: จะมาถึงประมาณ {previewLateArrival(order, selectedMinutes)} น.
                            </div>
                          )}
                          <button
                            onClick={() => once(`late-${order.OrderID}`, () => handleLatePickup(order, selectedMinutes))}
                            disabled={(latePickupOrder[order.OrderID]?.count || 0) >= 3}
                            style={{width: "100%", marginTop: "12px", padding: "13px 16px", border: "none", borderRadius: "14px",
                              background:(latePickupOrder[order.OrderID]?.count || 0) >= 3 ? "#CBD5E1" : "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                              color: "#FFFFFF", fontSize: "14px", fontWeight: "800", fontFamily: "inherit", letterSpacing: "0.2px",
                              boxShadow:
                                (latePickupOrder[order.OrderID]?.count || 0) >= 3 ? "none" : "0 6px 16px rgba(234, 88, 12, 0.35)",
                              cursor:
                                (latePickupOrder[order.OrderID]?.count || 0) >= 3 ? "not-allowed" : "pointer", transition: "transform 0.15s ease, box-shadow 0.15s ease",
                            }}
                          >
                            {(latePickupOrder[order.OrderID]?.count || 0) >= 3 ? "แจ้งครบแล้ว (3/3)" : (latePickupOrder[order.OrderID]?.count || 0) === 0
                                ? "ยืนยันแจ้งเวลามารับช้า" : `แจ้งเวลาครั้งที่ ${(latePickupOrder[order.OrderID]?.count || 0) + 1}/3`}
                          </button>
                          <div style={{ fontSize: "11px", color: COLORS.orange, marginTop: "6px" }}>
                            แจ้งแล้ว {lateInfo.count}/3 ครั้ง
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {order.Status === "Cancelled" && (
                  <div style={{ marginTop: "15px" }}>
                    <div style={{ padding: "12px 14px", borderRadius: "12px", background: "#FFF0ED", border: `1px solid ${COLORS.red}40`, fontSize: "13px", lineHeight: 1.55 }}>
                      <div style={{ color: COLORS.red, fontWeight: "800", marginBottom: "2px" }}>ออเดอร์นี้ถูกยกเลิก</div>
                      <div style={{ color: COLORS.navy, overflowWrap: "anywhere" }}>
                        เหตุผล: {String(order.CancelReason || "").trim() || "ร้านไม่ได้ระบุเหตุผล"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleReportClick}
                      style={{width: "100%", marginTop: "10px", padding: "12px", minHeight: "44px", border: hasReportedIssue ? `1px solid ${COLORS.navy}` : `1px solid ${COLORS.red}`,
                        borderRadius: "12px", background: hasReportedIssue ? "#F1F5F9" : "#FFF0ED", color: hasReportedIssue ? COLORS.navy : COLORS.red,
                        fontSize: "13px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {hasReportedIssue ? "ดูปัญหาของฉัน" : "ไม่เห็นด้วย/มีปัญหา แจ้งปัญหาออเดอร์นี้"}
                    </button>
                  </div>
                )}

                {order.Status === "Completed" && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "15px", width: "100%" }}>
                    <button
                      onClick={() => handleOpenReviewModal(order)}
                      style={{flex: 1, padding: "11px", border: "none", borderRadius: "12px", background: hasReview ? COLORS.yellow : COLORS.orange,
                        color: hasReview ? COLORS.navy : COLORS.white, fontSize: "13px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit"
                      }}
                    >
                      {hasReview ? "ดูรีวิวของฉัน" : "ให้คะแนนและรีวิว"}
                    </button>

                    <button
                      onClick={handleReportClick}
                      style={{flex: 1, padding: "11px", border: hasReportedIssue ? `1px solid ${COLORS.navy}` : `1px solid ${COLORS.red}`, borderRadius: "12px",
                        background: hasReportedIssue ? "#F1F5F9" : "#FFF0ED", color: hasReportedIssue ? COLORS.navy : COLORS.red, fontSize: "13px",
                        fontWeight: "800", cursor: "pointer", fontFamily: "inherit"
                      }}
                    >
                      {hasReportedIssue ? "ดูปัญหาของฉัน" : "แจ้งปัญหา"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderNotifications = () => (
    <div>
      {renderTabTitle("การแจ้งเตือน")}
      {notifs.length === 0 ? (
        <div style={{ ...cardStyle, padding: "55px 20px", width: "100%", textAlign: "center", color: COLORS.gray }}>
          <div style={{ fontSize: "45px", marginBottom: "10px" }}><NotiIcon/></div>
          ไม่มีการแจ้งเตือน
        </div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {notifs.map((notification, index) => (
            <div key={getNotifKey(notification) || index} style={{ ...cardStyle, padding: "18px", borderLeft: `5px solid ${COLORS.orange}` }}>
              <div style={{ fontWeight: "900", marginBottom: "3px" }}><NotiIcon /> Only Foods</div>
              <div style={{ color: COLORS.gray, fontSize: "13px" }}>{notification.Message}</div>
              {notification.CreatedAt && <div style={{ color: "#aaa", fontSize: "11px", marginTop: "8px" }}>{notification.CreatedAt}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // CART SLIDE OVER MODAL
  const renderCart = () => {
    if (!isCartOpen) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={() => setIsCartOpen(false)}>
        <div onClick={e => e.stopPropagation()} style={{ width: "min(480px, 100%)", height: "100%", background: COLORS.white, overflowY: "auto", padding: "22px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "900" }}>ตะกร้าของฉัน</h2>
              {cart.length > 0 && <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "4px" }}></div>}
            </div>
            <button className="cart-tap" onClick={() => setIsCartOpen(false)} aria-label="ปิดตะกร้า" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 0, flexShrink: 0, width: "40px", height: "40px", border: "none", borderRadius: "50%", background: COLORS.lightGray, color: COLORS.navy, cursor: "pointer" }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
            </button>
          </div>

          {cart.length === 0 ? (
            <div style={{ ...cardStyle, padding: "55px 20px", width: "100%", textAlign: "center", color: COLORS.gray }}>
              <div style={{ fontSize: "45px", marginBottom: "10px" }}><CartIcon/> </div> ยังไม่มีสินค้าในตะกร้า 
            </div>
          ) : (
            <>
              <div style={{ marginTop: "25px" }}>
                {cart.map((item, index) => (
                  <div key={item.cartItemId || `${item.ProductId}-${index}`} style={{ padding: "15px", marginBottom: "14px", borderRadius: "17px", background: "#FFF9F5", border: `1px solid ${COLORS.border}` }}>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: COLORS.orange, marginBottom: "10px" }}>รายการที่ {index + 1}</div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <img src={item.img || item.ImageUrl || "https://via.placeholder.com/80?text=Food"} alt="" style={{ width: "70px", height: "70px", objectFit: "cover", borderRadius: "13px", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: "900", fontSize: "15px" }}>{item.ProductName}</div>
                        <div style={{ color: COLORS.orange, fontWeight: "900", marginTop: "3px" }}>
                          {Number(item.UnitPrice).toFixed(2)} ฿
                          {(item.qty || 1) > 1 && (
                            <span style={{ color: COLORS.gray, fontWeight: "700", fontSize: "12px" }}>
                              {" "}× {item.qty} = {(Number(item.UnitPrice) * item.qty).toFixed(2)} ฿
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                          <button className="cart-tap" onClick={() => decreaseQty(index)} aria-label="ลดจำนวน" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 0, flexShrink: 0, width: "36px", height: "36px", border: "none", borderRadius: "50%", background: "#FFE9E3", color: COLORS.orange, cursor: "pointer" }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M3 8h10"/></svg>
                          </button>
                          <b style={{ minWidth: "20px", textAlign: "center", lineHeight: 1 }}>{item.qty || 1}</b>
                          <button className="cart-tap" onClick={() => increaseQty(index)} aria-label="เพิ่มจำนวน" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 0, flexShrink: 0, width: "36px", height: "36px", border: "none", borderRadius: "50%", background: COLORS.orange, color: COLORS.white, cursor: "pointer" }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M3 8h10M8 3v10"/></svg>
                          </button>
                        </div>
                        {(item.qty || 1) > 1 && (
                          <button
                            type="button"
                            onClick={() => splitOneFromCart(index)}
                            style={{ marginTop: "8px", padding: "7px 12px", borderRadius: "10px", border: `1px dashed ${COLORS.orange}`, background: "#FFFFFF", color: COLORS.orange, fontSize: "12px", fontWeight: "800", fontFamily: "inherit", cursor: "pointer" }}
                          >
                            แยก 1 จานไปใส่รายละเอียดอื่น
                          </button>
                        )}
                      </div>
                      <button className="cart-tap" onClick={() => removeFromCart(index)} aria-label="ลบรายการ" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 0, flexShrink: 0, alignSelf: "flex-start", width: "36px", height: "36px", border: "none", background: "none", color: COLORS.navy, cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 3l10 10M13 3L3 13"/></svg>
                      </button>
                    </div>
                    <div style={{ marginTop: "13px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "800", color: COLORS.navy, marginBottom: "5px" }}>หมายเหตุสำหรับรายการที่ {index + 1}{(item.qty || 1) > 1 ? ` (ใช้กับทั้ง ${item.qty} จาน)` : ""}</label>
                      <textarea value={item.item_note || ""} onChange={e => updateItemNote(index, e.target.value)} placeholder="เช่น ไม่เผ็ด, ไม่ใส่ผัก, หวานน้อย" rows={2} maxLength={255} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, outline: "none", resize: "vertical", fontFamily: "inherit", fontSize: "12px", background: COLORS.white }} />
                      <div style={{ textAlign: "right", fontSize: "10px", color: "#aaa", marginTop: "2px" }}>{(item.item_note || "").length}/255</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: `2px solid ${COLORS.border}`, paddingTop: "20px" }}>
                <div style={{ marginBottom: "15px" }}>
                <label
                  style={{display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px",
                  }}
                >
                  เวลารับอาหาร
                </label>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <select
                    value={pickupHour}
                    onChange={handlePickupHourChange}
                    aria-label="ชั่วโมงที่รับอาหาร"
                    style={{ ...pickupSelectStyle, flex: 1 }}
                  >
                    <option value="">ชั่วโมง</option>
                    {pickupHourOptions.map((h) => (
                      <option key={h} value={pad2(h)}>
                        {pad2(h)}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontWeight: "800" }}>:</span>

                  <select
                    value={pickupMinute}
                    onChange={(e) => setPickupMinute(e.target.value)}
                    disabled={pickupHour === ""}
                    aria-label="นาทีที่รับอาหาร"
                    style={{ ...pickupSelectStyle, flex: 1, opacity: pickupHour === "" ? 0.5 : 1 }}
                  >
                    <option value="">นาที</option>
                    {Array.from({ length: 60 }, (_, m) => m).map((m) => (
                      <option key={m} value={pad2(m)} disabled={isPickupMinuteDisabled(pickupHour, m, pickupRange)}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>

                  {(pickupHour !== "" || pickupMinute !== "") && (
                    <button
                      type="button"
                      onClick={() => setPickupTime("")}
                      style={{flexShrink: 0, padding: "11px 14px", borderRadius: "10px", border: "none", background: "#FFEDD5",
                        color: "#C2410C", fontWeight: "800", fontFamily: "inherit", cursor: "pointer",
                      }}
                    >
                      รับทันที
                    </button>
                  )}
                </div>

                <div
                  style={{fontSize: "10px", color: COLORS.gray, marginTop: "5px",
                  }}
                >
                  ไม่เลือกเวลา = รับทันที ครัวจะทำตามลำดับคิว
                </div>

                {pickupTime ? (
                  <div
                    style={{marginTop: "8px", padding: "10px 12px", borderRadius: "10px", background: "#FFFFFF", color: "#F97316", fontSize: "12px", fontWeight: "700", border: "1px solid #FED7AA",
                    }}
                  >
                    เวลารับตามที่เลือก: {formatScheduledPickupRange(pickupTime, pickupWindowMinutes)}
                    {isPickupTooEarly && (
                      <div style={{ marginTop: "4px", fontSize: "11px", fontWeight: "600", color: "#B45309" }}>
                        ⚠ ครัวอาจทำไม่ทัน ประมาณเสร็จ {estimatedReadyTime} น. แนะนำเลือกตั้งแต่ {estimatedReadyTime} น.
                      </div>
                    )}
                  </div>
                ) : pickupHour !== "" ? (
                  <div style={{ marginTop: "8px", fontSize: "11px", color: COLORS.gray }}>
                    เลือกนาทีให้ครบเพื่อนัดเวลา หรือกด "รับทันที"
                  </div>
                ) : cart.length > 0 ? (
                  <div
                    style={{marginTop: "8px", padding: "10px 12px", borderRadius: "10px", background: "#FFFFFF", color: "#F97316", fontSize: "12px",  fontWeight: "700", border: "1px solid #FED7AA",
                    }}
                  >
                    เวลารับอาหารโดยประมาณ {getCustomerPickupRange()}

                    <div
                      style={{marginTop: "3px", fontSize: "10px", fontWeight: "400", color: "#9A3412",
                      }}
                    >
                      เป็นช่วงเวลาโดยประมาณ อาจเปลี่ยนตามจำนวนออเดอร์ที่ครัวกำลังทำ
                    </div>
                  </div>
                ) : null}
              </div>
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>รายละเอียดเพิ่มเติมของออเดอร์</label>
                  <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติมสำหรับทั้งออเดอร์" rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit", resize: "vertical" }} />
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}> วิธีชำระเงิน</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: "100%", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit" }}>
                    <option value="PromptPay">สแกน QR Code (PromptPay)</option>
                    <option value="TrueMoney">TrueMoney Wallet</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
                  <span style={{ fontWeight: "800" }}>รวมทั้งหมด</span>
                  <span style={{ color: COLORS.orange, fontSize: "24px", fontWeight: "900" }}>{totalAmount.toFixed(2)} ฿</span>
                </div>

                <button 
                  onClick={handleProceedToPayment} 
                  disabled={!isFoodCourtOpen || cartStore.IsSuspended || !cartStore.IsOpen}
                  style={{
                    width: "100%", padding: "15px", marginTop: "15px", border: "none", borderRadius: "15px", 
                    background: (!isFoodCourtOpen || cartStore.IsSuspended || !cartStore.IsOpen) ? "#CCCCCC" : COLORS.orange, 
                    color: COLORS.white, fontSize: "16px", fontWeight: "900", cursor: (!isFoodCourtOpen || cartStore.IsSuspended || !cartStore.IsOpen) ? "not-allowed" : "pointer", fontFamily: "inherit" 
                  }}
                >
                  {cartStore.IsSuspended ? "ร้านค้านี้ถูกระงับการจำหน่าย" : !cartStore.IsOpen ? "ร้านค้านี้ปิดให้บริการชั่วคราว" : !isFoodCourtOpen ? "ศูนย์อาหารปิดให้บริการชั่วคราว" : "ชำระเงิน"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const pickupRange = getPickupRange({
    nowTime: formatBangkokTime(new Date()),
    openTime: foodCourtOpenTime,
    closeTime: foodCourtCloseTime,
  });
  const pickupHourOptions = getPickupHours(pickupRange);

  const pickupSelectStyle = {
    padding: "11px",
    borderRadius: "10px",
    border: `1px solid ${COLORS.border}`,
    fontFamily: "inherit",
  };

  const handlePickupHourChange = (e) => {
    const hour = e.target.value;
    setPickupHour(hour);
    if (hour === "" || (pickupMinute !== "" && isPickupMinuteDisabled(hour, pickupMinute, pickupRange))) {
      setPickupMinute("");
    }
  };

  const cartDishCount = countCartDishes(cart);
  const cartSchedule = cartDishCount ? buildQueueSchedule(queueEstimateOrders, cartDishCount) : null;
  const estimatedReadyTime = cartSchedule ? formatBangkokTime(new Date(Math.ceil(cartSchedule.newOrder.end.getTime() / 60000) * 60000)) : "";
  const isPickupTooEarly =
    Boolean(pickupTime && estimatedReadyTime) && toMinutes(pickupTime) < toMinutes(estimatedReadyTime);
  const pickupWindowMinutes = scheduledWindowMinutes(
    cartDishCount || 1,
    cartSchedule ? cartSchedule.buffer : kitchenBuffer(cartDishCount || 1)
  );

  return (
    <div className="customer-view" style={pageStyle}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
          .customer-view, .customer-view * {font-family: 'Sarabun', sans-serif !important;}
          .customer-view button { -webkit-appearance: none; appearance: none; box-sizing: border-box; font-family: inherit; }
          /* จอสัมผัส: ปุ่มกดต้องมีพื้นที่ขั้นต่ำ 44px */
          @media (pointer: coarse) {
            .cart-tap { min-width: 44px !important; min-height: 44px !important; width: 44px !important; height: 44px !important; }
            .customer-review-btn { min-height: 34px !important; }
          }
          @media (max-width: 380px) {
            .cart-tap { min-width: 40px !important; min-height: 40px !important; width: 40px !important; height: 40px !important; }
          }
          @keyframes sparkleTwinkle { 0% {transform: scale(0.8) rotate(0deg); opacity: 0.4;} 50% {transform: scale(1.25) rotate(90deg); opacity: 1;
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.9));} 100% {transform: scale(0.8) rotate(180deg); opacity: 0.4;}}
          .animated-sparkle {animation: sparkleTwinkle 2s infinite ease-in-out; display: inline-block;}
          @media (max-width: 600px) {
            /* ลดขนาดในมือถือ */
            .customer-store-grid,
            .customer-product-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              gap: 10px !important;
            }

            .customer-store-grid > div,
            .customer-product-grid > div {
              padding: 10px !important;
              border-radius: 14px !important;
            }

            .customer-store-grid img {
              height: 100px !important;
              border-radius: 10px !important;
              margin-bottom: 8px !important;
            }

            .customer-store-grid button {
              font-family: 'Sarabun', sans-serif !important;
              font-size: 11px !important;
              font-weight: 600 !important;
              line-height: 1.2 !important;
              box-sizing: border-box !important;
              max-width: 100% !important;
              min-height: 26px !important;
              padding: 4px 10px !important;
              white-space: nowrap !important;
            }

            .customer-store-grid .customer-select-store {
              font-size: 13px !important;
              font-weight: 800 !important;
              line-height: 1.2 !important;
            }

            /* หน้าเลือกเมนู: ปุ่มกลับ + ชื่อร้านอยู่บรรทัดเดียว */
            .customer-products-head {
              gap: 8px !important;
            }
            .customer-back-btn {
              padding: 7px 12px !important;
              font-size: 12px !important;
            }
            .customer-products-title {
              font-size: 17px !important;
              line-height: 1.25 !important;
            }
            .customer-products-title-prefix {
              display: none;
            }

            /* ปุ่ม/ช่องกรอกบนมือถือ */
            .customer-view button,
            .customer-view select {
              touch-action: manipulation;
            }

            .customer-view input,
            .customer-view select,
            .customer-view textarea {
              font-size: 16px !important;
            }

            .customer-store-grid {
              font-size: 12px;
            }

            .customer-store-grid span {
              font-size: 10px !important;
              line-height: 1.2 !important;
            }

            .customer-product-grid img {
              height: 115px !important;
              border-radius: 10px 10px 0 0 !important;
            }
            .customer-store-grid > div > div:nth-child(2) {
            font-size: 14px !important;
            }

            .customer-product-grid > div > div > div:first-child {
              font-size: 14px !important;
              line-height: 1.3 !important;
            }

            .customer-product-grid > div > div > div:nth-child(2) {
              font-size: 11px !important;
              line-height: 1.4 !important;
            }
            
            .customer-view .hero-banner {
              padding: 18px !important;
              min-height: 135px !important;
            }

            /* ส่วนหัว */
            .customer-header-brand {
              flex: 1 0 100% !important;
            }

            /* แท็บอื่นที่ไม่ใช่เมนู โปรไฟล์อยู่ข้างหัวข้อ */
            .customer-header-brand.customer-header-brand-inline {
              flex: 1 1 0 !important;
              min-width: 0 !important;
            }

            .customer-header-search {
              min-width: 0 !important;
              flex: 1 1 0 !important;
            }

            .customer-profile-chip {
              flex: 0 0 auto !important;
              margin-left: auto !important;
            }

            .customer-review-btn {
              flex: 1 1 100% !important;
            }
          }

          @media (max-width: 480px) {
            /* ชิปโปรไฟล์ในแถบส่วนหัว (หน้าเมนู ใช้แถวร่วมกับช่องค้นหา): แสดงเฉพาะรูป */
            header .customer-profile-name {
              display: none !important;
            }

            header .customer-profile-chip {
              padding: 5px !important;
            }

            /* ชิปโปรไฟล์ข้างหัวข้อแท็บ (คำสั่งซื้อ/แจ้งเตือน/โปรไฟล์): พื้นที่เหลือพอ จึงแสดงชื่อด้วย ถ้าชื่อยาวตัดด้วย ... */
            .customer-profile-name > div {
              max-width: 80px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          }
        `}
      </style>
      <div style={containerStyle}>
        {/* HEADER BAR */}
        <header style={headerStyle}>
          <div className={activeTab === "menu" ? "customer-header-brand" : "customer-header-brand customer-header-brand-inline"} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={logoStyle} onClick={() => handleSelectTab("menu")}>
              Only<span style={{ color: COLORS.orange }}>Foods</span>
            </div>
            {activeTab === "menu" && (
              <div
                style={{display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: "800",
                  background: isFoodCourtOpen ? "#E8F8F3" : "#FFF0ED", color: isFoodCourtOpen ? COLORS.green : COLORS.red,
                  border: `1px solid ${isFoodCourtOpen ? COLORS.green + "40" : COLORS.red + "40"}`
                }}
              >
                <span
                  style={{width: "8px", height: "8px", borderRadius: "50%", background: isFoodCourtOpen ? COLORS.green : COLORS.red, display: "inline-block"
                  }}
                />
                {isFoodCourtOpen ? "ศูนย์อาหารเปิดให้บริการ" : "ศูนย์อาหารปิดให้บริการ"}
              </div>
            )}
          </div>

          {activeTab === "menu" && (
            <input
              type="text"
              className="customer-header-search"
              placeholder={viewMode === "stores" ? " ค้นหาร้านอาหาร..." : " ค้นหาเมนูอาหาร..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={searchStyle}
            />
          )}

          {activeTab === "menu" && renderProfileChip()}
        </header>

        {/* ACTIVE TAB CONTENT */}
        {activeTab === "menu" && renderMenu()}
        {activeTab === "orders" && renderOrders()}
        {activeTab === "notifs" && renderNotifications()}
        {activeTab === "profile" && renderProfile()}
      </div>

      {/* FLOATING CART BUTTON */}
      <button
        onClick={() => setIsCartOpen(true)}
        style={{display: (activeTab === "notifs" || activeTab === "profile") ? "none" : "flex",
          alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 0, boxSizing: "border-box",
          position: "fixed", right: "25px", bottom: "90px", width: "62px", height: "62px",
          border: "none", borderRadius: "50%", background: COLORS.orange, color: COLORS.white,
          fontSize: "26px", cursor: "pointer", zIndex: 500, boxShadow: "0 8px 25px rgba(255,114,76,0.35)"
        }}
      >
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "28px", height: "28px" }}>
          <CartIconPlus/>
        </span>
        {cartCount > 0 && (
          <span style={{
            position: "absolute", top: "-3px", right: "-3px", width: "23px", height: "23px",
            borderRadius: "50%", background: COLORS.navy, color: COLORS.white, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900"
          }}>
            {cartCount}
          </span>
        )}
      </button>

      {/* BOTTOM NAVIGATION BAR */}
      <div style={{position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)",
        background: COLORS.navy, borderRadius: "35px", padding: "7px", display: "flex",
        alignItems: "center", gap: "4px", zIndex: 600, boxShadow: "0 10px 35px rgba(42,44,65,0.25)",
        maxWidth: "calc(100% - 30px)", overflowX: "auto"
      }}>
        <button onClick={() => handleSelectTab("menu")} style={{ border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "menu" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "menu" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span className="nav-text"><HomeIcon/></span>
        </button>
        <button onClick={() => handleSelectTab("orders")} style={{ border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "orders" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "orders" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span className="nav-text"><OrderIcon/></span>
        </button>
        <button onClick={() => handleSelectTab("notifs")} style={{ position: "relative", border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "notifs" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "notifs" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          <NotiIcon/>
          {unreadNotifsCount > 0 && (
            <span style={{ position: "absolute", top: "2px", right: "3px", minWidth: "17px", height: "17px", borderRadius: "50%", background: COLORS.red, color: COLORS.white, fontSize: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", padding: "0 3px", boxSizing: "border-box" }}>
              {unreadNotifsCount}
            </span>
          )}
        </button>
        <button onClick={() => handleSelectTab("profile")} style={{ border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "profile" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "profile" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span className="nav-text"><UserIcon/></span>
        </button>
      </div>

      {/* RENDER ALL MODALS */}
      {renderCart()}
      <PaymentModal
        isPaymentModalOpen={isPaymentModalOpen}
        setIsPaymentModalOpen={setIsPaymentModalOpen}
        totalAmount={totalAmount}
        paymentMethod={paymentMethod}
        handleSlipChange={handleSlipChange}
        slipPreview={slipPreview}
        submitOrder={submitOrder}
        isSubmittingOrder={isSubmittingOrder}
      />
      <ReviewModal
        reviewOrder={reviewOrder}
        setReviewOrder={setReviewOrder}
        isReadOnlyReview={isReadOnlyReview}
        rating={rating}
        setRating={setRating}
        setHoverRating={setHoverRating}
        hoverRating={hoverRating}
        reviewComment={reviewComment}
        setReviewComment={setReviewComment}
        reviewImagePreview={reviewImagePreview}
        handleReviewImageChange={handleReviewImageChange}
        submitReview={() => once("review", submitReview)}
      />
      <OutOfStockModal
        outOfStockOrder={outOfStockOrder}
        products={products}
        timeLeft={timeLeft}
        isChangeMenuMode={isChangeMenuMode}
        setIsChangeMenuMode={setIsChangeMenuMode}
        handleCancelOutOfStockOrder={(reason) => customAlert(
          "ยืนยันยกเลิกออเดอร์?", "ยกเลิกแล้วย้อนกลับไม่ได้ คุณจะได้รับเงินคืนที่ร้าน (หรือเลือกให้ร้านโอนคืนได้)", "warning",
          () => once("cancel-oos", () => handleCancelOutOfStockOrder(reason)))}
        setNewSelectedProduct={setNewSelectedProduct}
        newSelectedProduct={newSelectedProduct}
        handleChangeOrderMenu={handleChangeOrderMenu}
      />
      {payoutOrder && (
        <RefundPayoutModal
          order={payoutOrder}
          refunds={(refundsByOrder[payoutOrder.OrderID] || []).filter((r) => r.RefundStatus === "PENDING")}
          onClose={() => setPayoutOrder(null)}
          onSave={savePayout}
          saving={payoutSaving}
          error={payoutError}
        />
      )}
      <TopUpModal
        topUpOrder={topUpOrder}
        outOfStockOrder={outOfStockOrder}
        hiddenTopUpOrderId={hiddenTopUpOrderId}
        topUpSlip={topUpSlip}
        handleTopUpSlipChange={handleTopUpSlipChange}
        submitTopUpSlip={submitTopUpSlip}
        isSubmittingTopUp={isSubmittingTopUp}
        cancelTopUpOrder={() => customAlert(
          "ยืนยันยกเลิกออเดอร์?", "ยกเลิกแล้วย้อนกลับไม่ได้ คุณจะได้รับเงินค่าอาหารคืนที่ร้าน", "warning",
          () => once("cancel-topup", cancelTopUpOrder))}
        setHiddenTopUpOrderId={setHiddenTopUpOrderId}
      />
      <StoreReviewsModal
        selectedStoreForReviews={selectedStoreForReviews}
        setSelectedStoreForReviews={setSelectedStoreForReviews}
        isLoadingReviews={isLoadingReviews}
        storeReviewsList={storeReviewsList}
      />
      <ReportModal
        isReportModalOpen={isReportModalOpen}
        setIsReportModalOpen={setIsReportModalOpen}
        selectedOrderForReport={selectedOrderForReport}
        issueType={issueType}
        setIssueType={setIssueType}
        issueDescription={issueDescription}
        setIssueDescription={setIssueDescription}
        handleSubmitReport={handleSubmitReport}
        isSubmittingReport={isSubmittingReport}
      />
      <ViewReportsModal
        isViewReportsModalOpen={isViewReportsModalOpen}
        setIsViewReportsModalOpen={setIsViewReportsModalOpen}
        myIssueReports={myIssueReports}
      />
      <CustomAlert
        alertData={alertData}
        setAlertData={setAlertData}
      />
      <NotifToasts
        toasts={toasts}
        setToasts={setToasts}
        handleSelectTab={handleSelectTab}
      />
      {isCropModalOpen && cropImage && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              background: COLORS.white,
              borderRadius: "20px",
              padding: "20px",
              width: "100%",
              maxWidth: "500px",
            }}
          >
            <h3 style={{ margin: "0 0 15px", textAlign: "center", fontWeight: "900" }}>
              ครอปรูปโปรไฟล์
            </h3>

            <div
              style={{position: "relative", width: "100%", height: "350px", background: "#222", borderRadius: "15px", overflow: "hidden",
              }}
            >
              <Cropper
                image={cropImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onCropComplete={(croppedArea, croppedAreaPixels) => {
                  setCroppedAreaPixels(croppedAreaPixels);
                }}
                onZoomChange={setZoom}
              />
            </div>

            <div style={{ marginTop: "15px" }}>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "5px" }}>
                ซูมรูป
              </label>

              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
              <button
                type="button"
                onClick={() => {
                  setIsCropModalOpen(false);
                  setCropImage(null);
                }}
                style={{flex: 1, padding: "11px", background: COLORS.lightGray, color: COLORS.navy, border: "none", borderRadius: "10px", fontWeight: "800", cursor: "pointer",
                }}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={createCroppedImage}
                style={{flex: 1, padding: "11px", background: COLORS.orange, color: COLORS.white, border: "none", borderRadius: "10px", fontWeight: "800", cursor: "pointer",
                }}
              >
                ใช้รูปนี้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}