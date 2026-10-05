(async () => {
  "use strict";
  const { $, toast, client, busy, pwToggle, validEmail, friendly } = window.Auth;
  const msg = $("msg");
  const db = client();
  pwToggle();
  if (!db) return;

  // Tujuan setelah login: hanya link absen yang valid, selain itu dashboard
  const dest = () => {
    let n = "";
    try { n = sessionStorage.getItem("next") || ""; sessionStorage.removeItem("next"); } catch (_) {}
    return /^attendance\.html\?code=[A-Za-z0-9_-]{1,64}$/.test(n) ? n : "index.html";
  };

  const { data: { session } } = await db.auth.getSession();
  if (session) return location.replace(dest());

  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("masuk");
    const email = $("email").value.trim();
    const password = $("password").value;
    msg.textContent = "";

    if (!validEmail(email)) { msg.textContent = "Format email tidak valid."; return; }
    if (!password) { msg.textContent = "Password wajib diisi."; return; }

    busy(btn, true, "Memproses...");
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      console.error(error);
      msg.textContent = friendly(error, "login");
      toast(msg.textContent, true);
      busy(btn, false);
      return;
    }
    toast("Login berhasil");
    setTimeout(() => location.replace(dest()), 500);
  };
})();
