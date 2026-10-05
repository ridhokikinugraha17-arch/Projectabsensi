(window.PAGES = window.PAGES || {}).admin = async (App) => {
  const { db, $, esc, must, toast, fail, emptyRow, badge, fmtDate, hm, today, TZ } = App;
  const cfg = (window.APP_CONFIG || {}).ATTENDANCE_LOCATION || {};
  const wib = (iso) =>
    new Date(iso).toLocaleString("id-ID", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\./g, ":");

  // ---------- Tab ----------
  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
      document.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    };
  });

  // ---------- Ringkasan ----------
  async function loadSummary() {
    const cnt = async (q) => { const { count, error } = await q; if (error) throw error; return count || 0; };
    const head = (t) => db.from(t).select("*", { count: "exact", head: true });
    const [users, hadir, telat, qr] = await Promise.all([
      cnt(head("profiles")),
      cnt(head("attendance").eq("tanggal", today())),
      cnt(head("attendance").eq("tanggal", today()).eq("status", "Terlambat")),
      cnt(head("attendance_qr").eq("is_active", true).gt("expires_at", new Date().toISOString())),
    ]);
    const items = [
      ["Total Pengguna", users, "fa-users", ""],
      ["Absen Hari Ini", hadir, "fa-user-check", ""],
      ["Terlambat Hari Ini", telat, "fa-clock", "background:var(--amber)"],
      ["QR Aktif", qr, "fa-qrcode", ""],
    ];
    $("sumCards").innerHTML = items.map(([l, v, i, s]) =>
      `<div class="card"><div class="ico" style="${s}"><i class="fa ${i}"></i></div><div><b>${v}</b><small>${l}</small></div></div>`).join("");
  }

  // ---------- QR generator ----------
  $("qTanggal").value = today();
  $("qMulai").value = "08:00";
  $("qSelesai").value = "10:00";
  $("qRadius").value = cfg.radius || 100;
  if (cfg.latitude != null) $("qLat").value = cfg.latitude;
  if (cfg.longitude != null) $("qLng").value = cfg.longitude;

  $("qGps").onclick = () => {
    if (!navigator.geolocation) return toast("Perangkat tidak mendukung GPS", true);
    $("qGps").disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        $("qLat").value = p.coords.latitude.toFixed(6);
        $("qLng").value = p.coords.longitude.toFixed(6);
        $("qGps").disabled = false;
        toast("Lokasi terisi");
      },
      () => { $("qGps").disabled = false; toast("Izin lokasi ditolak atau GPS mati", true); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const randCode = () => {
    const a = new Uint8Array(10);
    crypto.getRandomValues(a);
    const ch = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return `ATT-${new Date().getFullYear()}-` + [...a].map((x) => ch[x % ch.length]).join("");
  };

  function showQR(q) {
    if (!window.QRCode) return toast("Library QR gagal dimuat. Periksa koneksi internet.", true);
    $("qrOut").hidden = false;
    $("qrTitle").textContent = q.title;
    $("qrUntil").textContent = "QR berlaku sampai: " + hm(q.expires_at) + " WIB";
    // QR berisi link: kamera HP biasa langsung membuka halaman absen
    const url = new URL("attendance.html", location.href);
    url.searchParams.set("code", q.qr_code);
    $("qrCode").textContent = url.href;
    $("qrImg").innerHTML = "";
    new QRCode($("qrImg"), { text: url.href, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
    $("qrOut").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  $("qFull").onclick = () => $("qrOut").requestFullscreen?.();

  $("qForm").onsubmit = async (e) => {
    e.preventDefault();
    const title = $("qTitle").value.trim();
    const lat = parseFloat($("qLat").value);
    const lng = parseFloat($("qLng").value);
    const radius = parseInt($("qRadius").value, 10);
    const late = parseInt($("qLate").value, 10);
    const start = new Date(`${$("qTanggal").value}T${$("qMulai").value}:00+07:00`);
    const end = new Date(`${$("qTanggal").value}T${$("qSelesai").value}:00+07:00`);

    const problem =
      !title ? "Nama kegiatan wajib diisi." :
      !(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180) ? "Koordinat lokasi tidak valid." :
      !(radius >= 10 && radius <= 5000) ? "Radius harus 10 - 5000 meter." :
      isNaN(start) || isNaN(end) ? "Tanggal/waktu tidak valid." :
      end <= start ? "Waktu berakhir harus setelah waktu mulai." :
      end <= new Date() ? "Waktu berakhir sudah lewat." : "";
    if (problem) return toast(problem, true);

    const btn = $("qGen");
    btn.disabled = true;
    try {
      const row = await db.from("attendance_qr").insert({
        qr_code: randCode(), title, latitude: lat, longitude: lng, radius,
        starts_at: start.toISOString(), expires_at: end.toISOString(),
        late_after_minutes: isNaN(late) ? 15 : late,
      }).select().single().then(must);
      toast("QR berhasil dibuat");
      showQR(row);
      await loadQR();
      loadSummary().catch(fail);
    } catch (err) { fail(err); }
    finally { btn.disabled = false; }
  };

  let qrList = [];
  const qrState = (q) => {
    const n = Date.now();
    return !q.is_active ? "Nonaktif" : n > new Date(q.expires_at) ? "Expired" : n < new Date(q.starts_at) ? "Menunggu" : "Aktif";
  };

  async function loadQR() {
    qrList = await db.from("attendance_qr").select("*").order("created_at", { ascending: false }).limit(50).then(must);
    $("qBody").innerHTML = qrList.length
      ? qrList.map((q) => {
          const s = qrState(q);
          return `<tr>
            <td data-label="Kegiatan">${esc(q.title)}</td>
            <td data-label="Waktu">${wib(q.starts_at)} - ${hm(q.expires_at)}</td>
            <td data-label="Radius">${q.radius} m</td>
            <td data-label="Status">${badge(s)}</td>
            <td data-label="Aksi"><button class="btn s" data-show="${esc(q.id)}"><i class="fa fa-qrcode"></i> Tampilkan</button>
              <button class="btn s ${q.is_active ? "r" : "g"}" data-toggle="${esc(q.id)}">${q.is_active ? "Nonaktifkan" : "Aktifkan"}</button></td></tr>`;
        }).join("")
      : emptyRow(5, "Belum ada QR.");
  }

  $("qBody").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.show) {
      const q = qrList.find((x) => x.id === b.dataset.show);
      if (q) showQR(q);
    } else if (b.dataset.toggle) {
      const q = qrList.find((x) => x.id === b.dataset.toggle);
      if (!q) return;
      try {
        must(await db.from("attendance_qr").update({ is_active: !q.is_active }).eq("id", q.id));
        toast(q.is_active ? "QR dinonaktifkan" : "QR diaktifkan");
        await loadQR();
        loadSummary().catch(fail);
      } catch (err) { fail(err); }
    }
  };

  // ---------- Absensi semua user ----------
  let att = [];
  const attFiltered = () => {
    const q = $("aCari").value.trim().toLowerCase();
    const t = $("aTanggal").value;
    const s = $("aStatus").value;
    return att.filter((r) =>
      (!t || r.tanggal === t) && (!s || r.status === s) &&
      `${r.nama} ${r.email}`.toLowerCase().includes(q));
  };

  function renderAtt() {
    const rows = attFiltered();
    const shown = rows.slice(0, 200);
    $("aBody").innerHTML = shown.length
      ? shown.map((r) => {
          const map = Number.isFinite(r.latitude) && Number.isFinite(r.longitude)
            ? `<a href="https://www.google.com/maps?q=${r.latitude},${r.longitude}" target="_blank" rel="noopener noreferrer"><i class="fa fa-location-dot"></i> Peta</a>` : "-";
          return `<tr>
            <td data-label="Tanggal">${fmtDate(r.tanggal)}</td>
            <td data-label="Waktu">${esc(String(r.waktu).slice(0, 5))}</td>
            <td data-label="Nama">${esc(r.nama)}</td>
            <td data-label="Email">${esc(r.email)}</td>
            <td data-label="Status">${badge(r.status)}</td>
            <td data-label="Jarak">${Math.round(r.distance ?? 0)} m</td>
            <td data-label="Akurasi">${Math.round(r.accuracy ?? 0)} m</td>
            <td data-label="Lokasi">${map}</td></tr>`;
        }).join("")
      : emptyRow(8, "Tidak ada data absensi.");
    $("aInfo").textContent = `${rows.length} data` + (rows.length > 200 ? " (menampilkan 200 terbaru; ekspor CSV untuk semua)" : "");
  }

  async function loadAtt() {
    att = await App.fetchAll(() =>
      db.from("attendance").select("*").order("tanggal", { ascending: false }).order("waktu", { ascending: false }).order("id"));
    renderAtt();
  }
  ["aCari", "aTanggal", "aStatus"].forEach((id) => ($(id).oninput = renderAtt));

  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula injection di Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };
  $("aCsv").onclick = () => {
    const head = ["Tanggal", "Waktu", "Nama", "Email", "Status", "Jarak (m)", "Akurasi (m)", "Latitude", "Longitude", "QR"];
    const lines = attFiltered().map((r) =>
      [r.tanggal, String(r.waktu).slice(0, 8), r.nama, r.email, r.status, Math.round(r.distance ?? 0), Math.round(r.accuracy ?? 0), r.latitude, r.longitude, r.qr_code].map(cell).join(","));
    const blob = new Blob(["\ufeff" + [head.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `laporan-absensi-${today()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("aPrint").onclick = () => window.print();

  // ---------- Pengguna ----------
  async function loadUsers() {
    const list = await db.from("profiles").select("*").order("created_at", { ascending: false }).then(must);
    $("uBody").innerHTML = list.length
      ? list.map((u) =>
          `<tr><td data-label="Nama">${esc(u.full_name)}</td><td data-label="Email">${esc(u.email)}</td>
            <td data-label="Role">${badge(u.role)}</td>
            <td data-label="Status">${badge(u.is_active ? "Aktif" : "Nonaktif")}</td>
            <td data-label="Terdaftar">${fmtDate(String(u.created_at).slice(0, 10))}</td></tr>`).join("")
      : emptyRow(5, "Belum ada pengguna.");
  }

  await Promise.all([loadSummary(), loadQR(), loadAtt(), loadUsers()]).catch(fail);
};
