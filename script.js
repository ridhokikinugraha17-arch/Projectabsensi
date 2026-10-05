(async () => {
  "use strict";

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const page = document.body.dataset.page;
  const STATUS = ["Hadir", "Izin", "Sakit", "Alpa"];
  const TZ = "Asia/Jakarta";
  // Halaman yang hanya boleh dibuka admin
  const ADMIN_PAGES = ["admin", "mahasiswa", "absensi", "riwayat", "laporan"];

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // ---------- Waktu (Asia/Jakarta) ----------
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); // YYYY-MM-DD
  const fmtDate = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const fmtLongDate = (d = new Date()) =>
    new Date(d).toLocaleDateString("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hm = (d = new Date()) =>
    new Date(d).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\./g, ":");
  const hms = (d = new Date()) =>
    new Date(d).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":");

  // ---------- UI umum ----------
  let toastTimer;
  function toast(msg, isErr) {
    const t = $("toast");
    if (!t) return;
    t.textContent = (isErr ? "✕ " : "✓ ") + msg;
    t.className = "show" + (isErr ? " err" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = ""), 3500);
  }

  // Error dari Supabase (punya code/details) tidak ditampilkan mentah
  function friendly(e) {
    const m = String(e?.message || "");
    if (e?.code === "42501" || /row-level security|permission denied/i.test(m)) return "Anda tidak memiliki izin untuk aksi ini.";
    if (/failed to fetch|network|load failed/i.test(m)) return "Koneksi internet bermasalah.";
    if (/jwt|token/i.test(m)) return "Sesi berakhir. Silakan login kembali.";
    if (e?.code || e?.details || e?.hint) return "Terjadi kesalahan. Silakan coba lagi.";
    return m || "Terjadi kesalahan";
  }
  const fail = (e) => {
    console.error(e);
    toast(friendly(e), true);
  };

  if (!SUPABASE_URL || SUPABASE_URL.includes("GANTI") || !window.supabase) {
    toast("Isi SUPABASE_URL dan SUPABASE_ANON_KEY di js/config.js", true);
    return;
  }

  const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ---------- Auth guard ----------
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    // Simpan link absen (?code=...) agar dilanjutkan setelah login
    if (page === "attendance" && /[?&]code=/.test(location.search)) {
      try { sessionStorage.setItem("next", "attendance.html" + location.search); } catch (_) {}
    }
    location.replace("login.html");
    return;
  }

  db.auth.onAuthStateChange((ev) => {
    if (ev === "SIGNED_OUT") location.replace("login.html");
  });

  const must = ({ data, error }) => {
    if (error) throw error;
    return data;
  };

  // ---------- Profil & role ----------
  const user = session.user;
  let profile = null;
  try {
    profile = await db.from("profiles").select("*").eq("id", user.id).maybeSingle().then(must);
  } catch (e) {
    console.error("Gagal membaca tabel profiles. Sudah menjalankan supabase/schema.sql?", e);
  }
  profile = profile || {
    id: user.id,
    full_name: user.user_metadata?.full_name || (user.email || "").split("@")[0],
    email: user.email,
    role: "user",
    is_active: true,
  };

  if (profile.is_active === false) {
    toast("Akun Anda dinonaktifkan.", true);
    await db.auth.signOut();
    return;
  }

  const isAdmin = profile.role === "admin";
  if (ADMIN_PAGES.includes(page) && !isAdmin) {
    location.replace("index.html");
    return;
  }

  // ---------- Sidebar, header, bottom nav ----------
  const MENU_USER = [
    ["index", "Dashboard", "fa-gauge"],
    ["attendance", "Absen QR", "fa-qrcode"],
    ["history", "Riwayat Saya", "fa-clock-rotate-left"],
  ];
  const MENU_ADMIN = [
    ["admin", "Panel Admin", "fa-user-shield"],
    ["mahasiswa", "Data Mahasiswa", "fa-users"],
    ["absensi", "Absensi Kelas", "fa-clipboard-check"],
    ["riwayat", "Riwayat Kelas", "fa-clock-rotate-left"],
    ["laporan", "Laporan Kelas", "fa-file-lines"],
  ];
  const href = (p) => (p === "index" ? "index.html" : p + ".html");
  const link = ([p, l, i]) =>
    `<a href="${href(p)}" class="${p === page ? "on" : ""}"><i class="fa ${i}"></i>${l}</a>`;

  $("sidebar").innerHTML =
    `<div class="brand"><i class="fa fa-fingerprint"></i><div>Sistem Absensi</div></div>` +
    MENU_USER.map(link).join("") +
    (isAdmin ? `<div class="sec">Admin</div>` + MENU_ADMIN.map(link).join("") : "");

  const bn = [
    ["index", "Beranda", "fa-house"],
    ["attendance", "Scan", "fa-qrcode"],
    ["history", "Riwayat", "fa-clock-rotate-left"],
  ];
  if (isAdmin) bn.push(["admin", "Admin", "fa-user-shield"]);
  const nav = document.createElement("nav");
  nav.className = "bnav";
  nav.innerHTML = bn
    .map(([p, l, i]) =>
      `<a href="${href(p)}" class="${p === page ? "on" : ""} ${p === "attendance" ? "scan" : ""}"><i class="fa ${i}"></i>${l}</a>`)
    .join("");
  document.body.appendChild(nav);

  $("menuBtn").onclick = (e) => {
    e.stopPropagation();
    $("sidebar").classList.toggle("open");
  };
  $("sidebar").addEventListener("click", (e) => e.stopPropagation());
  document.querySelector(".main")?.addEventListener("click", () => $("sidebar").classList.remove("open"));

  const name = profile.full_name || user.email;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const avatar = /^https:\/\//.test(profile.avatar_url || "")
    ? `<img src="${esc(profile.avatar_url)}" alt="">`
    : esc(initials);
  document.querySelector(".nav > span").innerHTML =
    `<span class="usr"><span class="av">${avatar}</span><span class="un">${esc(name)}</span>
      <button class="btn r s" id="logout"><i class="fa fa-right-from-bracket"></i><b class="lt">Keluar</b></button></span>`;
  $("logout").onclick = () => db.auth.signOut();

  document.body.classList.add("ready");

  const emptyRow = (cols, msg) => `<tr><td class="empty" colspan="${cols}">${msg}</td></tr>`;
  const badge = (s) => `<span class="badge b-${esc(s)}">${esc(s)}</span>`;

  // Ambil semua baris (batas Supabase 1000 baris/permintaan)
  async function fetchAll(make) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const r = await make().range(from, from + 999).then(must);
      out.push(...r);
      if (r.length < 1000) break;
    }
    return out;
  }

  // Dibagikan ke script halaman (dashboard.js, attendance.js, history.js, admin.js)
  const App = {
    db, user, profile, isAdmin, $, esc, must, toast, fail, emptyRow, badge, fetchAll,
    STATUS, TZ, today, fmtDate, fmtLongDate, hm, hms,
  };
  window.App = App;

  // ---------- Kartu data kelas (dashboard admin) ----------
  async function legacyCards() {
    const box = $("legacy");
    if (!box || !$("cards")) return;
    box.hidden = false;
    const [mhs, abs] = await Promise.all([
      db.from("mahasiswa").select("kelas").then(must),
      db.from("absensi").select("status").eq("tanggal", today()).then(must),
    ]);
    const hadir = abs.filter((a) => a.status === "Hadir").length;
    const items = [
      ["Total Mahasiswa", mhs.length, "fa-users", ""],
      ["Jumlah Kelas", new Set(mhs.map((m) => m.kelas)).size, "fa-school", ""],
      ["Hadir Hari Ini (Kelas)", hadir, "fa-user-check", ""],
      ["Tidak Hadir Hari Ini", abs.length - hadir, "fa-user-xmark", "background:var(--red)"],
    ];
    $("cards").innerHTML = items
      .map(([l, v, i, s]) =>
        `<div class="card"><div class="ico" style="${s}"><i class="fa ${i}"></i></div><div><b>${v}</b><small>${l}</small></div></div>`)
      .join("");
  }

  // ---------- Data Mahasiswa ----------
  async function initMahasiswa() {
    let list = [];
    let editId = null;
    const f = { npm: $("npm"), nama: $("nama"), kelas: $("kelas"), prodi: $("prodi") };

    function render() {
      const q = $("cari").value.toLowerCase();
      const rows = list.filter((m) => [m.npm, m.nama, m.kelas, m.prodi].join(" ").toLowerCase().includes(q));
      $("tbody").innerHTML = rows.length
        ? rows.map((m, i) =>
            `<tr><td>${i + 1}</td><td>${esc(m.npm)}</td><td>${esc(m.nama)}</td><td>${esc(m.kelas)}</td><td>${esc(m.prodi)}</td>
              <td><button class="btn y s" data-edit="${esc(m.id)}"><i class="fa fa-pen"></i> Ubah</button>
              <button class="btn r s" data-del="${esc(m.id)}"><i class="fa fa-trash"></i> Hapus</button></td></tr>`).join("")
        : emptyRow(6, "Belum ada data mahasiswa.");
    }

    async function load() {
      list = await db.from("mahasiswa").select("*").order("kelas").order("nama").then(must);
      render();
    }

    function reset() {
      editId = null;
      $("form").reset();
      $("formTitle").textContent = "Tambah Mahasiswa";
      $("batal").hidden = true;
    }

    $("form").onsubmit = async (e) => {
      e.preventDefault();
      const row = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
      try {
        if (editId) must(await db.from("mahasiswa").update(row).eq("id", editId));
        else must(await db.from("mahasiswa").insert(row));
        toast(editId ? "Data diperbarui" : "Mahasiswa ditambahkan");
        reset();
        await load();
      } catch (err) {
        fail(err.code === "23505" ? new Error("NPM sudah terdaftar") : err);
      }
    };

    $("batal").onclick = reset;
    $("cari").oninput = render;

    $("tbody").onclick = async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.edit) {
        const m = list.find((x) => String(x.id) === String(b.dataset.edit));
        if (!m) return;
        editId = m.id;
        Object.keys(f).forEach((k) => (f[k].value = m[k] ?? ""));
        $("formTitle").textContent = "Ubah Mahasiswa";
        $("batal").hidden = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (b.dataset.del && confirm("Hapus mahasiswa ini beserta riwayat absensinya?")) {
        try {
          const m = list.find((x) => String(x.id) === String(b.dataset.del));
          if (m?.npm != null) {
            const { error } = await db.from("absensi").delete().eq("npm", m.npm);
            if (error) throw error;
          }
          must(await db.from("mahasiswa").delete().eq("id", b.dataset.del));
          toast("Mahasiswa dihapus");
          await load();
        } catch (err) {
          fail(err);
        }
      }
    };

    await load();
  }

  // ---------- Absensi kelas ----------
  async function initAbsensi() {
    $("tanggal").value = today();
    let students = [];

    async function loadKelas() {
      const data = await db.from("mahasiswa").select("kelas").then(must);
      const kelas = [...new Set(data.map((d) => d.kelas))].filter(Boolean).sort();
      $("kelas").innerHTML = kelas.length
        ? kelas.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("")
        : `<option value="">Belum ada kelas</option>`;
    }

    async function loadStudents() {
      const kelas = $("kelas").value;
      const tgl = $("tanggal").value;
      if (!kelas || !tgl) {
        $("tbody").innerHTML = emptyRow(4, "Pilih tanggal dan kelas.");
        return;
      }
      students = await db.from("mahasiswa").select("id,npm,nama,kelas").eq("kelas", kelas).order("nama").then(must);
      const saved = await db.from("absensi").select("npm,status").eq("tanggal", tgl).eq("kelas", kelas).then(must);
      const map = Object.fromEntries(saved.map((s) => [String(s.npm), s.status]));

      $("tbody").innerHTML = students.length
        ? students.map((s, i) =>
            `<tr><td>${i + 1}</td><td>${esc(s.npm)}</td><td>${esc(s.nama)}</td>
              <td><select data-id="${esc(s.id)}">${STATUS.map((st) =>
                `<option ${st === (map[String(s.npm)] || "Hadir") ? "selected" : ""}>${st}</option>`).join("")}</select></td></tr>`).join("")
        : emptyRow(4, "Tidak ada mahasiswa di kelas ini.");
    }

    $("kelas").onchange = () => loadStudents().catch(fail);
    $("tanggal").onchange = () => loadStudents().catch(fail);

    $("simpan").onclick = async () => {
      const tgl = $("tanggal").value;
      const kelas = $("kelas").value;
      const selects = [...document.querySelectorAll("#tbody select")];
      if (!selects.length) return toast("Tidak ada data untuk disimpan", true);

      const rows = selects.map((s) => {
        const st = students.find((m) => String(m.id) === String(s.dataset.id));
        return { tanggal: tgl, npm: st.npm, nama: st.nama, kelas: st.kelas, status: s.value };
      });

      $("simpan").disabled = true;
      try {
        const { error } = await db.from("absensi").delete().eq("tanggal", tgl).eq("kelas", kelas);
        if (error) throw error;
        must(await db.from("absensi").insert(rows));
        toast("Absensi tersimpan");
        await loadStudents();
      } catch (err) {
        fail(err);
      } finally {
        $("simpan").disabled = false;
      }
    };

    await loadKelas();
    await loadStudents();
  }

  // ---------- Riwayat kelas ----------
  async function initRiwayat() {
    const data = await db
      .from("absensi")
      .select("tanggal,npm,nama,kelas,status")
      .order("tanggal", { ascending: false })
      .limit(1000)
      .then(must);

    function render() {
      const q = $("cari").value.toLowerCase();
      const t = $("fTanggal").value;
      const s = $("fStatus").value;
      const rows = data.filter(
        (r) =>
          (!t || r.tanggal === t) &&
          (!s || r.status === s) &&
          `${r.npm} ${r.nama} ${r.kelas}`.toLowerCase().includes(q)
      );
      $("tbody").innerHTML = rows.length
        ? rows.map((r, i) =>
            `<tr><td>${i + 1}</td><td>${fmtDate(r.tanggal)}</td><td>${esc(r.npm)}</td><td>${esc(r.nama)}</td><td>${esc(r.kelas)}</td><td>${badge(r.status)}</td></tr>`).join("")
        : emptyRow(6, "Tidak ada riwayat yang cocok.");
    }

    ["cari", "fTanggal", "fStatus"].forEach((id) => {
      if ($(id)) $(id).oninput = render;
    });
    render();
  }

  // ---------- Laporan kelas ----------
  async function initLaporan() {
    const [mhs, abs] = await Promise.all([
      db.from("mahasiswa").select("*").order("kelas").order("nama").then(must),
      fetchAll(() => db.from("absensi").select("npm,status").order("id")), // lebih dari 1000 baris tetap lengkap
    ]);

    const rekap = {};
    abs.forEach((a) => {
      const key = String(a.npm);
      rekap[key] = rekap[key] || { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
      if (rekap[key][a.status] !== undefined) rekap[key][a.status]++;
    });

    $("tbody").innerHTML = mhs.length
      ? mhs.map((m) => {
          const r = rekap[String(m.npm)] || { Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 };
          const total = r.Hadir + r.Izin + r.Sakit + r.Alpa;
          const p = total ? Math.round((r.Hadir / total) * 100) : 0;
          return `<tr><td>${esc(m.nama)}</td><td>${esc(m.npm)}</td><td>${esc(m.kelas)}</td>
            <td>${r.Hadir}</td><td>${r.Izin}</td><td>${r.Sakit}</td><td>${r.Alpa}</td>
            <td><span class="bar"><i style="width:${p}%"></i></span>${p}%</td></tr>`;
        }).join("")
      : emptyRow(8, "Belum ada data.");
  }

  // ---------- Router ----------
  // Script halaman baru mendaftar di window.PAGES (dimuat SEBELUM script.js)
  const legacy = { mahasiswa: initMahasiswa, absensi: initAbsensi, riwayat: initRiwayat, laporan: initLaporan };
  const pages = window.PAGES || {};

  async function run() {
    if (page === "index") {
      await pages.index?.(App);
      if (isAdmin) await legacyCards();
      return;
    }
    await (legacy[page] || pages[page])?.(App);
  }
  run().catch(fail);
})();
