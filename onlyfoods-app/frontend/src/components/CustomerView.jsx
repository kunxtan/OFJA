import { useEffect, useMemo, useState } from "react";
import Cropper from "react-easy-crop";

export default function CustomerView({ user, apiBase, onLogout }) {

  // USER & PROFILE STATE
  const userId = user?.UserId || user?.id;
  const [fullName, setFullName] = useState(user?.FullName || user?.name || "Customer");
  const [phone, setPhone] = useState(user?.Phone || "");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(fullName);
  const [editPhone, setEditPhone] = useState(phone);

  // MULTIPLE CARDS STATE
  const [cards, setCards] = useState([]); //
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [editCardHolderName, setEditCardHolderName] = useState("");
  const [editCardNumber, setEditCardNumber] = useState("");
  const [editCardExpiry, setEditCardExpiry] = useState("");

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

  // OUT OF STOCK & CHANGE ORDER STATE
  const [outOfStockOrder, setOutOfStockOrder] = useState(null);
  const [isChangeMenuMode, setIsChangeMenuMode] = useState(false);
  const [newSelectedProduct, setNewSelectedProduct] = useState(null);
  const [timeLeft, setTimeLeft] = useState(1800);

  // NAVIGATION & VIEWS
  const [activeTab, setActiveTab] = useState("menu");
  const [search, setSearch] = useState("");
  const [selectedStore, setSelectedStore] = useState(null);
  const [viewMode, setViewMode] = useState("stores");

  // CART & ORDER FORM STATE
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pickupTime, setPickupTime] = useState("");
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

  // ICONS
  const CameraIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/></svg>);
  const UserIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
  const BigUserIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
  const NotiIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>);
  const HomeIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>);
  const OrderIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>);
  const HiIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>);
  const CartIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18"/><path d="M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/></svg>);
  const CartIconPlus = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 5h6"/><path d="M19 2v6"/><path d="m2.05 2.05 1.099-.028a1 1 0 011.008.815l2.69 14.347A1 1 0 007.83 18H18"/><path d="M4.564 5H12"/><path d="M6.25 14h12.712a2 2 0 001.991-1.57l.172-1.041"/><circle cx="18" cy="20" r="2"/><circle cx="8" cy="20" r="2"/></svg>);
  const StarIcon = () => (<svg xmlns="http://w3.org" viewBox="0 0 24 24" width="22" height="22" fill="#FFD700"><path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.4 8.168L12 18.896l-7.334 3.857 1.4-8.168L.132 9.21l8.2-1.192z"/></svg>);
  const CommentIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1"/></svg>);
  const CreditCardIcon = () => (<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>);

  const NoodleBowlArt = ({ width = 220, height = 170, className = "", style = {}, ...props }) => (
    <svg viewBox="0 0 220 170" width={width} height={height} className={className} style={{ display: "inline-block", verticalAlign: "middle", ...style }} {...props}>
      <ellipse cx="110" cy="161" rx="80" ry="7" fill="rgba(80,30,0,0.2)" />
      <path d="M26 84 Q30 34 110 30 Q190 34 194 84Z" fill="#FFD966" />
      <g stroke="#FFF1B8" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M38 76 Q56 52 74 72 T110 66 T146 62 T182 74" />
        <path d="M44 62 Q62 40 84 56 T126 48 T170 56" />
        <path d="M60 46 Q84 30 108 42 T152 40" />
      </g>
      <ellipse cx="78" cy="58" rx="24" ry="15" fill="#FFFFFF" />
      <circle cx="80" cy="57" r="9" fill="#FFB400" />
      <path d="M126 46 Q150 26 168 50 Q174 66 158 68 Q164 56 148 54 Q138 54 130 62Z" fill="#FF8A4C" />
      <g fill="#5CB85C">
        <circle cx="110" cy="40" r="4" />
        <circle cx="100" cy="66" r="4" />
        <circle cx="148" cy="72" r="4" />
        <circle cx="58" cy="76" r="4" />
      </g>
      <g stroke="#7B4A22" strokeWidth="5" strokeLinecap="round">
        <line x1="168" y1="2" x2="116" y2="52" />
        <line x1="182" y1="10" x2="128" y2="58" />
      </g>
      <path d="M14 80 H206 Q206 150 110 156 Q14 150 14 80Z" fill="#E8412F" />
      <rect x="10" y="74" width="200" height="12" rx="6" fill="#C93322" />
      <path d="M18 104 H202 Q200 114 196 122 H24 Q20 114 18 104Z" fill="#FFC72C" />
      <path d="M28 94 Q30 122 52 142" stroke="rgba(255,255,255,0.3)" strokeWidth="6" strokeLinecap="round" fill="none" />
    </svg>
  );

  const ThaiTeaArt = ({ width = 100, height = 192, className = "", style = {}, ...props }) => (
    <svg viewBox="0 0 100 192" width={width} height={height} className={className} style={{ display: "inline-block", verticalAlign: "middle", ...style }} {...props}>
      <ellipse cx="50" cy="189" rx="34" ry="4" fill="rgba(80,30,0,0.2)" />
      <path d="M14 38 L24 178 Q25 186 34 186 H66 Q75 186 76 178 L86 38Z" fill="rgba(255,255,255,0.5)" />
      <path d="M17 84 H83 L76 178 Q75 186 66 186 H34 Q25 186 24 178Z" fill="#F28A2E" />
      <path d="M17 84 Q33 74 50 84 T83 84 V104 Q66 96 50 106 T17 102Z" fill="#FFE9CF" />
      <rect x="30" y="118" width="22" height="22" rx="5" fill="rgba(255,255,255,0.55)" transform="rotate(-12 41 129)" />
      <rect x="50" y="144" width="20" height="20" rx="5" fill="rgba(255,255,255,0.5)" transform="rotate(10 60 154)" />
      <path d="M26 56 L32 170" stroke="rgba(255,255,255,0.6)" strokeWidth="5" strokeLinecap="round" />
      <rect x="10" y="32" width="80" height="10" rx="5" fill="#FFFFFF" />
      <line x1="66" y1="2" x2="56" y2="132" stroke="#3D5AFE" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );

  const SparkleArt = ({ width = 24, height = 24, className = "", style = {}, ...props }) => (
    <svg viewBox="-12 -12 24 24" width={width} height={height} className={className} style={{ display: "inline-block", verticalAlign: "middle", ...style }} {...props}>
      <path d="M0 -11 Q0 0 11 0 Q0 0 0 11 Q0 0 -11 0 Q0 0 0 -11Z" fill="#FFFFFF" />
    </svg>
  );

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

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  const COLORS = {
    orange: "#FF724C",
    yellow: "#FDBF50",
    navy: "#2A2C41",
    bg: "#FFF9F5",
    white: "#FFFFFF",
    text: "#2A2C41",
    gray: "#777777",
    lightGray: "#F4F4F4",
    border: "#EEEEEE",
    green: "#20B486",
    red: "#E0523B",
  };

  const getNotifKey = (n) => n.NotifId ?? n.NotificationID ?? n.id ?? `${n.Message}_${n.CreatedAt}`;

  const formatTimeLeft = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const getCurrentTimeFormatted = () => {
    const now = new Date();
    return now.toLocaleTimeString("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }) + " น.";
  };

  const getCurrentDateTimeForBackend = () => {
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

  const fetchStores = async () => {
    try {
      const res = await fetch(`${apiBase}/api/stores`);
      if (!res.ok) return;
      const data = await res.json();
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

  const fetchMyOrders = async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${apiBase}/api/orders?user_id=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMyOrders(data);
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
    fetchNotifs();
    fetchFoodCourtStatus();

    const interval = setInterval(() => {
      fetchStores();
      fetchMyOrders();
      fetchNotifs();
      fetchFoodCourtStatus();
    }, 5000);

    return () => clearInterval(interval);
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

        let loadedCards = [];
        if (Array.isArray(data.Cards) && data.Cards.length > 0) {
          loadedCards = data.Cards;
        } else if (Array.isArray(data.cards) && data.cards.length > 0) {
          loadedCards = data.cards;
        } else if (data.CardLast4 && data.CardLast4.trim() !== "") {
          // Fallback กรณีเดิมมีข้อมูลเฉพาะบัตรใบเดียวในคอลัมน์เดี่ยว
          loadedCards = [
            {
              id: "card_1",
              cardHolderName: data.CardHolderName || "",
              cardLast4: data.CardLast4 || "",
              cardExpiry: data.CardExpiry || "",
            },
          ];
        }

        setCards(loadedCards);
        setSelectedCardId(loadedCards.length > 0 ? loadedCards[0].id : null);

        setEditName(data.FullName || "");
        setEditPhone(data.Phone || "");
      } catch (error) {
        console.error("Load user profile error:", error);
      }
    };

    loadUserProfile();
  }, [userId, apiBase]);

  useEffect(() => {
    if (selectedStore) fetchProducts();
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
    let timer = null;
    if (outOfStockOrder) {
      setTimeLeft(1800);
      timer = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            clearInterval(timer);
            handleCancelOutOfStockOrder("หมดเวลาเลือกเมนูทดแทนภายใน 30 นาที ระบบยกเลิกออเดอร์อัตโนมัติ");
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [outOfStockOrder?.OrderID]);

  useEffect(() => {
    if (notifs.length > 0 && !isInitialized) {
      const keys = notifs.map((n) => getNotifKey(n));
      setReadNotifIds(keys);
      setIsInitialized(true);
    }
  }, [notifs, isInitialized]);

  const activeStore = useMemo(
    () => stores.find((store) => Number(store.StoreId) === Number(selectedStore)) || {},
    [stores, selectedStore]
  );

  const cartCount = useMemo(() => cart.length, [cart]);

  const totalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.UnitPrice || 0), 0),
    [cart]
  );

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return stores;
    return stores.filter((store) => String(store.StoreName || "").toLowerCase().includes(keyword));
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

  // CART HANDLERS
  const createCartRow = (product) => {
    const uniqueId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    return { ...product, cartItemId: uniqueId, qty: 1, item_note: "" };
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
    setCart((prev) => [...prev, createCartRow(product)]);
    setIsCartOpen(true);
  };

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const increaseQty = (index) => {
    setCart((prev) => {
      const item = prev[index];
      if (!item) return prev;
      const newItem = createCartRow(item);
      return [...prev.slice(0, index + 1), newItem, ...prev.slice(index + 1)];
    });
  };

  const decreaseQty = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
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
        customAlert("สำเร็จ", "ยกเลิกคำสั่งซื้อเรียบร้อยแล้ว ระบบกำลังดำเนินการคืนเงิน", "success");
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
    const originalItem = (outOfStockOrder.items || [])[0];

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
        customAlert("สำเร็จ", "เปลี่ยนเมนูสำเร็จ ระบบได้ส่งข้อมูลปรับเปลี่ยนไปยังหน้าร้านเรียบร้อยแล้ว", "success");
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
        croppedAreaPixels.height,
        0, 0,
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

  // ADD CARD HANDLER
  const handleAddNewCard = async (e) => {
    e.preventDefault();

    const cardName = editCardHolderName.trim();
    const cleanCardNumber = editCardNumber.replace(/\D/g, "");
    const cardExp = editCardExpiry.trim();

    if (!cardName) return customAlert("กรุณากรอกชื่อและนามสกุลบนบัตร", "", "warning");
    const nameParts = cardName.split(/\s+/).filter(Boolean);
    if (nameParts.length < 2) return customAlert("กรุณากรอกทั้งชื่อและนามสกุลบนบัตร", "", "warning");

    if (cleanCardNumber.length !== 16) return customAlert("หมายเลขบัตรต้องมี 16 หลัก", "", "warning");

    const expiryPattern = /^(0[1-9]|1[0-2])\/\d{2}$/;
    if (!expiryPattern.test(cardExp)) return customAlert("รูปแบบวันหมดอายุไม่ถูกต้อง (MM/YY)", "", "warning");

    const last4 = cleanCardNumber.slice(-4);
    const newCardObj = {
      id: `card_${Date.now()}`,
      cardHolderName: cardName,
      cardLast4: last4,
      cardExpiry: cardExp,
    };

    const updatedCards = [...cards, newCardObj];

      console.log("cards เดิม:", cards);
      console.log("cards หลังเพิ่ม:", updatedCards);
      
    try {
      const res = await fetch(`${apiBase}/api/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          full_name: fullName,
          phone: phone,
          cards: updatedCards,
          card_holder_name: cardName,
          card_last4: last4,
          card_expiry: cardExp,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || "บันทึกข้อมูลบัตรไม่สำเร็จ");
      }

      setCards(updatedCards);
      setSelectedCardId(newCardObj.id);
      setEditCardHolderName("");
      setEditCardNumber("");
      setEditCardExpiry("");
      setIsAddingCard(false);

      customAlert("เพิ่มบัตรเครดิต/เดบิต เรียบร้อยแล้ว!");
    } catch (err) {
      console.error("Add card error:", err);
      customAlert("เกิดข้อผิดพลาดในการบันทึกข้อมูลบัตร", err.message, "error");
    }
  };

  // DELETE CARD HANDLER
  const handleDeleteCard = async (cardIdToDelete) => {
    const updatedCards = cards.filter((c) => c.id !== cardIdToDelete);

    try {
      const res = await fetch(`${apiBase}/api/users/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          full_name: fullName,
          phone: phone,
          profile_img: profileImage,
          cards: updatedCards,
        }),
      });

      if (!res.ok) throw new Error("ไม่สามารถลบบัตรได้");

      setCards(updatedCards);
      if (selectedCardId === cardIdToDelete) {
        setSelectedCardId(updatedCards.length > 0 ? updatedCards[0].id : null);
      }
      customAlert("สำเร็จ", "ลบบัตรเรียบร้อยแล้ว", "success");
    } catch (err) {
      console.error("Delete card error:", err);
      customAlert("เกิดข้อผิดพลาด", "ไม่สามารถลบบัตรได้", "error");
    }
  };

  // ORDER SUBMISSION & PAYMENT HANDLERS
  const handleProceedToPayment = () => {
    if (!isFoodCourtOpen) return customAlert("ขณะนี้ศูนย์อาหารปิดให้บริการชั่วคราว", "", "error");
    if (cart.length === 0) return customAlert("กรุณาเลือกอาหารลงตะกร้าก่อนสั่งซื้อ", "", "error");
    if (!selectedStore) return customAlert("กรุณาเลือกร้านอาหาร", "", "error");
    setIsCartOpen(false);
    setIsPaymentModalOpen(true);
  };

  const handleSlipChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        customAlert("ขนาดไฟล์สลิปต้องไม่เกิน 5MB", "", "warning");
        e.target.value = "";
        return;
      }
      setSlipFile(file);
      setSlipPreview(URL.createObjectURL(file));
    }
  };

  const submitOrder = async () => {
    if (isSubmittingOrder) return;

    if (paymentMethod === "PromptPay" && !slipFile) {
      return customAlert("ไม่พบรูปภาพสลิป", "กรุณาอัปโหลดรูปภาพสลิปชำระเงินก่อนกดสั่งซื้อ", "warning");
    }

    if (paymentMethod === "TrueMoney" && !slipFile) {
      return customAlert("ไม่พบรูปภาพสลิป", "กรุณาอัปโหลดรูปภาพสลิปชำระเงินก่อนกดสั่งซื้อ", "warning");
    }

    if (paymentMethod === "CreditCard") {
      if (cards.length === 0) {
        return customAlert("ไม่พบข้อมูลบัตร", "กรุณาเพิ่มบัตรเครดิต/เดบิต ก่อนชำระเงิน", "warning");
      }
      if (!selectedCardId) {
        return customAlert("กรุณาเลือกบัตร", "กรุณาเลือกบัตรที่ต้องการใช้ชำระเงิน", "warning");
      }
    }

    const currentOrderTime = getCurrentDateTimeForBackend();
    const displayOrderTime = getCurrentTimeFormatted();
    const finalPickupTime = pickupTime ? `${pickupTime} น.` : displayOrderTime;

    const orderItems = cart.map((item) => ({
      product_id: Number(item.ProductId),
      qty: 1,
      unit_price: Number(item.UnitPrice || 0),
      item_note: item.item_note || "",
    }));

    const selectedCardObj = cards.find((c) => c.id === selectedCardId);

    const orderData = {
      store_id: Number(selectedStore),
      user_id: userId,
      items: orderItems,
      payment_method: paymentMethod,
      slip_url: slipPreview || "slip_placeholder.png",
      note: orderNote || "",
      pickup_time: finalPickupTime,
      order_time: currentOrderTime,
      card_info: paymentMethod === "CreditCard" ? selectedCardObj : null,
    };

    setIsSubmittingOrder(true);
    try {
      const res = await fetch(`${apiBase}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return customAlert(data.detail || "ไม่สามารถสั่งซื้อได้", "", "error");

      customAlert(
        `สั่งซื้อสำเร็จ!`,
        `หมายเลขคิว: ${data.queue_no || "-"}\nเวลาที่สั่ง: ${displayOrderTime}\nเวลารับอาหาร: ${finalPickupTime}`
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
    setIssueType("อาหารไม่ตรงตามออเดอร์");
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

  // STYLE
  const pageStyle = { minHeight: "100vh", height: "100vh", overflowY: "auto", scrollbarWidth: "none", background: COLORS.bg, color: COLORS.text, fontFamily: "'Sarabun', 'Roboto', sans-serif", boxSizing: "border-box" };
  const containerStyle = { width: "100%", maxWidth: "1450px", margin: "0 auto", padding: "20px 20px 110px", boxSizing: "border-box" };
  const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "15px", marginBottom: "25px", flexWrap: "wrap" };
  const logoStyle = { fontSize: "27px", fontWeight: "900", color: COLORS.navy, whiteSpace: "nowrap", cursor: "pointer" };
  const searchStyle = { flex: "1", minWidth: "220px", maxWidth: "560px", padding: "13px 20px", border: `1px solid ${COLORS.border}`, borderRadius: "30px", outline: "none", fontSize: "14px", background: COLORS.white, boxSizing: "border-box" };
  const profileStyle = { display: "flex", alignItems: "center", gap: "10px", background: COLORS.white, borderRadius: "30px", padding: "7px 14px 7px 7px", boxShadow: "0 4px 18px rgba(42,44,65,0.06)", cursor: "pointer" };
  const avatarStyle = { width: "40px", height: "40px", borderRadius: "50%", background: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "19px", overflow: "hidden" };
  const heroStyle = { background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.yellow})`, borderRadius: "28px", padding: "32px", color: COLORS.white, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", marginBottom: "28px", overflow: "hidden" };
  const cardStyle = { background: COLORS.white, borderRadius: "20px", padding: "13px", boxShadow: "0 7px 25px rgba(42,44,65,0.07)", border: `1px solid ${COLORS.border}` };

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
                        flexDirection: "column",
                        justify: "space-between"
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
                      <div>
                        <img
                          src={store.ImageUrl || "https://via.placeholder.com/400x200?text=Store+Image"}
                          alt={store.StoreName}
                          style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "15px", marginBottom: "12px" }}
                        />
                        <div style={{ fontSize: "18px", fontWeight: "900", marginBottom: "4px" }}>{store.StoreName}</div>
                        <div style={{ fontSize: "12px", color: COLORS.gray, marginBottom: "10px" }}>
                          {store.Description || "ร้านอาหารอร่อย คุณภาพดี ศูนย์อาหาร KMITL"}
                        </div>

                        <div 
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "space-between", 
                            background: "#FFF9F0", 
                            padding: "8px 12px", 
                            borderRadius: "12px", 
                            marginBottom: "10px",
                            border: `1px solid ${COLORS.yellow}50`
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ color: COLORS.yellow, fontSize: "5px" }}><StarIcon/></span>
                            <span style={{ fontWeight: "900", fontSize: "14px", color: COLORS.navy }}>
                              {avgRating > 0 ? avgRating.toFixed(1) : "ยังไม่มีรีวิว"}
                            </span>
                            {totalReviews > 0 && (
                              <span style={{ fontSize: "11px", color: COLORS.gray }}>({totalReviews})</span>
                            )}
                          </div>

                          <button
                            onClick={(e) => handleOpenStoreReviews(e, store)}
                            style={{
                              background: COLORS.white,
                              border: `1px solid ${COLORS.border}`,
                              borderRadius: "15px",
                              padding: "4px 10px",
                              fontSize: "11px",
                              fontWeight: "800",
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
                          {store.IsSuspended ? "● ถูกระงับ" : store.IsOpen ? "● เปิดให้บริการ" : "● ปิดชั่วคราว"}
                        </span>
                        <span style={{ color: isStoreUnavailable ? COLORS.gray : COLORS.orange, fontWeight: "800", fontSize: "13px" }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <button
                onClick={() => setViewMode("stores")}
                style={{
                  background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: "20px",
                  padding: "8px 16px", cursor: "pointer", fontWeight: "800", fontSize: "13px", color: COLORS.navy,
                  display: "flex", alignItems: "center", gap: "6px"
                }}
              >
                ← เลือกร้านอื่น
              </button>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "900" }}>ร้าน: {activeStore.StoreName}</h2>
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
                          style={{ width: "42px", height: "42px", border: "none", borderRadius: "50%", background: COLORS.orange, color: COLORS.white, fontSize: "25px", cursor: "pointer", fontWeight: "400" }}
                        >
                          +
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

  // PROFILE TAB
  const renderProfile = () => (
    <div>
      <h2 style={{ margin: "5px 0 20px", fontSize: "25px", fontWeight: "900" }}>โปรไฟล์ของฉัน </h2>
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
              style={{
                position: "absolute",
                bottom: "2px",
                right: "2px",
                background: COLORS.navy,
                color: COLORS.white,
                borderRadius: "50%",
                width: "44px",
                height: "44px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
                fontSize: "16px"
              }}
              title="เปลี่ยนรูปโปรไฟล์"
            >
              <CameraIcon />
            </label>
            <input
              id="profile-upload-input"
              type="file"
              accept="image/*"
              onChange={handleProfileImageChange}
              style={{ display: "none" }}
            />
          </div>

          {profileImage && (
            <button
              onClick={handleRemoveProfileImage}
              style={{
                background: "none",
                border: "none",
                color: COLORS.red,
                fontSize: "12px",
                fontWeight: "800",
                cursor: "pointer",
                marginBottom: "12px",
                textDecoration: "underline"
              }}
            >
              ลบรูปโปรไฟล์
            </button>
          )}

          <h2 style={{ margin: "0", fontSize: "24px", fontWeight: "900" }}>{fullName}</h2>
          <div style={{ color: COLORS.gray, fontSize: "13px", marginTop: "4px" }}>Customer</div>
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
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="08X-XXX-XXXX"
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
                <span>ชื่อผู้ใช้</span><strong>{fullName}</strong>
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
            </div>
          </>
        )}

        <div style={{ marginTop: "30px", paddingTop: "20px", borderTop: `2px dashed ${COLORS.border}`, textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontSize: "15px", fontWeight: "900", color: COLORS.navy }}>
              บัตรเครดิต / เดบิต ของฉัน ({cards.length})
            </div>
            {!isAddingCard && (
              <button
                type="button"
                onClick={() => {
                  setEditCardHolderName("");
                  setEditCardNumber("");
                  setEditCardExpiry("");
                  setIsAddingCard(true);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.orange,
                  fontWeight: "800",
                  fontSize: "13px",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                ＋ เพิ่มบัตรใหม่
              </button>
            )}
          </div>

          {/* Card List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "15px" }}>
            {cards.map((card) => (
              <div key={card.id} style={{ background: "#F8F8FA", border: `1px solid ${COLORS.border}`, borderRadius: "14px", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "12px", color: COLORS.gray }}>{card.cardHolderName}</div>
                  <div style={{ fontWeight: "800", fontSize: "14px", color: COLORS.navy, marginTop: "2px" }}>
                    •••• •••• •••• {card.cardLast4}
                  </div>
                  <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "2px" }}>Exp: {card.cardExpiry}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteCard(card.id)}
                  style={{
                    background: "#FFF0ED",
                    border: `1px solid ${COLORS.red}40`,
                    color: COLORS.red,
                    borderRadius: "8px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: "800",
                    cursor: "pointer"
                  }}
                >
                  ลบ
                </button>
              </div>
            ))}

            {cards.length === 0 && !isAddingCard && (
              <div style={{ color: COLORS.gray, fontSize: "13px", padding: "10px 0" }}>
                ยังไม่มีบัตรที่บันทึกไว้ กด "＋ เพิ่มบัตรใหม่" เพื่อเพิ่มบัตร
              </div>
            )}
          </div>

          {/* Form Add New Card */}
          {isAddingCard && (
            <form onSubmit={handleAddNewCard} style={{ background: "#F8F8FA", border: `1px solid ${COLORS.border}`, borderRadius: "14px", padding: "16px" }}>
              <div style={{ fontSize: "14px", fontWeight: "800", marginBottom: "12px", color: COLORS.navy }}>กรอกข้อมูลบัตรใหม่</div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>ชื่อบนบัตร</label>
                <input
                  type="text"
                  value={editCardHolderName}
                  onChange={(e) => setEditCardHolderName(e.target.value)}
                  placeholder="ชื่อ-นามสกุลบนบัตร"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontFamily: "inherit" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>หมายเลขบัตร (16 หลัก)</label>
                <input
                  type="text"
                  value={editCardNumber}
                  onChange={(e) => setEditCardNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="กรอกหมายเลขบัตร 16 หลัก"
                  maxLength="16"
                  inputMode="numeric"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontFamily: "inherit" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "15px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>วันหมดอายุ (MM/YY)</label>
                <input
                  type="text"
                  value={editCardExpiry}
                  onChange={(e) => {
                    let value = e.target.value.replace(/\D/g, "");
                    if (value.length > 4) value = value.slice(0, 4);
                    if (value.length >= 3) value = value.slice(0, 2) + "/" + value.slice(2);
                    setEditCardExpiry(value);
                  }}
                  placeholder="MM/YY"
                  maxLength="5"
                  inputMode="numeric"
                  style={{ width: "100%", padding: "10px 14px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, boxSizing: "border-box", fontFamily: "inherit" }}
                  required
                />
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="submit"
                  style={{ flex: 1, padding: "10px", background: COLORS.orange, color: COLORS.white, border: "none", borderRadius: "10px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
                >
                  บันทึกบัตรนี้
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddingCard(false)}
                  style={{ flex: 1, padding: "10px", background: COLORS.lightGray, color: COLORS.navy, border: "none", borderRadius: "10px", fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          )}
        </div>

        {/* LOGOUT BUTTON */}
        <div style={{ marginTop: "25px" }}>
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
                      {order.Status || "Pending"}
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

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "10px", borderTop: `1px solid ${COLORS.border}` }}>
                    <div>
                      <span style={{ fontSize: "12px", color: COLORS.gray }}>ราคารวม: </span>
                      <strong style={{ fontSize: "16px", color: COLORS.orange }}>{Number(order.TotalAmount || 0).toFixed(2)} ฿</strong>
                    </div>

                    {order.Status === "Completed" && (
                      <button
                        onClick={() => handleOpenReviewModal(order)}
                        style={{
                          padding: "7px 14px",
                          border: "none",
                          borderRadius: "10px",
                          background: hasReview ? COLORS.yellow : COLORS.orange,
                          color: hasReview ? COLORS.navy : COLORS.white,
                          fontSize: "12px",
                          fontWeight: "800",
                          cursor: "pointer",
                          fontFamily: "inherit"
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
      <h2 style={{ margin: "5px 0 20px", fontSize: "25px", fontWeight: "900" }}>คำสั่งซื้อของฉัน</h2>
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
                    <div style={{ fontSize: "10px", opacity: 0.85, textTransform: "uppercase" }}>คิวของคุณ</div>
                    <div style={{ fontSize: "20px", fontWeight: "900" }}>#{order.QueueNo}</div>
                    <div style={{ fontSize: "13px", fontWeight: "700", marginTop: "2px" }}>{order.StoreName}</div>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", margin: "12px 0 16px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: COLORS.gray }}>
                    {(order.OrderTime || order.CreatedAt || order.order_time) && (
                      <div>เวลาที่สั่ง: {order.OrderTime || order.order_time || order.CreatedAt}</div>
                    )}
                    {(order.PickupTime || order.pickup_time) && (
                      <div>เวลารับอาหาร: {order.PickupTime || order.pickup_time || 'รับทันที'}</div>
                    )}
                  </div>
                  <span style={{ background: "#FFF0EB", color: COLORS.orange, padding: "7px 16px", borderRadius: "20px", fontSize: "12px", fontWeight: "800", whiteSpace: "nowrap" }}>
                    {order.Status || "Pending"}
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

                {order.Status === "Completed" && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "15px", width: "100%" }}>
                    <button
                      onClick={() => handleOpenReviewModal(order)}
                      style={{
                        flex: 1,
                        padding: "11px",
                        border: "none",
                        borderRadius: "12px",
                        background: hasReview ? COLORS.yellow : COLORS.orange,
                        color: hasReview ? COLORS.navy : COLORS.white,
                        fontSize: "13px",
                        fontWeight: "800",
                        cursor: "pointer",
                        fontFamily: "inherit"
                      }}
                    >
                      {hasReview ? "ดูรีวิวของฉัน" : "ให้คะแนนและรีวิว"}
                    </button>

                    <button
                      onClick={() => {
                        if (hasReportedIssue) {
                          if (typeof fetchMyIssueReports === "function") fetchMyIssueReports();
                          if (typeof setIsViewReportsModalOpen === "function") setIsViewReportsModalOpen(true);
                        } else {
                          handleOpenReportModal(order);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "11px",
                        border: hasReportedIssue ? `1px solid ${COLORS.navy}` : `1px solid ${COLORS.red}`,
                        borderRadius: "12px",
                        background: hasReportedIssue ? "#F1F5F9" : "#FFF0ED",
                        color: hasReportedIssue ? COLORS.navy : COLORS.red,
                        fontSize: "13px",
                        fontWeight: "800",
                        cursor: "pointer",
                        fontFamily: "inherit"
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
      <h2 style={{ margin: "5px 0 20px", fontSize: "25px", fontWeight: "900" }}>การแจ้งเตือน</h2>
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
            <button onClick={() => setIsCartOpen(false)} style={{ width: "36px", height: "36px", border: "none", borderRadius: "50%", background: COLORS.lightGray, cursor: "pointer", fontSize: "20px" }}>×</button>
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
                        <div style={{ color: COLORS.orange, fontWeight: "900", marginTop: "3px" }}>{Number(item.UnitPrice).toFixed(2)} ฿</div>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                          <button onClick={() => decreaseQty(index)} style={{ width: "29px", height: "29px", border: "none", borderRadius: "50%", background: "#FFE9E3", color: COLORS.orange, fontSize: "18px", fontWeight: "900", cursor: "pointer" }}>−</button>
                          <b>1</b>
                          <button onClick={() => increaseQty(index)} style={{ width: "29px", height: "29px", border: "none", borderRadius: "50%", background: COLORS.orange, color: COLORS.white, fontSize: "18px", fontWeight: "900", cursor: "pointer" }}>+</button>
                        </div>
                      </div>
                      <button onClick={() => removeFromCart(index)} style={{ alignSelf: "flex-start", border: "none", background: "none", cursor: "pointer", fontSize: "16px" }}>×</button>
                    </div>
                    <div style={{ marginTop: "13px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "800", color: COLORS.navy, marginBottom: "5px" }}>หมายเหตุสำหรับรายการที่ {index + 1}</label>
                      <textarea value={item.item_note || ""} onChange={e => updateItemNote(index, e.target.value)} placeholder="เช่น ไม่เผ็ด, ไม่ใส่ผัก, หวานน้อย" rows={2} maxLength={255} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, outline: "none", resize: "vertical", fontFamily: "inherit", fontSize: "12px", background: COLORS.white }} />
                      <div style={{ textAlign: "right", fontSize: "10px", color: "#aaa", marginTop: "2px" }}>{(item.item_note || "").length}/255</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: `2px solid ${COLORS.border}`, paddingTop: "20px" }}>
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}> เวลารับอาหาร</label>
                  <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit" }} />
                  <div style={{ fontSize: "10px", color: COLORS.gray, marginTop: "5px" }}>หากไม่เลือก ระบบจะใช้เวลาปัจจุบันตอนกดสั่ง</div>
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>รายละเอียดเพิ่มเติมของออเดอร์</label>
                  <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติมสำหรับทั้งออเดอร์" rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit", resize: "vertical" }} />
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}> วิธีชำระเงิน</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} style={{ width: "100%", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit" }}>
                    <option value="PromptPay">สแกน QR Code (PromptPay)</option>
                    <option value="CreditCard">บัตรเครดิต / เดบิต</option>
                    <option value="TrueMoney">TrueMoney Wallet</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px" }}>
                  <span style={{ fontWeight: "800" }}>รวมทั้งหมด</span>
                  <span style={{ color: COLORS.orange, fontSize: "24px", fontWeight: "900" }}>{totalAmount.toFixed(2)} ฿</span>
                </div>

                <button 
                  onClick={handleProceedToPayment} 
                  disabled={!isFoodCourtOpen || activeStore.IsSuspended || !activeStore.IsOpen}
                  style={{
                    width: "100%", padding: "15px", marginTop: "15px", border: "none", borderRadius: "15px", 
                    background: (!isFoodCourtOpen || activeStore.IsSuspended || !activeStore.IsOpen) ? "#CCCCCC" : COLORS.orange, 
                    color: COLORS.white, fontSize: "16px", fontWeight: "900", cursor: (!isFoodCourtOpen || activeStore.IsSuspended || !activeStore.IsOpen) ? "not-allowed" : "pointer", fontFamily: "inherit" 
                  }}
                >
                  {activeStore.IsSuspended ? "ร้านค้านี้ถูกระงับการจำหน่าย" : !activeStore.IsOpen ? "ร้านค้านี้ปิดให้บริการชั่วคราว" : !isFoodCourtOpen ? "ศูนย์อาหารปิดให้บริการชั่วคราว" : "ชำระเงิน"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // PAYMENT MODAL WITH MULTIPLE CARDS SELECTION
  const renderPaymentModal = () => {
    if (!isPaymentModalOpen) return null;

    const selectedCard = cards.find((c) => c.id === selectedCardId);

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(42,44,65,0.6)",
          zIndex: 2000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box",
          overflowY: "auto",
        }}
        onClick={() => setIsPaymentModalOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: COLORS.white,
            width: "min(500px, 100%)",
            maxHeight: "90vh",
            overflowY: "auto",
            borderRadius: "24px",
            padding: "25px",
            boxSizing: "border-box",
            textAlign: "center",
          }}
        >
          {/* HEADER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900" }}>ชำระเงิน</h3>
            <button
              onClick={() => setIsPaymentModalOpen(false)}
              style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}
            >
              ×
            </button>
          </div>

          {/* TOTAL */}
          <div style={{ background: "#FFF9F5", padding: "15px", borderRadius: "15px", marginBottom: "18px", border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: "13px", color: COLORS.gray }}>ยอดชำระสุทธิ</div>
            <div style={{ fontSize: "28px", fontWeight: "900", color: COLORS.orange }}>{totalAmount.toFixed(2)} ฿</div>
          </div>

          {/* PROMPTPAY */}
          {paymentMethod === "PromptPay" && (
            <>
              <div style={{ margin: "15px 0", background: "#FFFFFF", padding: "15px", borderRadius: "16px", display: "inline-block", border: `2px solid ${COLORS.navy}` }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PromptPay_${totalAmount}`}
                  alt="PromptPay QR Code"
                  style={{ width: "180px", height: "180px", display: "block" }}
                />
                <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "8px", fontWeight: "700" }}>PromptPay (จำลองระบบ)</div>
              </div>

              <div style={{ marginTop: "15px", textAlign: "left" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>แนบหลักฐานสลิปการโอนเงิน (ไม่เกิน 5MB):</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSlipChange}
                  style={{ width: "100%", padding: "10px", borderRadius: "10px", border: `1px dashed ${COLORS.orange}`, background: COLORS.bg, fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              {slipPreview && (
                <div style={{ marginTop: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: COLORS.green, fontWeight: "800", marginBottom: "4px" }}>✓ เลือกรูปภาพเรียบร้อย</div>
                  <img src={slipPreview} alt="Slip Preview" style={{ width: "120px", maxHeight: "160px", objectFit: "contain", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />
                </div>
              )}
            </>
          )}

          {paymentMethod === "CreditCard" && (
            <div style={{ textAlign: "left", marginBottom: "15px" }}>
              <div style={{ fontWeight: "900", fontSize: "15px", marginBottom: "12px", color: COLORS.navy }}>
                เลือกบัตรเครดิต/เดบิต
              </div>

              {cards.length > 0 ? (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "15px" }}>
                    {cards.map((card) => {
                      const isSelected = card.id === selectedCardId;
                      return (
                        <div
                          key={card.id}
                          onClick={() => setSelectedCardId(card.id)}
                          style={{
                            padding: "12px 15px",
                            borderRadius: "14px",
                            border: `2px solid ${isSelected ? COLORS.orange : COLORS.border}`,
                            background: isSelected ? "#FFF9F5" : COLORS.white,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ color: isSelected ? COLORS.orange : COLORS.gray }}>
                              <CreditCardIcon />
                            </div>
                            <div>
                              <div style={{ fontWeight: "800", fontSize: "14px", color: COLORS.navy }}>
                                •••• •••• •••• {card.cardLast4}
                              </div>
                              <div style={{ fontSize: "12px", color: COLORS.gray }}>
                                {card.cardHolderName} (Exp: {card.cardExpiry})
                              </div>
                            </div>
                          </div>
                          <input
                            type="radio"
                            name="selected_card"
                            checked={isSelected}
                            onChange={() => setSelectedCardId(card.id)}
                            style={{ accentColor: COLORS.orange, cursor: "pointer" }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsPaymentModalOpen(false);
                      setActiveTab("profile");
                      setIsAddingCard(true);
                    }}
                    style={{
                      background: "none",
                      border: `1px dashed ${COLORS.orange}`,
                      color: COLORS.orange,
                      width: "100%",
                      padding: "10px",
                      borderRadius: "12px",
                      fontWeight: "800",
                      fontSize: "13px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      marginBottom: "15px"
                    }}
                  >
                    ＋ เพิ่มบัตรใหม่
                  </button>
                </>
              ) : (
                <div style={{ background: "#F8F8FA", padding: "20px", borderRadius: "16px", textAlign: "center", border: `1px solid ${COLORS.border}` }}>
                  <div style={{ color: COLORS.gray, fontSize: "14px", marginBottom: "12px" }}>
                    คุณยังไม่มีบัตรเครดิต/เดบิตที่บันทึกไว้
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPaymentModalOpen(false);
                      setActiveTab("profile");
                      setIsAddingCard(true);
                    }}
                    style={{
                      background: COLORS.orange,
                      color: COLORS.white,
                      border: "none",
                      padding: "10px 20px",
                      borderRadius: "12px",
                      fontWeight: "800",
                      fontSize: "13px",
                      cursor: "pointer",
                      fontFamily: "inherit"
                    }}
                  >
                    ＋ เพิ่มบัตรเครดิต/เดบิต
                  </button>
                </div>
              )}
            </div>
          )}

          {paymentMethod === "TrueMoney" && (
            <>
              <div style={{ margin: "15px 0", background: "#FFFFFF", padding: "15px", borderRadius: "16px", display: "inline-block", border: `2px solid ${COLORS.navy}` }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PromptPay_${totalAmount}`}
                  alt="TrueMoney QR Code"
                  style={{ width: "180px", height: "180px", display: "block" }}
                />
                <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "8px", fontWeight: "700" }}>TrueMoney (จำลองระบบ)</div>
              </div>

              <div style={{ marginTop: "15px", textAlign: "left" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>แนบหลักฐานสลิปการโอนเงิน (ไม่เกิน 5MB):</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSlipChange}
                  style={{ width: "100%", padding: "10px", borderRadius: "10px", border: `1px dashed ${COLORS.orange}`, background: COLORS.bg, fontSize: "12px", boxSizing: "border-box" }}
                />
              </div>

              {slipPreview && (
                <div style={{ marginTop: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: COLORS.green, fontWeight: "800", marginBottom: "4px" }}>✓ เลือกรูปภาพเรียบร้อย</div>
                  <img src={slipPreview} alt="Slip Preview" style={{ width: "120px", maxHeight: "160px", objectFit: "contain", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />
                </div>
              )}
            </>
          )}

          {/* SUBMIT */}
          <button
            onClick={submitOrder}
            disabled={isSubmittingOrder}
            style={{
              width: "100%",
              padding: "15px",
              marginTop: "10px",
              border: "none",
              borderRadius: "15px",
              background: isSubmittingOrder ? "#BBBBBB" : COLORS.green,
              color: COLORS.white,
              fontSize: "16px",
              fontWeight: "900",
              cursor: isSubmittingOrder ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {isSubmittingOrder ? "กำลังส่งคำสั่งซื้อ..." : "ยืนยันการชำระเงินและสั่งซื้อ"}
          </button>
        </div>
      </div>
    );
  };

  // REVIEW MODAL
  const renderReviewModal = () => {
    if (!reviewOrder) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }} onClick={() => setReviewOrder(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: COLORS.white, width: "min(420px, 100%)", borderRadius: "22px", padding: "25px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "20px" }}>{isReadOnlyReview ? "รีวิวของคุณ" : "ให้คะแนนร้าน"}</h3>
            <button onClick={() => setReviewOrder(null)} style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}>×</button>
          </div>
          <p style={{ color: COLORS.gray, fontSize: "13px" }}>คิว #{reviewOrder.QueueNo} • {reviewOrder.StoreName}</p>

          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <label style={{ fontSize: "14px", fontWeight: "800", display: "block", marginBottom: "8px" }}>คะแนนความพึงพอใจ</label>
            {isReadOnlyReview ? (
              <div style={{ fontSize: "30px" }}>
                {Array.from({ length: 5 }, (_, i) => (<StarIcon key={i} style={{color: i < Number(rating) ? "#FFD166" : "#D9D9D9"}}/>))}
                <span style={{ fontSize: "14px", color: COLORS.gray, marginLeft: "8px", fontWeight: "700" }}>({rating}/5)</span>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "center", gap: "8px", fontSize: "36px", cursor: "pointer", userSelect: "none" }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      style={{
                        transition: "transform 0.1s ease",
                        transform: (hoverRating >= star || (!hoverRating && rating >= star)) ? "scale(1.15)" : "scale(1)",
                        filter: (hoverRating >= star || (!hoverRating && rating >= star)) ? "none" : "grayscale(100%) opacity(0.3)"
                      }}
                    >
                      <StarIcon/>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: "13px", color: COLORS.orange, fontWeight: "800", marginTop: "6px" }}>
                  {hoverRating ? `${hoverRating} ดาว` : `${rating} ดาว`}
                </div>
              </div>
            )}
          </div>

          <div style={{ marginTop: "18px" }}>
            <label style={{ fontSize: "13px", fontWeight: "800" }}>ความคิดเห็น (ไม่จำเป็นต้องใส่)</label>
            {isReadOnlyReview ? (
              <div style={{ marginTop: "7px", background: COLORS.lightGray, padding: "13px", borderRadius: "12px", fontSize: "13px" }}>{reviewComment}</div>
            ) : (
              <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="บอกความรู้สึกของคุณเกี่ยวกับอาหารและบริการ (ไม่จำเป็น)..." rows={3} style={{ width: "100%", boxSizing: "border-box", marginTop: "7px", padding: "11px", borderRadius: "12px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit", resize: "vertical" }} />
            )}
          </div>

          <div style={{ marginTop: "18px" }}>
            <label style={{ fontSize: "13px", fontWeight: "800", display: "block", marginBottom: "6px" }}>📷 แนบรูปภาพรีวิว (ไม่เกิน 5MB)</label>
            {isReadOnlyReview ? (
              reviewImagePreview ? (
                <img src={reviewImagePreview} alt="Review Attachment" style={{ width: "100%", maxHeight: "200px", objectFit: "cover", borderRadius: "12px", marginTop: "5px" }} />
              ) : (
                <div style={{ fontSize: "12px", color: COLORS.gray, fontStyle: "italic" }}>ไม่มีรูปภาพแนบ</div>
              )
            ) : (
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleReviewImageChange}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "10px",
                    border: `1px dashed ${COLORS.orange}`,
                    background: COLORS.bg,
                    fontSize: "12px",
                    boxSizing: "border-box"
                  }}
                />
                {reviewImagePreview && (
                  <div style={{ marginTop: "10px", textAlign: "center" }}>
                    <img src={reviewImagePreview} alt="Review Preview" style={{ width: "100px", height: "100px", objectFit: "cover", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {!isReadOnlyReview && (
            <button onClick={submitReview} style={{ width: "100%", marginTop: "22px", padding: "13px", border: "none", borderRadius: "13px", background: COLORS.orange, color: COLORS.white, fontWeight: "900", fontSize: "14px", cursor: "pointer", fontFamily: "inherit" }}>
              ส่งรีวิว 
            </button>
          )}
        </div>
      </div>
    );
  };

  // OUT OF STOCK MODAL
  const renderOutOfStockModal = () => {
    if (!outOfStockOrder) return null;

    const originalProductIds = (outOfStockOrder.items || []).map(item => Number(item.ProductId));
    const availableProducts = products.filter((p) => {
      const isSameStore = Number(p.StoreId || p.store_id) === Number(outOfStockOrder.StoreId || outOfStockOrder.StoreID);
      const isAvailable = !p.IsOutOfStock && Number(p.IsOutOfStock) !== 1;
      const isNotOriginal = !originalProductIds.includes(Number(p.ProductId));
      return isSameStore && isAvailable && isNotOriginal;
    });

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.75)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: COLORS.white, width: "min(460px, 100%)", borderRadius: "24px", padding: "25px", textAlign: "center" }}>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: COLORS.navy }}>
            สินค้าบางรายการหมด!
          </h3>
          <p style={{ color: COLORS.gray, fontSize: "13px", marginTop: "6px" }}>
            คิว #{outOfStockOrder.QueueNo} • ร้าน {outOfStockOrder.StoreName} แจ้งว่าวัตถุดิบหมดชั่วคราว
          </p>

          <div style={{ background: "#FFF0ED", color: COLORS.red, padding: "10px 14px", borderRadius: "12px", margin: "14px 0", fontSize: "14px", fontWeight: "800", border: `1px solid ${COLORS.red}` }}>
            ⏱ กรุณาเลือกภายใน: <span style={{ fontSize: "18px", color: COLORS.red, fontWeight: "900" }}>{formatTimeLeft(timeLeft)}</span> นาที
            <div style={{ fontSize: "11px", fontWeight: "normal", marginTop: "2px", color: "#b91c1c" }}>
              (ระบบจะยกเลิกและคืนเงินให้อัตโนมัติหากหมดเวลา)
            </div>
          </div>

          {!isChangeMenuMode ? (
            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => setIsChangeMenuMode(true)}
                style={{ width: "100%", padding: "14px", border: "none", borderRadius: "14px", background: COLORS.orange, color: COLORS.white, fontWeight: "900", fontSize: "15px", cursor: "pointer" }}
              >
                เลือกระบุเมนูใหม่ทดแทน
              </button>
              <button
                onClick={() => handleCancelOutOfStockOrder("ลูกค้าขอยกเลิกออเดอร์เนื่องจากวัตถุดิบหมด")}
                style={{ width: "100%", padding: "14px", border: `1px solid ${COLORS.red}`, borderRadius: "14px", background: "#FFF0ED", color: COLORS.red, fontWeight: "900", fontSize: "15px", cursor: "pointer" }}
              >
                ยกเลิกออเดอร์นี้ (ขอคืนเงิน)
              </button>
            </div>
          ) : (
            <div style={{ marginTop: "16px", textAlign: "left" }}>
              <label style={{ fontSize: "13px", fontWeight: "800", color: COLORS.navy, display: "block", marginBottom: "8px" }}>
                เลือกเมนูทดแทนจากร้าน {outOfStockOrder.StoreName}:
              </label>

              <div style={{ maxHeight: "200px", overflowY: "auto", display: "grid", gap: "8px", marginBottom: "14px" }}>
                {availableProducts.length === 0 ? (
                  <div style={{ textAlign: "center", color: COLORS.gray, padding: "20px", fontSize: "13px" }}>
                    ไม่มีเมนูอื่นที่พร้อมจำหน่ายในขณะนี้
                  </div>
                ) : (
                  availableProducts.map((product) => (
                    <div
                      key={product.ProductId}
                      onClick={() => setNewSelectedProduct(product)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "12px",
                        border: `2px solid ${newSelectedProduct?.ProductId === product.ProductId ? COLORS.orange : COLORS.border}`,
                        background: newSelectedProduct?.ProductId === product.ProductId ? "#FFF9F5" : COLORS.white,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: "800", fontSize: "14px" }}>{product.ProductName}</div>
                        <div style={{ fontSize: "12px", color: COLORS.gray }}>{product.UnitPrice} ฿</div>
                      </div>
                      {newSelectedProduct?.ProductId === product.ProductId && (
                        <span style={{ color: COLORS.orange, fontWeight: "900" }}>✓ เลือก</span>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setIsChangeMenuMode(false)}
                  style={{ flex: 1, padding: "11px", border: `1px solid ${COLORS.border}`, borderRadius: "10px", background: COLORS.lightGray, cursor: "pointer" }}
                >
                  ย้อนกลับ
                </button>
                <button
                  onClick={handleChangeOrderMenu}
                  disabled={!newSelectedProduct}
                  style={{
                    flex: 2,
                    padding: "11px",
                    border: "none",
                    borderRadius: "10px",
                    background: newSelectedProduct ? COLORS.green : "#CCCCCC",
                    color: COLORS.white,
                    fontWeight: "900",
                    cursor: newSelectedProduct ? "pointer" : "not-allowed"
                  }}
                >
                  ยืนยันเปลี่ยนเมนู
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // STORE REVIEWS MODAL
  const renderStoreReviewsModal = () => {
    if (!selectedStoreForReviews) return null;

    return (
      <div 
        style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.6)", zIndex: 2500, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }}
        onClick={() => setSelectedStoreForReviews(null)}
      >
        <div 
          onClick={e => e.stopPropagation()} 
          style={{ background: COLORS.white, width: "min(500px, 100%)", maxHeight: "80vh", borderRadius: "24px", padding: "25px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", borderBottom: `1px solid ${COLORS.border}`, paddingBottom: "12px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900" }}> รีวิวจากลูกค้า</h3>
              <div style={{ fontSize: "13px", color: COLORS.gray, marginTop: "2px" }}>ร้าน: {selectedStoreForReviews.StoreName}</div>
            </div>
            <button onClick={() => setSelectedStoreForReviews(null)} style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}>×</button>
          </div>

          <div style={{ overflowY: "auto", flex: 1, paddingRight: "5px" }}>
            {isLoadingReviews ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.gray }}>กำลังโหลดรีวิว...</div>
            ) : storeReviewsList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.gray }}>
                <div style={{ fontSize: "40px", marginBottom: "8px" }}> <CommentIcon/> </div> ยังไม่มีความคิดเห็นสำหรับร้านนี้ 
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {storeReviewsList.map((rev, index) => (
                  <div key={rev.ReviewID || index} style={{ background: COLORS.bg, padding: "14px", borderRadius: "16px", border: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontWeight: "800", fontSize: "13px" }}>{rev.ReviewerName || rev.CustomerName || rev.FullName || "ผู้ใช้บริการ"}</span>
                      <span style={{ fontSize: "11px", color: COLORS.gray }}>{rev.CreatedAt || rev.ReviewDate || ""}</span>
                    </div>
                    <div style={{ fontSize: "14px", marginBottom: "6px", display: "flex", gap: "2px" }}>
                      {Array.from({ length: Number(rev.Rating || rev.rating || 5) }, (_, i) => <StarIcon key={i} />)}
                    </div>

                    {rev.Comment || rev.comment ? (
                      <div style={{ fontSize: "13px", color: COLORS.navy, lineHeight: "1.4" }}>
                        {rev.Comment || rev.comment}
                      </div>
                    ) : (
                      <div style={{ fontSize: "12px", color: COLORS.gray, fontStyle: "italic" }}>ไม่ได้ระบุข้อความ</div>
                    )}

                    {(rev.ImageUrl || rev.image_url) && (
                      <img 
                        src={rev.ImageUrl || rev.image_url} 
                        alt="Review Attachment" 
                        style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "10px", marginTop: "10px" }} 
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // REPORT ISSUE MODAL 
  const renderReportModal = () => {
    if (!isReportModalOpen) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(42,44,65,0.6)",
          zIndex: 2500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box"
        }}
        onClick={() => setIsReportModalOpen(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: COLORS.white,
            width: "min(460px, 100%)",
            borderRadius: "24px",
            padding: "25px",
            boxSizing: "border-box"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: COLORS.navy }}>
               รายงานปัญหาการใช้งาน / คำสั่งซื้อ
            </h3>
            <button
              onClick={() => setIsReportModalOpen(false)}
              style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}
            >
              ×
            </button>
          </div>

          {selectedOrderForReport && (
            <div style={{ background: COLORS.bg, padding: "10px 14px", borderRadius: "12px", fontSize: "13px", marginBottom: "15px", border: `1px solid ${COLORS.border}` }}>
              <b>ออเดอร์อ้างอิง:</b> คิว #{selectedOrderForReport.QueueNo} ({selectedOrderForReport.StoreName})
            </div>
          )}

          <div style={{ marginBottom: "15px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>ประเภทปัญหา</label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              style={{ width: "100%", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit" }}
            >
              <option value="อาหารไม่ตรงตามออเดอร์">อาหารไม่ตรงตามออเดอร์</option>
              <option value="อาหารรอนานเกินกำหนด">อาหารรอนานเกินกำหนด</option>
              <option value="ปัญหาเรื่องการชำระเงิน/สลิป">ปัญหาเรื่องการชำระเงิน/สลิป</option>
              <option value="คุณภาพ/รสชาติอาหาร">คุณภาพ/รสชาติอาหาร</option>
              <option value="ระบบขัดข้อง/อื่นๆ">ระบบขัดข้อง/อื่นๆ</option>
            </select>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>รายละเอียดปัญหา</label>
            <textarea
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
              placeholder="อธิบายปัญหาที่พบเพื่อความรวดเร็วในการตรวจสอบ..."
              rows={4}
              style={{ width: "100%", boxSizing: "border-box", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit", resize: "vertical" }}
            />
          </div>

          <button
            onClick={handleSubmitReport}
            disabled={isSubmittingReport}
            style={{
              width: "100%",
              padding: "14px",
              border: "none",
              borderRadius: "14px",
              background: isSubmittingReport ? "#CCCCCC" : COLORS.orange,
              color: COLORS.white,
              fontWeight: "900",
              fontSize: "15px",
              cursor: isSubmittingReport ? "not-allowed" : "pointer",
              fontFamily: "inherit"
            }}
          >
            {isSubmittingReport ? "กำลังส่งข้อมูล..." : "ส่งรายงานปัญหา"}
          </button>
        </div>
      </div>
    );
  };

  // VIEW REPORT HISTORY MODAL
  const renderViewReportsModal = () => {
    if (!isViewReportsModalOpen) return null;

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ background: "#ffffff", width: "min(550px, 100%)", borderRadius: "16px", padding: "24px", maxHeight: "85vh", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #e2e8f0", paddingBottom: "12px" }}>
            <h3 style={{ margin: 0, fontSize: "18px", color: "#0f172a", fontWeight: "800" }}>รายละเอียดปัญหาที่แจ้งไว้</h3>
            <button onClick={() => setIsViewReportsModalOpen(false)} style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "#64748b" }}>✕</button>
          </div>

          {myIssueReports.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: "40px", marginBottom: "8px" }}></div>
              ไม่พบประวัติการแจ้งปัญหา
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {myIssueReports.map((report, idx) => (
                <div key={report.ReportID || idx} style={{ border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px", background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "800", fontSize: "13px", color: "#0f172a" }}>
                      {report.IssueType || report.issue_type || "รายงานปัญหา"}
                    </span>
                    <span style={{
                      fontSize: "11px",
                      padding: "3px 8px",
                      borderRadius: "10px",
                      fontWeight: "bold",
                      background: report.Status === "Resolved" ? "#dcfce7" : report.Status === "In_Progress" ? "#fef3c7" : "#fee2e2",
                      color: report.Status === "Resolved" ? "#166534" : report.Status === "In_Progress" ? "#92400e" : "#991b1b"
                    }}>
                      {report.Status === "Resolved" ? "แก้ไขแล้ว" : report.Status === "In_Progress" ? "กำลังตรวจสอบ" : "รอดำเนินการ"}
                    </span>
                  </div>

                  <div style={{ fontSize: "13px", color: "#334155", margin: "6px 0" }}>
                    <b>รายละเอียด:</b> {report.Description || report.description}
                  </div>

                  {report.AdminNote && (
                    <div style={{ marginTop: "8px", padding: "8px 10px", background: "#e0f2fe", borderRadius: "8px", fontSize: "12px", color: "#0369a1" }}>
                      <b>การตอบกลับจากแอดมิน:</b> {report.AdminNote}
                    </div>
                  )}

                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "8px", textAlign: "right" }}>
                    แจ้งเมื่อ:{" "}
                    {report.CreatedAt || report.created_at
                      ? new Date(report.CreatedAt || report.created_at).toLocaleString("th-TH", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "-"}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setIsViewReportsModalOpen(false)}
            style={{ width: "100%", marginTop: "20px", padding: "10px", background: "#64748b", color: "#ffffff", border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    );
  };

  // CUSTOM ALERT DIALOG
  const renderCustomAlert = () => {
    if (!alertData.isOpen) return null;

    const getIcon = () => {
      switch (alertData.type) {
        case "success": return "✔";
        case "error": return "✖";
        case "warning": return "🛇";
        default: return "✔";
      }
    };

    const getButtonColor = () => {
      switch (alertData.type) {
        case "success": return COLORS.green;
        case "error": return COLORS.red;
        case "warning": return COLORS.orange;
        default: return COLORS.green;
      }
    };

    const closeAlert = () => setAlertData({ ...alertData, isOpen: false });

    const handleConfirm = () => {
      if (alertData.onConfirm) alertData.onConfirm();
      closeAlert();
    };

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(42,44,65,0.6)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
          boxSizing: "border-box",
        }}
        onClick={closeAlert}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: COLORS.white,
            width: "min(380px, 100%)",
            borderRadius: "24px",
            padding: "30px 25px",
            textAlign: "center",
            boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            boxSizing: "border-box",
          }}
        >
          <div style={{ fontSize: "55px", marginBottom: "15px" }}>{getIcon()}</div>

          <h3 style={{ margin: "0 0 10px", fontSize: "22px", fontWeight: "900", color: COLORS.navy }}>
            {alertData.title}
          </h3>

          <div style={{ margin: "0 0 25px", fontSize: "14px", color: COLORS.gray, whiteSpace: "pre-line", lineHeight: "1.6" }}>
            {alertData.message}
          </div>

          {alertData.onConfirm ? (
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={closeAlert}
                style={{
                  flex: 1, padding: "14px", border: "1px solid #ddd", borderRadius: "14px",
                  background: COLORS.white, color: COLORS.gray, fontWeight: "900", fontSize: "15px", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                ยกเลิก
              </button>

              <button
                onClick={handleConfirm}
                style={{
                  flex: 1, padding: "14px", border: "none", borderRadius: "14px",
                  background: getButtonColor(), color: COLORS.white, fontWeight: "900", fontSize: "15px", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                เปลี่ยนร้าน
              </button>
            </div>
          ) : (
            <button
              onClick={closeAlert}
              style={{
                width: "100%", padding: "14px", border: "none", borderRadius: "14px",
                background: getButtonColor(), color: COLORS.white, fontWeight: "900", fontSize: "16px", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ตกลง
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="customer-view" style={pageStyle}>
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap');
          .customer-view, .customer-view * {font-family: 'Sarabun', sans-serif !important;}
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
          }
        `}
      </style>
      <div style={containerStyle}>
        {/* HEADER BAR */}
        <header style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={logoStyle} onClick={() => handleSelectTab("menu")}>
              Only<span style={{ color: COLORS.orange }}>Foods</span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: "800",
                background: isFoodCourtOpen ? "#E8F8F3" : "#FFF0ED",
                color: isFoodCourtOpen ? COLORS.green : COLORS.red,
                border: `1px solid ${isFoodCourtOpen ? COLORS.green + "40" : COLORS.red + "40"}`
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: isFoodCourtOpen ? COLORS.green : COLORS.red,
                  display: "inline-block"
                }}
              />
              {isFoodCourtOpen ? "ศูนย์อาหารเปิดให้บริการ" : "ศูนย์อาหารปิดให้บริการ"}
            </div>
          </div>

          {activeTab === "menu" && (
            <input
              type="text"
              placeholder={viewMode === "stores" ? " ค้นหาร้านอาหาร..." : " ค้นหาเมนูอาหาร..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={searchStyle}
            />
          )}

          <div onClick={() => handleSelectTab("profile")} style={profileStyle}>
            <div style={avatarStyle}>
              {profileImage ? (
                <img src={profileImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <UserIcon/>
              )}
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: "800" }}>{fullName}</div>
            </div>
          </div>
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
        style={{
          position: "fixed", right: "25px", bottom: "90px", width: "62px", height: "62px",
          border: "none", borderRadius: "50%", background: COLORS.orange, color: COLORS.white,
          fontSize: "26px", cursor: "pointer", zIndex: 500, boxShadow: "0 8px 25px rgba(255,114,76,0.35)"
        }}
      >
        <CartIconPlus/>
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
      <div style={{
        position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)",
        background: COLORS.navy, borderRadius: "35px", padding: "7px", display: "flex",
        alignItems: "center", gap: "4px", zIndex: 600, boxShadow: "0 10px 35px rgba(42,44,65,0.25)",
        maxWidth: "calc(100vw - 30px)", overflowX: "auto"
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
      {renderPaymentModal()}
      {renderReviewModal()}
      {renderOutOfStockModal()}
      {renderStoreReviewsModal()}
      {renderReportModal()}
      {renderViewReportsModal()}
      {renderCustomAlert()}

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
              style={{
                position: "relative",
                width: "100%",
                height: "350px",
                background: "#222",
                borderRadius: "15px",
                overflow: "hidden",
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
                style={{
                  flex: 1,
                  padding: "11px",
                  background: COLORS.lightGray,
                  color: COLORS.navy,
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: "800",
                  cursor: "pointer",
                }}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                onClick={createCroppedImage}
                style={{
                  flex: 1,
                  padding: "11px",
                  background: COLORS.orange,
                  color: COLORS.white,
                  border: "none",
                  borderRadius: "10px",
                  fontWeight: "800",
                  cursor: "pointer",
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