(async () => {
  "use strict";
  const { $, toast, client, busy, pwToggle, validEmail, friendly } = window.Auth;
  const msg = $("msg");
  const db = client();
  pwToggle();
  if (!db) return;

  // Mengembalikan true bila user yang sedang login adalah admin aktif
  async function isAdmin(userId) {
    const { data, error } = await db.from("profiles").select("role,is_active").eq("id", userId).maybeSingle();
    if (error) console.error(error);
    return !!data && data.role === "admin" && data.is_active !== false;
  }

  const { data: { session } } = await db.auth.getSession();
  if (session) {
    if (await isAdmin(session.user.id)) return location.replace("admin.html");
    msg.textContent = "Anda sedang login sebagai pengguna biasa. Login ulang dengan akun admin.";
    await db.auth.signOut();
  }

  $("loginForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("masuk");
    const email = $("email").value.trim();
    const password = $("password").value;
    msg.textContent = "";

    if (!validEmail(email)) { msg.textContent = "Format email tidak valid."; return; }
    if (!password) { msg.textContent = "Password wajib diisi."; return; }

    busy(btn, true, "Memproses...");
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      console.error(error);
      msg.textContent = friendly(error, "login");
      toast(msg.textContent, true);
      busy(btn, false);
      return;
    }

    if (!(await isAdmin(data.user.id))) {
      await db.auth.signOut();
      msg.textContent = "Akun ini bukan admin. Gunakan halaman login pengguna.";
      toast("Akses admin ditolak", true);
      busy(btn, false);
      return;
    }

    toast("Login admin berhasil");
    setTimeout(() => location.replace("admin.html"), 500);
  };
})();
