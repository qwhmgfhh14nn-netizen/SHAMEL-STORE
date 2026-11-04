
/* SHAMEL Storefront - improved authentication and store flow */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  let db = null;
  let currentUser = null;
  let products = [];
  let categories = [];
  let favorites = new Set();
  let cart = [];
  let authBusy = false;

  function status(message, error = false) {
    const el = $("connection-status");
    if (!el) return;

    el.textContent = message;
    el.style.background = error ? "#fff0f0" : "#eef5f9";
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
    return new Intl.NumberFormat("ar-EG", {
      maximumFractionDigits: 2
    }).format(Number(value || 0)) + " " + (code || "EGP");
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
        <img src="${escapeHTML(imageFor(p))}"
             alt="${escapeHTML(p.name)}"
             loading="lazy"
             onerror="this.src='https://placehold.co/600x400?text=SHAMEL'">
        <div class="product-info">
          <h3>${escapeHTML(p.name)}</h3>
          <div class="muted">${escapeHTML(getCategoryName(p.category_id))}</div>
          <div class="price">${money(p.price, p.currency_code)}</div>
          <div class="muted">
            ${Number(p.stock) > 0 ? "متاح" : "غير متوفر حاليًا"}
          </div>
          <div class="product-actions">
            <button class="gold" onclick="SHAMEL.addCart('${p.id}')">أضف للسلة</button>
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
    $("products-empty")?.classList.toggle("hidden", list.length !== 0);
  }

  async function loadCategories() {
    if (!db) return;

    const { data, error } = await db
      .from("categories")
      .select("id,name_ar,name_en,image_url")
      .eq("is_active", true)
      .order("name_ar");

    if (error) {
      console.error("Categories:", error);
      return;
    }

    categories = data || [];

    const box = $("categories-list");
    if (box) {
      box.innerHTML = categories.map(c => `
        <button class="category"
          onclick="SHAMEL.filterCategory('${escapeHTML(c.name_ar || c.name_en)}')">
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
      status("بيانات الاتصال بقاعدة البيانات غير مكتملة.", true);
      return;
    }

    status("جارٍ تحميل المنتجات...");

    const { data, error } = await db
      .from("products")
      .select(`
        id,name,description,price,stock,images,
        category_id,currency_code,created_at
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
    renderFavorites();
    renderCart();

    status(
      products.length
        ? `تم تحميل ${products.length} منتجًا بنجاح.`
        : "الاتصال ناجح، ولا توجد منتجات منشورة حاليًا."
    );
  }

  async function loadFavorites() {
    if (!db || !currentUser) {
      favorites = new Set();
      renderProducts(products);
      renderFavorites();
      return;
    }

    const { data, error } = await db
      .from("favorites")
      .select("product_id")
      .eq("user_id", currentUser.id);

    if (error) {
      console.error("Favorites:", error);
      return;
    }

    favorites = new Set((data || []).map(x => x.product_id));
    renderProducts(products);
    renderFavorites();
  }

  function renderFavorites() {
    const list = products.filter(p => favorites.has(p.id));

    if ($("favorites-grid")) {
      $("favorites-grid").innerHTML = list.map(productCard).join("");
    }

    $("favorites-empty")?.classList.toggle(
      "hidden",
      list.length > 0
    );
  }

  async function toggleFavorite(id) {
    if (!currentUser) {
      alert("يمكنك تصفح المتجر كزائر. سجّل الدخول لإضافة المفضلة.");
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
        alert("تعذر حذف المنتج من المفضلة.");
        console.error(error);
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
        alert("تعذرت إضافة المنتج للمفضلة.");
        console.error(error);
        return;
      }

      favorites.add(id);
    }

    renderProducts(products);
    renderFavorites();
  }

  function saveCart() {
    try {
      localStorage.setItem("shamel_cart", JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }

  function loadCart() {
    try {
      cart = JSON.parse(localStorage.getItem("shamel_cart") || "[]");
      if (!Array.isArray(cart)) cart = [];
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
      cart.push({ id, quantity: 1 });
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
      : products.filter(p => getCategoryName(p.category_id) === name);

    renderProducts(filtered);
  }

  function showPage(id) {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.remove("active");
    });

    $(id)?.classList.add("active");

    document.querySelectorAll(".bottom-nav button").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.page === id);
    });

    if (id === "cart") renderCart();
    if (id === "favorites") renderFavorites();

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function refreshAuth() {
    if (!db) return;

    const { data, error } = await db.auth.getSession();

    if (error) {
      console.error("Session:", error);
      return;
    }

    currentUser = data?.session?.user || null;

    const authStatus = $("auth-status");
    if (authStatus) {
      authStatus.textContent = currentUser
        ? "مرحبًا بك، " + (currentUser.email || "في شامل")
        : "أنت تتصفح المتجر كزائر.";
    }

    $("auth-form")?.classList.toggle("hidden", !!currentUser);
    $("signed-in-panel")?.classList.toggle("hidden", !currentUser);

    await loadFavorites();
  }

  function friendlyAuthError(error) {
    const message = String(error?.message || "").toLowerCase();

    if (message.includes("invalid login credentials")) {
      return "البريد الإلكتروني أو كلمة المرور غير صحيحة. راجع البيانات أو استخدم نسيت كلمة المرور.";
    }

    if (message.includes("email not confirmed")) {
      return "لازم تأكد بريدك الإلكتروني من رسالة Supabase قبل تسجيل الدخول.";
    }

    if (message.includes("user already registered")) {
      return "هذا البريد مسجل بالفعل. جرّب تسجيل الدخول بدل إنشاء حساب جديد.";
    }

    if (message.includes("password should be at least")) {
      return "كلمة المرور قصيرة. استخدم 6 أحرف على الأقل.";
    }

    if (message.includes("rate limit") || message.includes("security purposes")) {
      return "طلبات كثيرة في وقت قصير. انتظر قليلًا ثم حاول مرة واحدة.";
    }

    if (message.includes("network") || message.includes("fetch")) {
      return "تعذر الاتصال بالإنترنت. تأكد من الاتصال وحاول مرة أخرى.";
    }

    return error?.message || "حدث خطأ غير متوقع. حاول مرة أخرى.";
  }

  async function authAction(action) {
    if (!db || authBusy) return;

    const email = $("auth-email")?.value.trim() || "";
    const password = $("auth-password")?.value || "";

    if (!email) {
      alert("اكتب بريدك الإلكتروني أولًا.");
      $("auth-email")?.focus();
      return;
    }

    if (action !== "reset" && !password) {
      alert("اكتب كلمة المرور.");
      $("auth-password")?.focus();
      return;
    }

    if (action === "signup" && password.length < 6) {
      alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      return;
    }

    const buttonId = {
      login: "login-btn",
      signup: "signup-btn",
      reset: "reset-btn"
    }[action];

    const button = $(buttonId);
    const oldText = button?.textContent;

    authBusy = true;
    if (button) {
      button.disabled = true;
      button.textContent = "يرجى الانتظار...";
    }

    try {
      let result;

      if (action === "login") {
        result = await db.auth.signInWithPassword({
          email,
          password
        });
      } else if (action === "signup") {
        result = await db.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin
          }
        });
      } else if (action === "reset") {
        result = await db.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin
        });
      }

      if (result?.error) {
        alert(friendlyAuthError(result.error));
        return;
      }

      if (action === "login") {
        if (result.data?.session) {
          currentUser = result.data.session.user;
          await refreshAuth();
          showPage("home");
          alert("تم تسجيل الدخول بنجاح. أهلًا بك في شامل!");
        } else {
          alert("لم يتم إنشاء جلسة دخول. راجع إعدادات الحساب وحاول مرة أخرى.");
        }
      }

      if (action === "signup") {
        if (result.data?.session) {
          await refreshAuth();
          showPage("home");
          alert("تم إنشاء حسابك وتسجيل الدخول بنجاح.");
        } else {
          alert("تم إنشاء الحساب. افتح بريدك الإلكتروني واضغط رابط تأكيد الحساب، ثم ارجع لتسجيل الدخول.");
        }
      }

      if (action === "reset") {
        alert("إذا كان البريد مسجلًا، ستصلك رسالة استعادة كلمة المرور. افحص الوارد والرسائل غير المرغوب فيها.");
      }
    } catch (error) {
      console.error("Authentication:", error);
      alert(friendlyAuthError(error));
    } finally {
      authBusy = false;
      if (button) {
        button.disabled = false;
        button.textContent = oldText || "متابعة";
      }
    }
  }

  async function logout() {
    if (!db) return;

    const { error } = await db.auth.signOut();

    if (error) {
      alert(friendlyAuthError(error));
      return;
    }

    currentUser = null;
    favorites = new Set();
    await refreshAuth();
    showPage("home");
    alert("تم تسجيل الخروج. يمكنك متابعة التصفح كزائر.");
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

        db.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") {
            alert("تم فتح رابط استعادة كلمة المرور. إعداد تغيير كلمة المرور داخل الموقع يحتاج استكمالًا.");
          }

          setTimeout(() => refreshAuth(), 0);
        });
      } catch (error) {
        console.error(error);
        status("حدث خطأ أثناء تشغيل الاتصال بقاعدة البيانات.", true);
      }
    } else {
      status("بيانات Supabase غير مكتملة في ملف الإعدادات.", true);
    }

    $("search")?.addEventListener("input", e => {
      const q = e.target.value.trim().toLowerCase();

      renderProducts(
        products.filter(p =>
          [p.name, p.description, getCategoryName(p.category_id)]
            .some(v => String(v || "").toLowerCase().includes(q))
        )
      );
    });

    $("login-btn")?.addEventListener("click", () => authAction("login"));
    $("signup-btn")?.addEventListener("click", () => authAction("signup"));
    $("reset-btn")?.addEventListener("click", () => authAction("reset"));
    $("logout-btn")?.addEventListener("click", logout);
  }

  window.showPage = showPage;
  window.loadProducts = loadProducts;
  window.filterCategory = filterCategory;

  window.SHAMEL = {
    addCart,
    toggleFavorite,
    changeQty,
    removeCart,
    filterCategory,
    showPage
  };

  document.addEventListener("DOMContentLoaded", init);
})();
