// SHAMEL - Supabase connection
(function () {
  if (!window.supabase) {
    console.error("Supabase library is not loaded");
    return;
  }

  if (
    typeof SUPABASE_URL === "undefined" ||
    typeof SUPABASE_ANON_KEY === "undefined" ||
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY === "ضع_المفتاح_هنا"
  ) {
    console.error("Supabase configuration is incomplete");
    return;
  }

  try {
    window.shamelDB = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    console.log("SHAMEL database client initialized");
  } catch (error) {
    console.error("SHAMEL connection error:", error);
  }
})();