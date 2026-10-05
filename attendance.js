(window.PAGES = window.PAGES || {}).attendance = async (App) => {
  const { db, $, esc, must, toast, hm } = App;
  let scanner = null;
  let busy = false;

  const MSG = {
    invalid: "QR Code tidak valid.\nSilakan gunakan QR Code absensi resmi.",
    inactive: "QR Code ini sudah dinonaktifkan oleh admin.",
    expired: "QR Code sudah kedaluwarsa.",
    not_started: "Sesi absensi belum dibuka.",
    bad_location: "Data lokasi tidak valid. Coba lagi.",
    inactive_user: "Akun Anda dinonaktifkan.",
    already: "Anda sudah melakukan absensi hari ini.",
  };

  const haversine = (a, b, c, d) => {
    const R = 6371000, r = (x) => (x * Math.PI) / 180;
    const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };

  const STEPS = [
    ["qr", "fa-qrcode", "Verifikasi QR Code"],
    ["gps", "fa-location-crosshairs", "Ambil lokasi GPS"],
    ["radius", "fa-bullseye", "Cek radius lokasi"],
    ["save", "fa-floppy-disk", "Simpan absensi"],
  ];
  const ICON = { run: "fa-spinner", ok: "fa-circle-check", bad: "fa-circle-xmark", idle: "" };

  function renderSteps(state = {}) {
    $("steps").innerHTML = STEPS.map(([k, i, l]) => {
      const s = state[k] || "idle";
      return `<li class="${s}"><i class="fa ${ICON[s] || i}"></i>${l}</li>`;
    }).join("");
  }

  function result(ok, text, rows) {
    $("result").hidden = false;
    $("result").className = "result " + (ok ? "ok" : "bad");
    $("result").innerHTML =
      `<b>${ok ? "✓" : "✕"} ${esc(text)}</b>` +
      (rows ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "");
  }

  async function stopScanner() {
    if (!scanner) return;
    try { if (scanner.isScanning) await scanner.stop(); scanner.clear(); } catch (_) { /* abaikan */ }
    scanner = null;
    $("reader").hidden = true;
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject({ code: 0 });
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
      });
    });
  }

  const gpsMsg = (e) =>
    e?.code === 1 ? "Izin lokasi ditolak. Aktifkan GPS dan izinkan akses lokasi di browser."
    : e?.code === 3 ? "Waktu pengambilan lokasi habis. Coba lagi di area terbuka."
    : e?.code === 2 ? "Lokasi tidak tersedia. Pastikan GPS aktif."
    : "Perangkat ini tidak mendukung GPS.";

  // QR bisa berisi link (?code=...) atau kode polos (QR lama / input manual)
  function extractCode(raw) {
    const t = String(raw || "").trim();
    try {
      const c = new URL(t).searchParams.get("code");
      if (c) return c.trim();
    } catch (_) { /* bukan URL */ }
    return t;
  }

  async function process(raw) {
    const code = extractCode(raw);
    const st = {};
    $("result").hidden = true;
    const upd = (k, v) => { st[k] = v; renderSteps(st); };

    try {
      // 1. QR
      upd("qr", "run");
      const info = await db.rpc("check_qr", { p_code: code }).then(must);
      if (!info.ok) {
        upd("qr", "bad");
        toast("QR tidak valid", true);
        return result(false, MSG[info.code] || MSG.invalid);
      }
      upd("qr", "ok");
      toast("QR berhasil diverifikasi");

      // 2. GPS
      upd("gps", "run");
      let pos;
      try { pos = await getPosition(); }
      catch (e) { upd("gps", "bad"); toast("Lokasi gagal diambil", true); return result(false, gpsMsg(e)); }
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      upd("gps", "ok");
      toast("Lokasi berhasil diperoleh");

      // 3. Radius (validasi ulang juga dilakukan di server)
      upd("radius", "run");
      const jarak = haversine(info.latitude, info.longitude, lat, lng);
      const rows = [
        ["Kegiatan", info.title],
        ["Jarak", Math.round(jarak) + " meter"],
        ["Radius", info.radius + " meter"],
        ["Akurasi GPS", Math.round(accuracy) + " meter"],
      ];
      if (jarak > info.radius) {
        upd("radius", "bad");
        toast("Lokasi di luar radius", true);
        return result(false, "Lokasi tidak valid\nAnda berada di luar area absensi.", rows);
      }
      upd("radius", "ok");
      toast("Lokasi berhasil diverifikasi");

      // 4. Cek absen hari ini + simpan
      upd("save", "run");
      if (info.already) {
        upd("save", "bad");
        toast("Anda sudah melakukan absensi hari ini", true);
        return result(false, MSG.already);
      }
      const res = await db.rpc("submit_attendance", {
        p_code: code, p_lat: lat, p_lng: lng, p_accuracy: accuracy,
      }).then(must);

      if (!res.ok) {
        upd("save", "bad");
        if (res.code === "out_of_radius") {
          toast("Lokasi di luar radius", true);
          return result(false, "Lokasi tidak valid\nAnda berada di luar area absensi.",
            [["Jarak", Math.round(res.distance) + " meter"], ["Radius", res.radius + " meter"]]);
        }
        toast(MSG[res.code]?.split("\n")[0] || "Absensi gagal", true);
        return result(false, MSG[res.code] || "Absensi gagal disimpan. Silakan coba lagi.");
      }
      upd("save", "ok");
      toast("Absensi berhasil disimpan");
      result(true, "Absensi berhasil", [
        ["Status", res.status],
        ["Waktu", String(res.waktu).slice(0, 5) + " WIB"],
        ["Jarak", Math.round(res.distance) + " meter (radius " + res.radius + " m)"],
        ["Kegiatan", res.title],
      ]);
      $("startBtn").hidden = true;
    } catch (e) {
      console.error(e);
      result(false, "Terjadi kesalahan. Periksa koneksi lalu coba lagi.");
      toast("Absensi gagal", true);
    }
  }

  async function startScan() {
    if (busy) return;
    if (!window.Html5Qrcode) return toast("Pemindai QR gagal dimuat. Periksa koneksi internet.", true);
    $("result").hidden = true;
    renderSteps();
    $("reader").hidden = false;
    $("startBtn").disabled = true;
    scanner = new Html5Qrcode("reader");
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.75); return { width: s, height: s }; } },
        async (text) => {
          if (busy) return;
          busy = true;
          await stopScanner();
          await process(text);
          busy = false;
          $("startBtn").disabled = false;
        },
        () => {}
      );
      $("hint").textContent = "Arahkan kamera ke QR Code absensi.";
    } catch (e) {
      console.error(e);
      await stopScanner();
      $("startBtn").disabled = false;
      toast("Kamera tidak dapat dibuka. Izinkan akses kamera di browser.", true);
      result(false, "Izin kamera ditolak atau kamera tidak tersedia.\nAnda dapat memakai input kode manual di bawah.");
    }
  }

  $("startBtn").onclick = startScan;
  $("manualBtn").onclick = async () => {
    const v = $("manual").value.trim();
    if (!v) return toast("Masukkan kode QR", true);
    if (busy) return;
    busy = true;
    await stopScanner();
    await process(v);
    busy = false;
  };
  window.addEventListener("pagehide", stopScanner);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopScanner().then(() => ($("startBtn").disabled = false)); });

  renderSteps();
  $("clockNow").textContent = hm() + " WIB";

  // Dibuka dari scan kamera HP: ?code=... -> langsung diproses
  const urlCode = new URLSearchParams(location.search).get("code");
  if (urlCode) {
    history.replaceState(null, "", location.pathname); // kode tidak tertinggal di address bar
    busy = true;
    await process(urlCode);
    busy = false;
  }
};
