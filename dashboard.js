(window.PAGES = window.PAGES || {}).index = async (App) => {
  const { db, $, esc, profile, user, must, toast, fail, today, hm, hms, fmtLongDate } = App;

  // Profil
  $("uName").textContent = profile.full_name || user.email;
  $("uEmail").textContent = user.email;
  $("uStatus").textContent = "Status: " + (profile.is_active === false ? "Nonaktif" : "Aktif");

  // Jam realtime (Asia/Jakarta)
  const tick = () => {
    $("clock").textContent = hms();
    $("dateLong").textContent = fmtLongDate();
    const n = $("nowTime");
    if (n) n.textContent = hm() + " WIB";
  };
  tick();
  setInterval(tick, 1000);

  async function loadToday() {
    const rec = await db.from("attendance").select("*")
      .eq("user_id", user.id).eq("tanggal", today()).maybeSingle().then(must);
    const tgl = new Date().toLocaleDateString("id-ID", { timeZone: App.TZ, day: "2-digit", month: "long", year: "numeric" });

    if (rec) {
      $("todayCard").innerHTML = `
        <h3>Absensi Hari Ini</h3>
        <div class="state ok"><i class="fa fa-circle-check"></i> SUDAH ABSEN</div>
        <dl>
          <dt>Status</dt><dd>${App.badge(rec.status)}</dd>
          <dt>Tanggal</dt><dd>${tgl}</dd>
          <dt>Waktu</dt><dd>${esc(String(rec.waktu).slice(0, 5))} WIB</dd>
          <dt>Lokasi</dt><dd>Dalam radius (${Math.round(rec.distance)} m)</dd>
        </dl>`;
    } else {
      $("todayCard").innerHTML = `
        <h3>Absensi Hari Ini</h3>
        <div class="state no"><i class="fa fa-circle-exclamation"></i> Belum Absen</div>
        <dl>
          <dt>Tanggal</dt><dd>${tgl}</dd>
          <dt>Waktu</dt><dd id="nowTime">${hm()} WIB</dd>
          <dt>Lokasi</dt><dd>Belum diverifikasi</dd>
        </dl>
        <a class="btn scan-btn" href="attendance.html"><i class="fa fa-camera"></i> SCAN QR UNTUK ABSEN</a>`;
    }
  }

  async function loadStats() {
    const s = await db.rpc("my_stats").then(must);
    const items = [
      ["Total Kehadiran", s.total, "fa-calendar-check", ""],
      ["Hadir Bulan Ini", s.this_month, "fa-calendar-day", ""],
      ["Terlambat", s.late, "fa-clock", "background:var(--amber)"],
      ["Tidak Hadir", s.absent, "fa-user-xmark", "background:var(--red)"],
    ];
    $("stats").innerHTML = items.map(([l, v, i, st]) =>
      `<div class="card"><div class="ico" style="${st}"><i class="fa ${i}"></i></div><div><b>${v ?? 0}</b><small>${l}</small></div></div>`).join("");
  }

  await Promise.all([loadToday(), loadStats()]).catch((e) => {
    fail(e);
    toast("Pastikan supabase/schema.sql sudah dijalankan.", true);
  });
};
