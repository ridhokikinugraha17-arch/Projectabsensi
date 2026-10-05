(async () => {
  "use strict";
  const { $, toast, client, busy, pwToggle, validEmail, friendly } = window.Auth;
  const msg = $("msg");
  const db = client();
  pwToggle();
  if (!db) return;

  const { data: { session } } = await db.auth.getSession();
  if (session) return location.replace("index.html");

  $("regForm").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("daftar");
    const nama = $("nama").value.trim();
    const email = $("email").value.trim();
    const password = $("password").value;
    const konfirmasi = $("konfirmasi").value;
    msg.textContent = "";

    const problem =
      !nama ? "Nama lengkap wajib diisi." :
      !validEmail(email) ? "Format email tidak valid." :
      password.length < 6 ? "Password minimal 6 karakter." :
      password !== konfirmasi ? "Konfirmasi password tidak sama." : "";
    if (problem) { msg.textContent = problem; return; }

    busy(btn, true, "Mendaftarkan...");
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: { data: { full_name: nama } },
    });

    // Email sudah dipakai: dengan konfirmasi email aktif, Supabase mengembalikan
    // user tanpa identities (bukan error).
    const dupe = data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
    if (error || dupe) {
      if (error) console.error(error);
      msg.textContent = dupe ? "Email sudah terdaftar. Silakan login." : friendly(error, "register");
      toast(msg.textContent, true);
      busy(btn, false);
      return;
    }

    const autoLogin = !!data.session;
    if (autoLogin) await db.auth.signOut(); // konfirmasi email nonaktif -> sesi dibuat otomatis
    toast("Registrasi berhasil. Silakan login." + (autoLogin ? "" : " Cek email untuk konfirmasi."));
    setTimeout(() => location.replace("login.html"), 1800);
  };
})();
