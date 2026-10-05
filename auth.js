// Util bersama untuk halaman login & register
window.Auth = (() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let timer;

  function toast(msg, isErr) {
    const t = $("toast");
    if (!t) return;
    t.textContent = (isErr ? "✕ " : "✓ ") + msg;
    t.className = "show" + (isErr ? " err" : "");
    clearTimeout(timer);
    timer = setTimeout(() => (t.className = ""), 3500);
  }

  function client() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
    if (!SUPABASE_URL || SUPABASE_URL.includes("GANTI") || !window.supabase) {
      const m = $("msg");
      if (m) m.textContent = "Konfigurasi belum lengkap. Isi js/config.js.";
      return null;
    }
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  function busy(btn, on, label) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.disabled = on;
    btn.classList.toggle("loading", on);
    btn.innerHTML = on && label ? label : btn.dataset.label;
  }

  function pwToggle() {
    document.querySelectorAll("[data-toggle-pw]").forEach((b) => {
      b.onclick = () => {
        const input = $(b.dataset.togglePw);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        b.innerHTML = `<i class="fa ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
        b.setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password");
      };
    });
  }

  const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

  // Pesan ramah; error teknis Supabase tidak ditampilkan mentah
  function friendly(error, ctx) {
    const m = String(error?.message || "");
    const c = String(error?.code || "");
    if (/failed to fetch|network|load failed/i.test(m)) return "Koneksi internet bermasalah. Coba lagi.";
    if (error?.status === 429 || /rate limit|too many/i.test(m + c)) return "Terlalu banyak percobaan. Tunggu beberapa menit.";
    if (/not confirmed/i.test(m)) return "Email belum dikonfirmasi. Cek kotak masuk email Anda.";
    if (/already|registered|exists/i.test(m + c)) return "Email sudah terdaftar. Silakan login.";
    if (/weak|password should/i.test(m + c)) return "Password terlalu lemah. Gunakan minimal 6 karakter.";
    if (/invalid/i.test(m + c)) return ctx === "register" ? "Data tidak valid. Periksa email dan password." : "Email atau password salah.";
    return ctx === "register" ? "Registrasi gagal. Silakan coba lagi." : "Login gagal. Silakan coba lagi.";
  }

  return { $, toast, client, busy, pwToggle, validEmail, friendly };
})();
