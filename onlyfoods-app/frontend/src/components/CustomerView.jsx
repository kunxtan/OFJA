import React, { useEffect, useMemo, useState } from "react";

export default function CustomerView({ user, apiBase }) {
  // USER
  const userId = user?.UserId || user?.id;
  const fullName = user?.FullName || user?.name || "Customer";

  // PROFILE AVATAR STATE
  const [profileImage, setProfileImage] = useState(user?.ProfileImage || user?.avatar || null);

  // DATA
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [notifs, setNotifs] = useState([]);

  // FOOD COURT STATUS STATE
  const [isFoodCourtOpen, setIsFoodCourtOpen] = useState(true);

  // OUT OF STOCK / ORDER CHANGE STATE
  const [outOfStockOrder, setOutOfStockOrder] = useState(null);
  const [isChangeMenuMode, setIsChangeMenuMode] = useState(false);
  const [newSelectedProduct, setNewSelectedProduct] = useState(null);

  // PAGE & NAVIGATION
  const [activeTab, setActiveTab] = useState("menu");
  const [search, setSearch] = useState("");
  const [selectedStore, setSelectedStore] = useState(null);
  const [viewMode, setViewMode] = useState("stores");

  // CART
  const [cart, setCart] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // ORDER
  const [pickupTime, setPickupTime] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PromptPay");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // PAYMENT MODAL & SLIP FILE STATE
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);

  // NOTIFICATION
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

  // STORE REVIEWS MODAL STATE (ระบบดูรีวิวทั้งหมดของร้านค้า)
  const [selectedStoreForReviews, setSelectedStoreForReviews] = useState(null);
  const [storeReviewsList, setStoreReviewsList] = useState([]);
  const [isLoadingReviews, setIsLoadingReviews] = useState(false);

  // CONSTANT FOR MAX FILE SIZE (5MB)
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  // COLORS
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
    red: "#E0523B"
  };

  // API FUNCTIONS
  const fetchStores = async () => {
  try {
    const res = await fetch(`${apiBase}/api/stores`);
    if (!res.ok) return;
    const data = await res.json();
    // ดึงคะแนนและจำนวนรีวิวของแต่ละร้าน
    const storesWithReviews = await Promise.all(
      data.map(async (store) => {
        try {
          const reviewRes = await fetch(
            `${apiBase}/api/stores/${store.StoreId}/reviews`
          );

          if (!reviewRes.ok) {
            return {
              ...store,
              RatingAverage: 0,
              ReviewCount: 0
            };
          }

          const reviewData = await reviewRes.json();
          const summary = reviewData?.summary || {};
          return {
            ...store,
            // คะแนนเฉลี่ยของร้าน
            RatingAverage: Number(summary.average || 0),
            // จำนวนรีวิวของร้าน
            ReviewCount: Number(summary.total || 0)
          };
        } catch (error) {
          console.error(
            `Error fetching reviews for store ${store.StoreId}:`,
            error
          );

          return {
            ...store,
            RatingAverage: 0,
            ReviewCount: 0
          };
        }
      })
    );

    setStores(storesWithReviews);
    // ไม่ให้ร้านที่กำลังเลือกถูก reset
    setSelectedStore(prev => {
      if (
        prev &&
        storesWithReviews.some(
          store =>
            Number(store.StoreId) === Number(prev)
        )
      ) {
        return prev;
      }
      if (storesWithReviews.length > 0) {
        return Number(storesWithReviews[0].StoreId);
      }
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
        console.error("Fetch store reviews error:", data);
        setStoreReviewsList([]);
        return;
      }
      const reviews = Array.isArray(data)
        ? data
        : Array.isArray(data.reviews)
          ? data.reviews
          : [];

      setStoreReviewsList(reviews);

    } catch (error) {
      console.error("Error fetching store reviews:", error);
      setStoreReviewsList([]);
    } finally {
      setIsLoadingReviews(false);
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
    if (selectedStore) {
      fetchProducts();
    }
  }, [selectedStore, apiBase]);

  useEffect(() => {
    const pendingOutOfStock = myOrders.find(
      (ord) => ord.Status === "Pending_Cancellation" || ord.Status === "OutOfStock_Pending" || ord.Status === "Item_Unavailable"
    );
    if (pendingOutOfStock && !outOfStockOrder) {
      setOutOfStockOrder(pendingOutOfStock);
      if (pendingOutOfStock.StoreID || pendingOutOfStock.store_id) {
        setSelectedStore(pendingOutOfStock.StoreID || pendingOutOfStock.store_id);
      }
    }
  }, [myOrders, outOfStockOrder]);

  const getNotifKey = (n) => n.NotifId ?? n.NotificationID ?? n.id ?? `${n.Message}_${n.CreatedAt}`;

  useEffect(() => {
    if (notifs.length > 0 && !isInitialized) {
      const keys = notifs.map(n => getNotifKey(n));
      setReadNotifIds(keys);
      setIsInitialized(true);
    }
  }, [notifs, isInitialized]);

  const handleCancelOutOfStockOrder = async () => {
    if (!outOfStockOrder) return;
    try {
      const res = await fetch(`${apiBase}/api/orders/${outOfStockOrder.OrderID}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "ลูกค้าขอยกเลิกเนื่องจากวัตถุดิบหมด" })
      });
      if (res.ok) {
        alert("ยกเลิกคำสั่งซื้อเรียบร้อยแล้ว ระบบกำลังดำเนินการคืนเงิน");
        setOutOfStockOrder(null);
        setIsChangeMenuMode(false);
        fetchMyOrders();
      }
    } catch (error) {
      console.error("Error cancelling order:", error);
    }
  };

  const handleChangeOrderMenu = async () => {
    if (!outOfStockOrder || !newSelectedProduct) return;
    try {
      const res = await fetch(`${apiBase}/api/orders/${outOfStockOrder.OrderID}/change-item`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_product_id: newSelectedProduct.ProductId,
          new_product_name: newSelectedProduct.ProductName,
          unit_price: newSelectedProduct.UnitPrice
        })
      });
      if (res.ok) {
        alert("เปลี่ยนเมนูสำเร็จ! ระบบได้ส่งข้อมูลปรับเปลี่ยนไปยังหน้าร้านเรียบร้อยแล้ว");
        setOutOfStockOrder(null);
        setIsChangeMenuMode(false);
        setNewSelectedProduct(null);
        fetchMyOrders();
      }
    } catch (error) {
      console.error("Error changing menu:", error);
    }
  };

  const handleOpenStoreReviews = (e, store) => {
    e.stopPropagation();
    setSelectedStoreForReviews(store);
    fetchStoreReviews(store.StoreId);
  };

  const activeStore = stores.find(store => Number(store.StoreId) === Number(selectedStore)) || {};

  const handleSelectStore = (storeId) => {
    setSelectedStore(storeId);
    setViewMode("products");
  };

  const createCartRow = (product) => {
    const uniqueId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return { ...product, cartItemId: uniqueId, qty: 1, item_note: "" };
  };

  const addToCart = (product) => {
    setCart(prev => [...prev, createCartRow(product)]);
    setIsCartOpen(true);
  };

  const removeFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const increaseQty = (index) => {
    setCart(prev => {
      const item = prev[index];
      if (!item) return prev;
      const newItem = createCartRow(item);
      return [...prev.slice(0, index + 1), newItem, ...prev.slice(index + 1)];
    });
  };

  const decreaseQty = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const updateItemNote = (index, note) => {
    setCart(prev => prev.map((item, i) => i === index ? { ...item, item_note: note } : item));
  };

  const cartCount = useMemo(() => cart.length, [cart]);
  const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + Number(item.UnitPrice || 0), 0), [cart]);
  const totalSpentAmount = useMemo(() => {
    return myOrders.reduce((sum, ord) => sum + Number(ord.TotalAmount || 0), 0);
  }, [myOrders]);

  const filteredStores = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return stores;
    return stores.filter(store => String(store.StoreName || "").toLowerCase().includes(keyword));
  }, [stores, search]);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter(product => String(product.ProductName || "").toLowerCase().includes(keyword));
  }, [products, search]);

  const getCurrentTimeFormatted = () => {
    const now = new Date();
    return now.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " น.";
  };

  const getCurrentDateTimeForBackend = () => {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(now);

    const getPart = (type) => parts.find(p => p.type === type)?.value || "00";
    return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
  };

  const unreadNotifsCount = notifs.filter(notification => !readNotifIds.includes(getNotifKey(notification))).length;

  const handleSelectTab = (tabName) => {
    setActiveTab(tabName);
    if (tabName === "menu") setViewMode("stores");
    if (tabName === "notifs") {
      const currentKeys = notifs.map(notification => getNotifKey(notification));
      setReadNotifIds(prev => Array.from(new Set([...prev, ...currentKeys])));
    }
  };

  const handleProfileImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert("ขนาดไฟล์รูปโปรไฟล์ต้องไม่เกิน 5MB");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const maxWidth = 500;
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

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.8);
        setProfileImage(compressedBase64);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProfileImage = () => {
    if (window.confirm("คุณต้องการลบรูปโปรไฟล์ใช่หรือไม่?")) {
      setProfileImage(null);
    }
  };

  const handleSlipChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE) {
        alert("ขนาดไฟล์สลิปต้องไม่เกิน 5MB");
        e.target.value = "";
        return;
      }
      setSlipFile(file);
      setSlipPreview(URL.createObjectURL(file));
    }
  };

  const handleReviewImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert("ขนาดไฟล์รูปภาพต้องไม่เกิน 5MB");
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

  const handleProceedToPayment = () => {
    if (!isFoodCourtOpen) return alert("ขณะนี้ศูนย์อาหารปิดให้บริการชั่วคราว");
    if (cart.length === 0) return alert("กรุณาเลือกอาหารลงตะกร้าก่อนสั่งซื้อ");
    if (!selectedStore) return alert("กรุณาเลือกร้านอาหาร");
    setIsCartOpen(false);
    setIsPaymentModalOpen(true);
  };

  const submitOrder = async () => {
    if (isSubmittingOrder) return;

    if (paymentMethod === "PromptPay" && !slipFile) {
      return alert("กรุณาอัปโหลดรูปภาพสลิปชำระเงินก่อนกดส่งสั่งซื้อ");
    }

    const currentOrderTime = getCurrentDateTimeForBackend();
    const displayOrderTime = getCurrentTimeFormatted();
    const finalPickupTime = pickupTime ? `${pickupTime} น.` : displayOrderTime;

    const orderItems = cart.map(item => ({
      product_id: Number(item.ProductId),
      qty: 1,
      unit_price: Number(item.UnitPrice || 0),
      item_note: item.item_note || ""
    }));

    const orderData = {
      store_id: Number(selectedStore),
      user_id: userId,
      items: orderItems,
      payment_method: paymentMethod,
      slip_url: slipPreview || "slip_placeholder.png",
      note: orderNote || "",
      pickup_time: finalPickupTime,
      order_time: currentOrderTime
    };

    setIsSubmittingOrder(true);
    try {
      const res = await fetch(`${apiBase}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.detail || "ไม่สามารถสั่งซื้อได้");

      alert(`สั่งซื้อสำเร็จ!\n\nหมายเลขคิว: ${data.queue_no || "-"}\nเวลาที่สั่ง: ${displayOrderTime}\nเวลารับอาหาร: ${finalPickupTime}`);
      
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
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ Backend");
    } finally {
      setIsSubmittingOrder(false);
    }
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
          image_url: reviewImagePreview || ""
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return alert(data.detail || "ไม่สามารถส่งรีวิวได้");

      alert("ส่งรีวิวเรียบร้อยแล้ว ");
      setReviewedOrderIds(prev => ({
        ...prev,
        [reviewOrder.OrderID]: {
          rating: Number(rating),
          comment: reviewComment.trim() || "ไม่มีข้อความรีวิว",
          imageUrl: reviewImagePreview
        }
      }));
      setReviewOrder(null);
      setReviewComment("");
      setReviewImageFile(null);
      setReviewImagePreview(null);
      fetchMyOrders();
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการส่งรีวิว");
    }
  };

  // STYLES
  const pageStyle = { minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "'Prompt', 'Kanit', Arial, sans-serif" };
  const containerStyle = { width: "100%", maxWidth: "1450px", margin: "0 auto", padding: "20px 20px 110px", boxSizing: "border-box" };
  const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "15px", marginBottom: "25px", flexWrap: "wrap" };
  const logoStyle = { fontSize: "27px", fontWeight: "900", color: COLORS.navy, whiteSpace: "nowrap", cursor: "pointer" };
  const searchStyle = { flex: "1", minWidth: "220px", maxWidth: "560px", padding: "13px 20px", border: `1px solid ${COLORS.border}`, borderRadius: "30px", outline: "none", fontSize: "14px", background: COLORS.white, boxSizing: "border-box" };
  const profileStyle = { display: "flex", alignItems: "center", gap: "10px", background: COLORS.white, borderRadius: "30px", padding: "7px 14px 7px 7px", boxShadow: "0 4px 18px rgba(42,44,65,0.06)", cursor: "pointer" };
  const avatarStyle = { width: "40px", height: "40px", borderRadius: "50%", background: COLORS.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "19px", overflow: "hidden" };
  const heroStyle = { background: `linear-gradient(135deg, ${COLORS.orange}, ${COLORS.yellow})`, borderRadius: "28px", padding: "32px", color: COLORS.white, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", marginBottom: "28px", overflow: "hidden" };
  const cardStyle = { background: COLORS.white, borderRadius: "20px", padding: "13px", boxShadow: "0 7px 25px rgba(42,44,65,0.07)", border: `1px solid ${COLORS.border}` };

  const renderMenu = () => {
    return (
      <>
        <div style={heroStyle}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "600", marginBottom: "5px" }}>สวัสดี {fullName} 👋</div>
            <h1 style={{ margin: "0 0 8px", fontSize: "clamp(27px, 4vw, 40px)", fontWeight: "900" }}>หิวแล้วใช่ไหม?</h1>
            <p style={{ margin: 0, fontSize: "14px" }}>เลือกอาหารร้านโปรด แล้วสั่งได้ง่าย ๆ</p>
          </div>
          <div style={{ fontSize: "clamp(50px, 9vw, 90px)" }}>🍱</div>
        </div>

        {viewMode === "stores" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h2 style={{ margin: 0, fontSize: "23px", fontWeight: "900" }}>ร้านอาหารแนะนำ 🏬</h2>
              {isFoodCourtOpen && <span style={{ fontSize: "13px", color: COLORS.gray }}>{filteredStores.length} ร้านค้า</span>}
            </div>

            {!isFoodCourtOpen ? (
              <div
                style={{
                  ...cardStyle,
                  textAlign: "center",
                  padding: "60px 20px",
                  background: "#FFF0ED",
                  border: `1px solid ${COLORS.red}40`,
                  borderRadius: "24px"
                }}
              >
                <div style={{ fontSize: "55px", marginBottom: "12px" }}>🛑</div>
                <h3 style={{ fontSize: "22px", fontWeight: "900", color: COLORS.red, margin: "0 0 8px 0" }}>
                  ไม่สามารถสั่งอาหารได้เนื่องจากศูนย์อาหารปิด
                </h3>
                <p style={{ color: COLORS.gray, fontSize: "14px", margin: 0 }}>
                  ศูนย์อาหารปิดให้บริการชั่วคราว กรุณากลับมาใหม่ในเวลาทำการ
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                {filteredStores.map(store => {
                  const avgRating = Number(store.RatingAverage || store.rating || 0);
                  const totalReviews = Number(store.ReviewCount || store.review_count || 0);

                  return (
                    <div
                      key={store.StoreId}
                      onClick={() => handleSelectStore(store.StoreId)}
                      style={{
                        ...cardStyle,
                        cursor: "pointer",
                        transition: "transform 0.2s, box-shadow 0.2s",
                        display: "flex",
                        flexDirection: "column",
                        justify: "space-between"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-4px)";
                        e.currentTarget.style.boxShadow = "0 12px 30px rgba(42,44,65,0.12)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 7px 25px rgba(42,44,65,0.07)";
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

                        {/* ดาวรีวิวเฉลี่ย + ปุ่มดูรีวิวทั้งหมด */}
                        <div 
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justify: "space-between", 
                            background: "#FFF9F0", 
                            padding: "8px 12px", 
                            borderRadius: "12px", 
                            marginBottom: "10px",
                            border: `1px solid ${COLORS.yellow}50`
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                            <span style={{ color: COLORS.yellow, fontSize: "15px" }}>⭐</span>
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
                        <span style={{ color: COLORS.orange, fontWeight: "800", fontSize: "13px" }}>เลือกร้านนี้ ➔</span>
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
                เลือกร้านอื่น
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "18px" }}>
              {filteredProducts.map(product => (
                <div key={product.ProductId} style={{ ...cardStyle, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
                        <span style={{ color: COLORS.red, fontSize: "12px", fontWeight: "800" }}>❌ สินค้าหมด</span>
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
                🔍<br />ไม่พบเมนูอาหารในร้านนี้
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  const renderProfile = () => (
    <div>
      <h2 style={{ margin: "5px 0 20px", fontSize: "25px", fontWeight: "900" }}>โปรไฟล์ของฉัน 👤</h2>
      <div style={{ background: COLORS.white, borderRadius: "25px", padding: "30px 25px", maxWidth: "750px", margin: "0 auto 30px", boxShadow: "0 7px 25px rgba(42,44,65,0.07)", border: `1px solid ${COLORS.border}` }}>
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
                👤
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
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justify: "center",
                cursor: "pointer",
                boxShadow: "0 3px 10px rgba(0,0,0,0.2)",
                fontSize: "16px"
              }}
              title="เปลี่ยนรูปโปรไฟล์"
            >
               📷
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

        <div style={{ marginTop: "25px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 5px", borderBottom: `1px solid ${COLORS.border}`, fontSize: "14px" }}>
            <span> ชื่อผู้ใช้</span><strong>{fullName}</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 5px", borderBottom: `1px solid ${COLORS.border}`, fontSize: "14px" }}>
            <span> สั่งซื้อทั้งหมด</span><strong>{myOrders.length} รายการ</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 5px", borderBottom: `1px solid ${COLORS.border}`, fontSize: "14px" }}>
            <span> ยอดใช้จ่ายสะสมรวม</span><strong style={{ color: COLORS.green }}>{totalSpentAmount.toFixed(2)} ฿</strong>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "750px", margin: "0 auto" }}>
        <h3 style={{ fontSize: "20px", fontWeight: "900", marginBottom: "15px" }}>📜 ประวัติการสั่งซื้อและรีวิวของฉัน</h3>
        
        {myOrders.length === 0 ? (
          <div style={{ ...cardStyle, padding: "40px 20px", textAlign: "center", color: COLORS.gray }}>
            ยังไม่มีประวัติการสั่งซื้อ
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
                    🕐 เวลาสั่งซื้อ: {order.OrderTime || order.order_time || order.CreatedAt || "-"}
                  </div>

                  {order.items && order.items.length > 0 && (
                    <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: `1px dashed ${COLORS.border}` }}>
                      {order.items.map((item, index) => (
                        <div key={item.OrderDetailID || index} style={{ display: "flex", justifyContent: "space-between", gap: "10px", padding: "4px 0", fontSize: "13px" }}>
                          <div>
                            <b>• {item.ProductName}</b> <span style={{ color: COLORS.orange, fontWeight: "700" }}>x{item.Qty}</span>
                            {item.ItemNote && <div style={{ color: COLORS.gray, fontSize: "11px", marginLeft: "10px" }}>📝 {item.ItemNote}</div>}
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

  const renderOrders = () => (
    <div>
      <h2 style={{ margin: "5px 0 20px", fontSize: "25px", fontWeight: "900" }}>คำสั่งซื้อของฉัน 📋</h2>
      {myOrders.length === 0 ? (
        <div style={{ ...cardStyle, padding: "55px 20px", textAlign: "center", color: COLORS.gray }}>
          <div style={{ fontSize: "45px", marginBottom: "10px" }}>🛒</div>ยังไม่มีคำสั่งซื้อ
        </div>
      ) : (
        <div style={{ display: "grid", gap: "15px" }}>
          {myOrders.map(order => (
            <div key={order.OrderID} style={{ ...cardStyle, padding: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: COLORS.orange, fontSize: "20px", fontWeight: "900" }}>คิว #{order.QueueNo}</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", marginTop: "3px" }}>{order.StoreName}</div>
                </div>
                <span style={{ background: "#FFF0EB", color: COLORS.orange, padding: "7px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: "800" }}>
                  {order.Status || "Pending"}
                </span>
              </div>
              {(order.OrderTime || order.CreatedAt || order.order_time) && (
                <div style={{ marginTop: "12px", fontSize: "12px", color: COLORS.gray }}>
                  🕐 เวลาที่สั่ง: {order.OrderTime || order.order_time || order.CreatedAt}
                </div>
              )}
              {(order.PickupTime || order.pickup_time) && (
                <div style={{ marginTop: "5px", fontSize: "12px", color: COLORS.gray }}>
                  🍱 เวลารับอาหาร: {order.PickupTime || order.pickup_time}
                </div>
              )}
              {order.items && order.items.length > 0 && (
                <div style={{ marginTop: "18px", paddingTop: "15px", borderTop: `1px solid ${COLORS.border}` }}>
                  {order.items.map((item, index) => (
                    <div key={item.OrderDetailID || index} style={{ display: "flex", justifyContent: "space-between", gap: "15px", padding: "7px 0", fontSize: "13px" }}>
                      <div>
                        <b>{item.ProductName}</b> x{item.Qty}
                        {item.ItemNote && <div style={{ color: COLORS.gray, fontSize: "12px", marginTop: "3px" }}>📝 {item.ItemNote}</div>}
                      </div>
                      <span>{(Number(item.UnitPrice) * Number(item.Qty)).toFixed(2)} ฿</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${COLORS.border}`, fontWeight: "900" }}>
                <span>ยอดรวม</span>
                <span style={{ color: COLORS.orange, fontSize: "18px" }}>{order.TotalAmount} ฿</span>
              </div>
              {order.Status === "Completed" && (
                <button
                  onClick={() => handleOpenReviewModal(order)}
                  style={{ width: "100%", marginTop: "15px", padding: "11px", border: "none", borderRadius: "12px", background: COLORS.yellow, color: COLORS.navy, fontWeight: "800", cursor: "pointer", fontFamily: "inherit" }}
                >
                   {order.IsReviewed || order.review || reviewedOrderIds[order.OrderID] ? "ดูรีวิวของฉัน" : "ให้คะแนนและรีวิว"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderNotifications = () => (
    <div>
      <h2 style={{ margin: "5px 0 20px", fontSize: "25px", fontWeight: "900" }}>การแจ้งเตือน 🔔</h2>
      {notifs.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: "50px 20px", color: COLORS.gray }}>ไม่มีการแจ้งเตือน</div>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {notifs.map((notification, index) => (
            <div key={getNotifKey(notification) || index} style={{ ...cardStyle, padding: "18px", borderLeft: `5px solid ${COLORS.orange}` }}>
              <div style={{ fontWeight: "900", marginBottom: "6px" }}>🔔 Only Foods</div>
              <div style={{ color: COLORS.gray, fontSize: "13px" }}>{notification.Message}</div>
              {notification.CreatedAt && <div style={{ color: "#aaa", fontSize: "11px", marginTop: "8px" }}>{notification.CreatedAt}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderCart = () => {
    if (!isCartOpen) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.45)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={() => setIsCartOpen(false)}>
        <div onClick={e => e.stopPropagation()} style={{ width: "min(480px, 100%)", height: "100%", background: COLORS.white, overflowY: "auto", padding: "22px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "22px", fontWeight: "900" }}>ตะกร้าของฉัน 🛒</h2>
              {cart.length > 0 && <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "4px" }}>แต่ละรายการสามารถใส่หมายเหตุแยกกันได้</div>}
            </div>
            <button onClick={() => setIsCartOpen(false)} style={{ width: "36px", height: "36px", border: "none", borderRadius: "50%", background: COLORS.lightGray, cursor: "pointer", fontSize: "20px" }}>×</button>
          </div>

          {cart.length === 0 ? (
            <div style={{ textAlign: "center", padding: "70px 20px", color: COLORS.gray }}>
              <div style={{ fontSize: "55px" }}>🛒</div>
              <div style={{ marginTop: "10px" }}>ยังไม่มีสินค้าในตะกร้า</div>
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
                      <button onClick={() => removeFromCart(index)} style={{ alignSelf: "flex-start", border: "none", background: "none", cursor: "pointer", fontSize: "16px" }}>🗑️</button>
                    </div>
                    <div style={{ marginTop: "13px" }}>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: "800", color: COLORS.navy, marginBottom: "5px" }}>📝 หมายเหตุสำหรับรายการที่ {index + 1}</label>
                      <textarea value={item.item_note || ""} onChange={e => updateItemNote(index, e.target.value)} placeholder="เช่น ไม่เผ็ด, ไม่ใส่ผัก, หวานน้อย" rows={2} maxLength={255} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, outline: "none", resize: "vertical", fontFamily: "inherit", fontSize: "12px", background: COLORS.white }} />
                      <div style={{ textAlign: "right", fontSize: "10px", color: "#aaa", marginTop: "2px" }}>{(item.item_note || "").length}/255</div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: `2px solid ${COLORS.border}`, paddingTop: "20px" }}>
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>🕐 เวลารับอาหาร</label>
                  <input type="time" value={pickupTime} onChange={e => setPickupTime(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit" }} />
                  <div style={{ fontSize: "10px", color: COLORS.gray, marginTop: "5px" }}>หากไม่เลือก ระบบจะใช้เวลาปัจจุบันตอนกดสั่ง</div>
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>รายละเอียดเพิ่มเติมของออเดอร์</label>
                  <textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} placeholder="หมายเหตุเพิ่มเติมสำหรับทั้งออเดอร์" rows={2} style={{ width: "100%", boxSizing: "border-box", padding: "11px", borderRadius: "10px", border: `1px solid ${COLORS.border}`, fontFamily: "inherit", resize: "vertical" }} />
                </div>

                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "800", marginBottom: "5px" }}>💳 วิธีชำระเงิน</label>
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
                  disabled={!isFoodCourtOpen}
                  style={{ 
                    width: "100%", 
                    padding: "15px", 
                    marginTop: "15px", 
                    border: "none", 
                    borderRadius: "15px", 
                    background: isFoodCourtOpen ? COLORS.orange : "#CCCCCC", 
                    color: COLORS.white, 
                    fontSize: "16px", 
                    fontWeight: "900", 
                    cursor: isFoodCourtOpen ? "pointer" : "not-allowed",
                    fontFamily: "inherit" 
                  }}
                >
                  {isFoodCourtOpen ? "ถัดไป: ชำระเงิน ➔" : "ศูนย์อาหารปิดให้บริการชั่วคราว"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderPaymentModal = () => {
    if (!isPaymentModalOpen) return null;

    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }} onClick={() => setIsPaymentModalOpen(false)}>
        <div onClick={e => e.stopPropagation()} style={{ background: COLORS.white, width: "min(440px, 100%)", borderRadius: "24px", padding: "25px", boxSizing: "border-box", textAlign: "center" }}>
          
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900" }}>📲 ชำระเงินผ่าน QR Code</h3>
            <button onClick={() => setIsPaymentModalOpen(false)} style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}>×</button>
          </div>

          <div style={{ background: "#FFF9F5", padding: "15px", borderRadius: "15px", marginBottom: "15px", border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: "13px", color: COLORS.gray }}>ยอดชำระสุทธิ</div>
            <div style={{ fontSize: "28px", fontWeight: "900", color: COLORS.orange }}>{totalAmount.toFixed(2)} ฿</div>
          </div>

          <div style={{ margin: "15px 0", background: "#FFFFFF", padding: "15px", borderRadius: "16px", display: "inline-block", border: `2px solid ${COLORS.navy}` }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PromptPay_${totalAmount}`}
              alt="PromptPay QR Code"
              style={{ width: "180px", height: "180px", display: "block" }}
            />
            <div style={{ fontSize: "11px", color: COLORS.gray, marginTop: "8px", fontWeight: "700" }}>PromptPay (จำลองระบบ)</div>
          </div>

          <div style={{ marginTop: "15px", textAlign: "left" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "800", marginBottom: "6px" }}>
               แนบหลักฐานสลิปการโอนเงิน (ไม่เกิน 5MB):
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleSlipChange}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "10px",
                border: `1px dashed ${COLORS.orange}`,
                background: COLORS.bg,
                fontSize: "12px",
                boxSizing: "border-box"
              }}
            />
          </div>

          {slipPreview && (
            <div style={{ marginTop: "12px", textAlign: "center" }}>
              <div style={{ fontSize: "11px", color: COLORS.green, fontWeight: "800", marginBottom: "4px" }}>✓ เลือกรูปภาพเรียบร้อย</div>
              <img src={slipPreview} alt="Slip Preview" style={{ width: "120px", maxHeight: "160px", objectFit: "contain", borderRadius: "10px", border: `1px solid ${COLORS.border}` }} />
            </div>
          )}

          <button
            onClick={submitOrder}
            disabled={isSubmittingOrder}
            style={{
              width: "100%",
              padding: "15px",
              marginTop: "20px",
              border: "none",
              borderRadius: "15px",
              background: isSubmittingOrder ? "#BBBBBB" : COLORS.green,
              color: COLORS.white,
              fontSize: "16px",
              fontWeight: "900",
              cursor: isSubmittingOrder ? "not-allowed" : "pointer",
              fontFamily: "inherit"
            }}
          >
            {isSubmittingOrder ? "กำลังส่งคำสั่งซื้อ..." : "ยืนยันการโอนเงินและส่งสั่งซื้อ"}
          </button>
        </div>
      </div>
    );
  };

  const renderReviewModal = () => {
    if (!reviewOrder) return null;
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(42,44,65,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", boxSizing: "border-box" }} onClick={() => setReviewOrder(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: COLORS.white, width: "min(420px, 100%)", borderRadius: "22px", padding: "25px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "20px" }}>{isReadOnlyReview ? "📝 รีวิวของคุณ" : "⭐ ให้คะแนนร้าน"}</h3>
            <button onClick={() => setReviewOrder(null)} style={{ border: "none", background: COLORS.lightGray, width: "35px", height: "35px", borderRadius: "50%", cursor: "pointer", fontSize: "18px" }}>×</button>
          </div>
          <p style={{ color: COLORS.gray, fontSize: "13px" }}>คิว #{reviewOrder.QueueNo} • {reviewOrder.StoreName}</p>

          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <label style={{ fontSize: "14px", fontWeight: "800", display: "block", marginBottom: "8px" }}>คะแนนความพึงพอใจ</label>
            {isReadOnlyReview ? (
              <div style={{ fontSize: "30px" }}>
                {"⭐".repeat(Number(rating))}
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
                      ⭐
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

  const renderOutOfStockModal = () => {
    if (!outOfStockOrder) return null;

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(42,44,65,0.7)",
          zIndex: 3000,
          display: "flex",
          alignItems: "center",
          justify: "center",
          padding: "20px",
          boxSizing: "border-box"
        }}
      >
        <div style={{ background: COLORS.white, width: "min(460px, 100%)", borderRadius: "24px", padding: "25px", boxSizing: "border-box", textAlign: "center" }}>
          <div style={{ fontSize: "50px", marginBottom: "10px" }}></div>
          <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: COLORS.navy }}>
            สินค้าบางรายการหมด!
          </h3>
          <p style={{ color: COLORS.gray, fontSize: "13px", marginTop: "8px" }}>
            คิว #{outOfStockOrder.QueueNo} • ร้าน {outOfStockOrder.StoreName} แจ้งว่าวัตถุดิบในรายการหมดชั่วคราว
          </p>

          {!isChangeMenuMode ? (
            <div style={{ marginTop: "25px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <button
                onClick={() => setIsChangeMenuMode(true)}
                style={{
                  width: "100%",
                  padding: "14px",
                  border: "none",
                  borderRadius: "14px",
                  background: COLORS.orange,
                  color: COLORS.white,
                  fontWeight: "900",
                  fontSize: "15px",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                 เลือกระบุเมนูใหม่ทดแทน
              </button>

              <button
                onClick={handleCancelOutOfStockOrder}
                style={{
                  width: "100%",
                  padding: "14px",
                  border: `1px solid ${COLORS.red}`,
                  borderRadius: "14px",
                  background: "#FFF0ED",
                  color: COLORS.red,
                  fontWeight: "900",
                  fontSize: "15px",
                  cursor: "pointer",
                  fontFamily: "inherit"
                }}
              >
                 ยกเลิกออเดอร์นี้ (ขอคืนเงิน)
              </button>
            </div>
          ) : (
            <div style={{ marginTop: "20px", textAlign: "left" }}>
              <label style={{ fontSize: "13px", fontWeight: "800", color: COLORS.navy, display: "block", marginBottom: "8px" }}>
                เลือกเมนูทดแทนจากร้าน {outOfStockOrder.StoreName}:
              </label>

              <div style={{ maxHeight: "220px", overflowY: "auto", display: "grid", gap: "8px", marginBottom: "15px" }}>
                {products
                  .filter((p) => !p.IsOutOfStock)
                  .map((product) => (
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
                        justify: "space-between",
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
                  ))}
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => setIsChangeMenuMode(false)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "12px",
                    background: COLORS.lightGray,
                    color: COLORS.navy,
                    fontWeight: "800",
                    cursor: "pointer"
                  }}
                >
                  ย้อนกลับ
                </button>
                <button
                  onClick={handleChangeOrderMenu}
                  disabled={!newSelectedProduct}
                  style={{
                    flex: 2,
                    padding: "12px",
                    border: "none",
                    borderRadius: "12px",
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
                <div style={{ fontSize: "40px", marginBottom: "8px" }}></div>
                ยังไม่มีความคิดเห็นสำหรับร้านนี้
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {storeReviewsList.map((rev, index) => (
                  <div key={rev.ReviewID || index} style={{ background: COLORS.bg, padding: "14px", borderRadius: "16px", border: `1px solid ${COLORS.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontWeight: "800", fontSize: "13px" }}>{rev.ReviewerName || rev.CustomerName || rev.FullName || "ผู้ใช้บริการ"}</span>
                      <span style={{ fontSize: "11px", color: COLORS.gray }}>{rev.CreatedAt || rev.ReviewDate || ""}</span>
                    </div>
                    
                    <div style={{ fontSize: "14px", marginBottom: "6px" }}>
                      {"⭐".repeat(Number(rev.Rating || rev.rating || 5))}
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

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={logoStyle} onClick={() => handleSelectTab("menu")}>Only<span style={{ color: COLORS.orange }}>Foods</span></div>
            
            {/* Badge แสดงสถานะศูนย์อาหารเปิด-ปิด */}
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
              placeholder={viewMode === "stores" ? "🔍 ค้นหาร้านอาหาร..." : "🔍 ค้นหาเมนูอาหาร..."}
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
                "👤"
              )}
            </div>
            <div>
              <div style={{ fontSize: "13px", fontWeight: "800" }}>{fullName}</div>
            </div>
          </div>
        </header>

        {activeTab === "menu" && renderMenu()}
        {activeTab === "orders" && renderOrders()}
        {activeTab === "notifs" && renderNotifications()}
        {activeTab === "profile" && renderProfile()}
      </div>

      {/* FLOATING CART */}
      <button onClick={() => setIsCartOpen(true)} style={{ position: "fixed", right: "25px", bottom: "90px", width: "62px", height: "62px", border: "none", borderRadius: "50%", background: COLORS.orange, color: COLORS.white, fontSize: "26px", cursor: "pointer", zIndex: 500, boxShadow: "0 8px 25px rgba(255,114,76,0.35)" }}>
        🛒
        {cartCount > 0 && (
          <span style={{ position: "absolute", top: "-3px", right: "-3px", width: "23px", height: "23px", borderRadius: "50%", background: COLORS.navy, color: COLORS.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "900" }}>
            {cartCount}
          </span>
        )}
      </button>

      {/* BOTTOM NAVIGATION */}
      <div style={{ position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", background: COLORS.navy, borderRadius: "35px", padding: "7px", display: "flex", alignItems: "center", gap: "4px", zIndex: 600, boxShadow: "0 10px 35px rgba(42,44,65,0.25)", maxWidth: "calc(100vw - 30px)", overflowX: "auto" }}>
        <button onClick={() => handleSelectTab("menu")} style={{ border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "menu" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "menu" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span className="nav-text">หน้าแรก</span>
        </button>
        <button onClick={() => handleSelectTab("orders")} style={{ border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "orders" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "orders" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span className="nav-text">ออเดอร์</span>
        </button>
        <button onClick={() => handleSelectTab("notifs")} style={{ position: "relative", border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "notifs" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "notifs" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          🔔
          {unreadNotifsCount > 0 && (
            <span style={{ position: "absolute", top: "2px", right: "3px", minWidth: "17px", height: "17px", borderRadius: "50%", background: COLORS.red, color: COLORS.white, fontSize: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", padding: "0 3px", boxSizing: "border-box" }}>
              {unreadNotifsCount}
            </span>
          )}
        </button>
        <button onClick={() => handleSelectTab("profile")} style={{ border: "none", borderRadius: "28px", padding: "10px 17px", background: activeTab === "profile" ? COLORS.orange : "transparent", color: COLORS.white, fontFamily: "inherit", fontWeight: activeTab === "profile" ? "800" : "500", cursor: "pointer", whiteSpace: "nowrap" }}>
          <span className="nav-text">โปรไฟล์</span>
        </button>
      </div>

      {renderCart()}
      {renderPaymentModal()}
      {renderReviewModal()}
      {renderOutOfStockModal()}
      {renderStoreReviewsModal()}
    </div>
  );
}