
/* SHAMEL Storefront - Fixed Supabase Integration */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  let db = null;
  let user = null;
  let products = [];
  let categories = [];
  let likes = new Set();
  let cart = [];

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[c]));

  const money = (n, c = "EGP") =>
    new Intl.NumberFormat("ar-EG").format(Number(n || 0)) + " " + c;

  function msg(t, error = false) {
    const el = $("connection-status");
    if (!el) return;
    el.textContent = t;
    el.style.background = error ? "#fee" : "#eef5f9";
  }

  function cat(id) {
    const x = categories.find(c => c.id === id);
    return x?.name_ar || x?.name_en || "";
  }

  function card(p) {
    const image = Array.isArray(p.images)
      ? p.images[0]
      : p.images || "https://placehold.co/500x350";

    return `
      <article class="product">
        <img src="${esc(image)}"
             onerror="this.src='https://placehold.co/500x350'">
        <div class="product-info">
          <b>${esc(p.name)}</b>
          <p class="muted">${esc(cat(p.category_id))}</p>
          <p class="price">${money(p.price, p.currency_code)}</p>
          <p class="muted">${Number(p.stock) > 0 ? "متاح" : "غير متوفر"}</p>
          <div class="actions">
            <button class="gold"
              ${Number(p.stock) <= 0 ? "disabled" : ""}
              onclick="SHAMEL.add('${esc(p.id)}')">
              أضف للسلة
            </button>
            <button onclick="SHAMEL.like('${esc(p.id)}')">
              ${likes.has(p.id) ? "♥" : "♡"}
            </button>
          </div>
        </div>
      </article>`;
  }

  function render(list = products) {
    const grid = $("products-grid");
    const empty = $("products-empty");

    if (grid) grid.innerHTML = list.map(card).join("");
    if (empty) empty.classList.toggle("hidden", !!list.length);
  }

  async function loadProducts() {
    if (!db) return msg("راجع إعدادات Supabase.", true);

    msg("جارٍ تحميل المنتجات...");

    const r = await db.from("products")
      .select("id,name,description,price,stock,images,category_id,currency_code,created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (r.error) {
      msg("تعذر تحميل المنتجات: " + r.error.message, true);
      return;
    }

    products = r.data || [];
    render();
    renderCart();
    renderLikes();
    msg(`تم تحميل ${products.length} منتجًا.`);
  }

  async function loadCats() {
    if (!db) return;

    const r = await db.from("categories")
      .select("id,name_ar,name_en")
      .eq("is_active", true)
      .order("name_ar");

    if (r.error) {
      console.error("Categories:", r.error);
      return;
    }

    categories = r.data || [];

    const list = $("categories-list");
    const empty = $("categories-empty");

    if (list) {
      list.innerHTML = categories.map(c => `
        <button onclick="SHAMEL.category('${esc(c.id)}')">
          ${esc(c.name_ar || c.name_en)}
        </button>
      `).join("");
    }

    if (empty) empty.classList.toggle("hidden", !!categories.length);
  }

  function save() {
    localStorage.setItem("shamel_cart", JSON.stringify(cart));
  }

  function add(id) {
    const p = products.find(x => x.id === id);

    if (!p || Number(p.stock) < 1)
      return alert("المنتج غير متاح.");

    const item = cart.find(x => x.id === id);

    if ((item?.quantity || 0) + 1 > Number(p.stock))
      return alert("الكمية المطلوبة غير متاحة.");

    if (item) item.quantity++;
    else cart.push({ id, quantity: 1 });

    save();
    renderCart();
    alert("تمت إضافة المنتج للسلة.");
  }

  function renderCart() {
    const box = $("cart-content");
    if (!box) return;

    cart = cart.filter(i => products.some(p => p.id === i.id));

    if (!cart.length) {
      box.innerHTML = '<div class="empty">السلة فارغة</div>';
      return;
    }

    const lines = cart.map(i => {
      const p = products.find(x => x.id === i.id);

      return `
        <div class="panel">
          <b>${esc(p.name)}</b>
          <p>${money(p.price, p.currency_code)} × ${i.quantity}</p>
          <div class="actions">
            <button onclick="SHAMEL.qty('${esc(p.id)}',-1)">−</button>
            <button onclick="SHAMEL.qty('${esc(p.id)}',1)">+</button>
            <button onclick="SHAMEL.del('${esc(p.id)}')">حذف</button>
          </div>
        </div>`;
    }).join("");

    const codes = [
      ...new Set(cart.map(i =>
        products.find(p => p.id === i.id)?.currency_code || "EGP"
      ))
    ];

    const total = cart.reduce((sum, i) => {
      const p = products.find(x => x.id === i.id);
      return sum + Number(p?.price || 0) * i.quantity;
    }, 0);

    box.innerHTML = lines + `
      <div class="panel">
        <b>الإجمالي: ${
          codes.length === 1 ? money(total, codes[0]) : "عملات متعددة"
        }</b>
        <textarea id="ship-address" rows="3"
          placeholder="عنوان التوصيل بالتفصيل"></textarea>
        <button class="gold" onclick="SHAMEL.checkout()">
          تأكيد الطلب والدفع عند الاستلام
        </button>
      </div>`;
  }

  function qty(id, change) {
    const item = cart.find(x => x.id === id);
    const p = products.find(x => x.id === id);

    if (!item || !p) return;

    if (item.quantity + change < 1) return del(id);

    if (item.quantity + change > Number(p.stock))
      return alert("المخزون غير كافٍ.");

    item.quantity += change;
    save();
    renderCart();
  }

  function del(id) {
    cart = cart.filter(x => x.id !== id);
    save();
    renderCart();
  }

  async function checkout() {
    if (!user) {
      alert("سجّل الدخول أولًا.");
      showPage("account");
      return;
    }

    const address = $("ship-address")?.value.trim() || "";

    if (address.length < 10)
      return alert("اكتب عنوان التوصيل بالتفصيل.");

    if (!cart.length)
      return alert("السلة فارغة.");

    const items = cart.map(i => ({
      product_id: i.id,
      quantity: i.quantity
    }));

    const { data, error } = await db.rpc("create_shamel_order", {
      p_items: items,
      p_shipping_address: address
    });

    if (error)
      return alert("لم يتم إنشاء الطلب: " + error.message);

    cart = [];
    save();
    renderCart();

    await loadProducts();
    await orders();

    alert("تم تسجيل الطلب بنجاح. رقم الطلب: " + String(data));
    showPage("orders");
  }

  async function orders() {
    const box = $("orders-content");
    if (!box) return;

    if (!user) {
      box.textContent = "سجّل الدخول لعرض طلباتك.";
      return;
    }

    const r = await db.from("orders")
      .select("id,total_amount,status,shipping_address,created_at,currency_code")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false });

    if (r.error) {
      box.textContent = "تعذر عرض الطلبات: " + r.error.message;
      return;
    }

    box.innerHTML = (r.data || []).map(o => `
      <div class="panel">
        <b>طلب #${esc(o.id)}</b>
        <p>${money(o.total_amount, o.currency_code)} — ${esc(o.status)}</p>
        <p>${esc(o.shipping_address)}</p>
      </div>
    `).join("") || "لا توجد طلبات.";
  }

  async function like(id) {
    if (!user) {
      alert("سجّل الدخول أولًا.");
      showPage("account");
      return;
    }

    const exists = likes.has(id);
    const query = db.from("favorites");

    const r = exists
      ? await query.delete().eq("user_id", user.id).eq("product_id", id)
      : await query.insert({ user_id: user.id, product_id: id });

    if (r.error) return alert(r.error.message);

    if (exists) likes.delete(id);
    else likes.add(id);

    render();
    renderLikes();
  }

  async function loadLikes() {
    likes.clear();

    if (user) {
      const r = await db.from("favorites")
        .select("product_id")
        .eq("user_id", user.id);

      if (!r.error)
        (r.data || []).forEach(x => likes.add(x.product_id));
    }

    render();
    renderLikes();
  }

  function renderLikes() {
    const grid = $("favorites-grid");
    const empty = $("favorites-empty");
    if (!grid) return;

    const list = products.filter(p => likes.has(p.id));
    grid.innerHTML = list.map(card).join("");

    if (empty) empty.classList.toggle("hidden", !!list.length);
  }

  async function refresh() {
    if (!db) return;

    const s = await db.auth.getSession();
    user = s.data?.session?.user || null;

    const status = $("auth-status");
    const form = $("auth-form");
    const panel = $("signed-in-panel");

    if (status)
      status.textContent = user
        ? "مرحبًا " + (user.email || user.phone || "")
        : "تتصفح كزائر";

    if (form) form.classList.toggle("hidden", !!user);
    if (panel) panel.classList.toggle("hidden", !user);

    await loadLikes();

    // متاح لملفات لوحة التحكم
    window.shamelUser = user;
  }

  async function auth(kind) {
    const email = $("auth-email")?.value.trim() || "";
    const password = $("auth-password")?.value || "";

    if (!email) return alert("اكتب البريد الإلكتروني.");
    if (kind !== "reset" && !password)
      return alert("اكتب كلمة المرور.");

    const r = kind === "login"
      ? await db.auth.signInWithPassword({ email, password })
      : kind === "signup"
        ? await db.auth.signUp({ email, password })
        : await db.auth.resetPasswordForEmail(email, {
            redirectTo: location.origin
          });

    if (r.error) return alert(r.error.message);

    if (kind === "reset") {
      alert("راجع بريدك الإلكتروني لرسالة استعادة كلمة المرور.");
    } else if (r.data.session) {
      await refresh();
      showPage("home");
      alert("تم تسجيل الدخول.");
    } else {
      alert("راجع بريدك الإلكتروني لتأكيد الحساب.");
    }
  }

  async function phoneSend() {
    const phone = $("auth-phone")?.value.trim() || "";

    if (!/^\+[1-9]\d{7,14}$/.test(phone))
      return alert("اكتب الرقم بالصيغة الدولية، مثل +201xxxxxxxxx.");

    const r = await db.auth.signInWithOtp({ phone });

    if (r.error) return alert(r.error.message);

    $("phone-verify-box")?.classList.remove("hidden");
    alert("تم إرسال رمز التحقق إذا كانت خدمة الرسائل مفعّلة.");
  }

  async function phoneVerify() {
    const phone = $("auth-phone")?.value.trim() || "";
    const token = $("phone-otp")?.value.trim() || "";

    if (!token) return alert("اكتب رمز التحقق.");

    const r = await db.auth.verifyOtp({
      phone,
      token,
      type: "sms"
    });

    if (r.error) return alert(r.error.message);

    await refresh();
    showPage("home");
  }

  function showPage(id) {
    document.querySelectorAll(".page")
      .forEach(x => x.classList.remove("active"));

    $(id)?.classList.add("active");

    document.querySelectorAll(".bottom-nav button")
      .forEach(x =>
        x.classList.toggle("active", x.dataset.page === id)
      );

    if (id === "cart") renderCart();
    if (id === "favorites") renderLikes();
    if (id === "orders") orders();

    window.scrollTo(0, 0);
  }

  function category(id) {
    showPage("home");
    render(products.filter(p => p.category_id === id));
  }

  function init() {
    try {
      cart = JSON.parse(localStorage.getItem("shamel_cart") || "[]");
      if (!Array.isArray(cart)) cart = [];
    } catch (e) {
      cart = [];
    }

    if (
      window.supabase &&
      typeof SUPABASE_URL !== "undefined" &&
      typeof SUPABASE_ANON_KEY !== "undefined" &&
      SUPABASE_URL &&
      SUPABASE_ANON_KEY
    ) {
      db = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
      );

      // توحيد أسماء الاتصال لجميع ملفات المشروع
      window.shamelSupabase = db;
      window.supabaseClient = db;

      loadCats();
      loadProducts();
      refresh();

      db.auth.onAuthStateChange(() => {
        setTimeout(refresh, 0);
      });
    } else {
      msg("إعدادات Supabase غير مكتملة.", true);
    }

    $("search")?.addEventListener("input", e => {
      const q = e.target.value.toLowerCase().trim();

      render(products.filter(p =>
        [p.name, p.description, cat(p.category_id)]
          .some(v => String(v || "").toLowerCase().includes(q))
      ));
    });

    $("login-btn")?.addEventListener("click", () => auth("login"));
    $("signup-btn")?.addEventListener("click", () => auth("signup"));
    $("reset-btn")?.addEventListener("click", () => auth("reset"));

    $("google-btn")?.addEventListener("click", async () => {
      const r = await db.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin }
      });

      if (r.error) alert(r.error.message);
    });

    $("phone-send-btn")?.addEventListener("click", phoneSend);
    $("phone-verify-btn")?.addEventListener("click", phoneVerify);

    $("logout-btn")?.addEventListener("click", async () => {
      const r = await db.auth.signOut();
      if (r.error) return alert(r.error.message);

      await refresh();
      showPage("home");
    });

    $("save-new-password-btn")?.addEventListener("click", async () => {
      const password = $("new-password")?.value || "";

      if (password.length < 6)
        return alert("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");

      const r = await db.auth.updateUser({ password });

      if (r.error) alert(r.error.message);
      else alert("تم تغيير كلمة المرور.");
    });
  }

  // واجهات عامة للصفحة والملفات الأخرى
  window.showPage = showPage;
  window.loadProducts = loadProducts;

  window.SHAMEL = {
    add,
    qty,
    del,
    like,
    checkout,
    category,
    refresh,
    orders,
    getUser: () => user,
    getProducts: () => products,
    getDB: () => db
  };

  document.addEventListener("DOMContentLoaded", init);
})();
