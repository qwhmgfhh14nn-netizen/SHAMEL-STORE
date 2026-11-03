// تشغيل اتصال SHAMEL مع Supabase
if (!window.supabase) {
  console.error("Supabase library is not loaded");
} else {
  const shamelDB = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

  window.shamelDB = shamelDB;
  console.log("SHAMEL database client initialized");
}