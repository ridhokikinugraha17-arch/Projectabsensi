// Isi dengan data dari Supabase: Project Settings > API
// Anon key aman dipakai di frontend selama RLS aktif (lihat supabase/schema.sql)
// JANGAN pernah menaruh service_role key di file ini.
window.APP_CONFIG = {
  SUPABASE_URL: "https://lsoxapobxpttlkllgroz.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_pD9tdGgwtJXISKO8enKLWg_82-XETtl",

  // Nilai awal form "Buat QR" di panel admin (bisa diubah per QR).
  // Isi latitude/longitude kampus Anda; radius dalam meter.
  ATTENDANCE_LOCATION: {
    latitude: null,   // contoh: -5.123456
    longitude: null,  // contoh: 105.123456
    radius: 100
  }
};
