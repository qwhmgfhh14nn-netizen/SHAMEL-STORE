
/* SHAMEL storefront - uses the existing Supabase schema */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  let db = null;
  let currentUser = null;
  let products = [];
  let categories = [];
  let favorites = new Set();
  let cart = [];

  function status(message, error) {
    const el = $("connection-status");
    if (el) {
      el.textContent = message;
      el.style.background = error ? "#fff0f0" : "#eef5f9";
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function money(value, code) {
    const n = Number(value || 0);
    return new Intl.NumberFormat("ar-EG", {
      maximumFractionDigits: 2
    }).format(n) + " " + (code || "EGP");
  }

  function imageFor(p) {
    const raw = Array.isArray(p.images) ? p.images[0] : p.images;
    return raw || "https://placehold.co/600x400?text=SHAMEL";
  }

  function getCategoryName(id) {
    const c = categories.find(x => x.id === id);
    return c ? (c.name_ar || c.name_en || "") : "";
  }

  function productCard(p) {
    const liked = favorites.has(p.id);

    return `
      <article class="product">
        <img
          src="${escapeHTML(imageFor(p))}"
          alt="${escapeHTML(p.name)}"
          loading="lazy"
          onerror="this.src='https://placehold.co/600x400?text=SHAMEL'"
        >
        <div class="product-info">
          <h3>${escapeHTML(p.name)}</h3>
          <div class="muted">${escapeHTML(getCategoryName(p.category_id))}</div>
          <div class="price">${money(p.price, p.currency_code)}</div>
          <div class="muted">
            ${Number(p.stock) > 0 ? "متاح" : "غير متوفر حاليًا"}
          </div>
          <div class="product-actions">
            <button class="gold" onclick="SHAMEL.addCart('${p.id}')">
              أضف للسلة
            </button>
            <button class="light" onclick="SHAMEL.toggleFavorite('${p.id}')">
              ${liked ? "♥" : "♡"}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts(list) {
    const grid = $("products-grid");
    if (!grid) return;

    grid.innerHTML = list.map(productCard).join("");

    $("products-empty")?.classList.toggle(
      "hidden",
      list.length !== 0
    );
  }

  async function loadCategories() {
    if (!db) return;

    const { data, error } = await db
      .from("categories")
      .select("id,name_ar,name_en,image_url")
      .eq("is_active", true)
      .order("name_ar");

    if (error) {
      console.error(error);
      return;
    }

    categories = data || [];

    const box = $("categories-list");

    if (box) {
      box.innerHTML = categories.map(c => `
        <button
          class="category"
          onclick="SHAMEL.filterCategory('${String(c.name_ar || c.name_en).replace(/'/g, "\\'")}')"
        >
          ${escapeHTML(c.name_ar || c.name_en)}
        </button>
      `).join("");
    }

    $("categories-empty")?.classList.toggle(
      "hidden",
      categories.length > 0
    );
  }

  async function loadProducts() {
    if (!db) {
      status(
        "إعداد الاتصال بقاعدة البيانات غير مكتمل. راجع supabase-config.js.",
        true
      );
      return;
    }

    status("جارٍ تحميل المنتجات...");

    const { data, error } = await db
      .from("products")
      .select(`
        id,
        name,
        description,
        price,
        stock,
        images,
        category_id,
        currency_code,
        created_at
      `)
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Products:", error);
      status("تعذر تحميل المنتجات: " + error.message, true);
      return;
    }

    products = data || [];
    renderProducts(products);

    status(
      products.length
        ? `تم تحميل ${products.length} منتجًا.`
        : "الاتصال بقاعدة البيانات ناجح، ولا توجد منتجات منشورة حاليًا."
    );
  }

  async function loadFavorites() {
    if (!db || !currentUser) {
      favorites = new Set();
      renderFavorites();
      return;
    }

    const { data, error } = await db
      .from("favorites")
      .select("product_id")
      .eq("user_id", currentUser.id);

    if (error) {
      console.error(error);
      return;
    }

    favorites = new Set(
      (data || []).map(x => x.product_id)
    );

    renderProducts(products);
    renderFavorites();
  }

  function renderFavorites() {
    const list = products.filter(p => favorites.has(p.id));

    if ($("favorites-grid")) {
      $("favorites-grid").innerHTML =
        list.map(productCard).join("");
    }

    $("favorites-empty")?.classList.toggle(
      "hidden",
      list.length > 0
    );
  }

  async function toggleFavorite(id) {
    if (!currentUser) {
      alert("سجّل الدخول أولًا لإضافة المنتجات للمفضلة.");
      showPage("account");
      return;
    }

    if (favorites.has(id)) {
      const { error } = await db
        .from("favorites")
        .delete()
        .eq("user_id", currentUser.id)
        .eq("product_id", id);

      if (error) {
        alert("تعذر الحذف: " + error.message);
        return;
      }

      favorites.delete(id);
    } else {
      const { error } = await db
        .from("favorites")
        .insert({
          user_id: currentUser.id,
          product_id: id
        });

      if (error) {
        alert("تعذر الإضافة: " + error.message);
        return;
      }

      favorites.add(id);
    }

    renderProducts(products);
    renderFavorites();
  }

  function saveCart() {
    try {
      localStorage.setItem(
        "shamel_cart",
        JSON.stringify(cart)
      );
    } catch (_) {}
  }

  function loadCart() {
    try {
      cart = JSON.parse(
        localStorage.getItem("shamel_cart") || "[]"
      );
    } catch (_) {
      cart = [];
    }
  }

  function addCart(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;

    const found = cart.find(x => x.id === id);

    if (found) {
      found.quantity += 1;
    } else {
      cart.push({
        id,
        quantity: 1
      });
    }

    saveCart();
    renderCart();
    alert("تمت إضافة المنتج إلى السلة.");
  }

  function renderCart() {
    const box = $("cart-content");
    if (!box) return;

    if (!cart.length) {
      box.innerHTML = `
        <div class="empty">
          <div class="symbol">🛒</div>
          <h3>سلتك فارغة</h3>
          <p>أضف المنتجات التي تريد شراءها.</p>
        </div>
      `;
      return;
    }

    let total = 0;

    const rows = cart.map(item => {
      const p = products.find(x => x.id === item.id);
      if (!p) return "";

      total += Number(p.price) * item.quantity;

      return `
        <div class="panel">
          <b>${escapeHTML(p.name)}</b>
          <p>${money(p.price, p.currency_code)} × ${item.quantity}</p>
          <div class="actions">
            <button class="light" onclick="SHAMEL.changeQty('${p.id}',-1)">−</button>
            <button class="light" onclick="SHAMEL.changeQty('${p.id}',1)">+</button>
            <button class="light" onclick="SHAMEL.removeCart('${p.id}')">حذف</button>
          </div>
        </div>
      `;
    }).join("");

    box.innerHTML = rows + `
      <div class="panel">
        <b>الإجمالي التقريبي: ${money(total)}</b>
        <p class="muted">
          إتمام الطلب سيتم تفعيله بعد استكمال بيانات الشحن وربط إنشاء الطلبات.
        </p>
      </div>
    `;
  }

  function changeQty(id, delta) {
    const item = cart.find(x => x.id === id);
    if (!item) return;

    item.quantity += delta;

    if (item.quantity <= 0) {
      cart = cart.filter(x => x.id !== id);
    }

    saveCart();
    renderCart();
  }

  function removeCart(id) {
    cart = cart.filter(x => x.id !== id);
    saveCart();
    renderCart();
  }

  function filterCategory(name) {
    showPage("home");

    const found = categories.find(
      c => (c.name_ar || c.name_en) === name
    );

    const filtered = found
      ? products.filter(p => p.category_id === found.id)
      : products.filter(
          p => getCategoryName(p.category_id) === name
        );

    renderProducts(filtered);
  }

  function showPage(id, button) {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active");
    });

    $(id)?.classList.add("active");

    document.querySelectorAll(".bottom-nav button").forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.page === id
      );
    });

    if (id === "cart") renderCart();
    if (id === "favorites") renderFavorites();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  async function refreshAuth() {
    if (!db) return;

    const { data } = await db.auth.getSession();

    currentUser = data?.session?.user || null;

    $("auth-status").textContent = currentUser
      ? "تم تسجيل الدخول: " + (currentUser.email || "حسابك")
      : "أنت تتصفح كزائر.";

    $("auth-form")?.classList.toggle(
      "hidden",
      !!currentUser
    );

    $("signed-in-panel")?.classList.toggle(
      "hidden",
      !currentUser
    );

    await loadFavorites();
  }

  async function authAction(action) {
    if (!db) {
      alert("الاتصال بقاعدة البيانات غير جاهز.");
      return;
    }

    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;

    if (
      action !== "reset" &&
      (!email || !password)
    ) {
      alert("اكتب البريد الإلكتروني وكلمة المرور.");
      return;
    }

    let result;

    if (action === "login") {
      result = await db.auth.signInWithPassword({
        email,
        password
      });
    }

    if (action === "signup") {
      result = await db.auth.signUp({
        email,
        password
      });
    }

    if (action === "reset") {
      if (!email) {
        alert("اكتب بريدك الإلكتروني أولًا.");
        return;
      }

      result = await db.auth.resetPasswordForEmail(email);
    }

    if (result?.error) {
      alert(result.error.message);
      return;
    }

    if (action === "signup") {
      alert(
        "تم إرسال طلب إنشاء الحساب. راجع بريدك الإلكتروني إذا كان تأكيد البريد مفعّلًا."
      );
    } else if (action === "reset") {
      alert(
        "إذا كان البريد مسجلًا، ستصلك رسالة استعادة كلمة المرور."
      );
    } else {
      alert("تم تسجيل الدخول.");
    }

    await refreshAuth();
  }

  function init() {
    loadCart();
    renderCart();

    if (
      window.supabase &&
      typeof SUPABASE_URL !== "undefined" &&
      typeof SUPABASE_ANON_KEY !== "undefined" &&
      SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      SUPABASE_ANON_KEY !== "ضع_المفتاح_هنا"
    ) {
      try {
        db = window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_ANON_KEY
        );

        window.shamelDB = db;

        loadCategories();
        loadProducts();
        refreshAuth();

        db.auth.onAuthStateChange(() => {
          setTimeout(refreshAuth, 0);
        });
      } catch (e) {
        console.error(e);
        status("حدث خطأ أثناء تشغيل الاتصال.", true);
      }
    } else {
      status(
        "بيانات Supabase غير مكتملة في ملف الإعدادات.",
        true
      );
    }

    $("search")?.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();

      renderProducts(
        products.filter(p =>
          [
            p.name,
            p.description,
            getCategoryName(p.category_id)
          ].some(v =>
            String(v || "").toLowerCase().includes(q)
          )
        )
      );
    });

    $("login-btn")?.addEventListener(
      "click",
      () => authAction("login")
    );

    $("signup-btn")?.addEventListener(
      "click",
      () => authAction("signup")
    );

    $("reset-btn")?.addEventListener(
      "click",
      () => authAction("reset")
    );

    $("logout-btn")?.addEventListener(
      "click",
      async () => {
        const { error } = await db.auth.signOut();

        if (error) {
          alert(error.message);
        }

        await refreshAuth();
      }
    );
  }

  window.showPage = showPage;
  window.loadProducts = loadProducts;

  window.SHAMEL = {
    addCart,
    toggleFavorite,
    changeQty,
    removeCart,
    filterCategory
  };

  document.addEventListener(
    "DOMContentLoaded",
    init
  );
})();
