(window.PAGES = window.PAGES || {}).history = async (App) => {
  const { db, $, esc, must, fail, emptyRow, badge, fmtDate, user } = App;
  const PER = 10;
  let page = 1;

  const data = await db.from("attendance")
    .select("tanggal,waktu,status,distance,accuracy,qr_code")
    .eq("user_id", user.id)
    .order("tanggal", { ascending: false })
    .limit(1000)
    .then(must);

  const filtered = () => {
    const q = $("cari").value.trim().toLowerCase();
    const t = $("fTanggal").value;
    const s = $("fStatus").value;
    return data.filter((r) =>
      (!t || r.tanggal === t) &&
      (!s || r.status === s) &&
      `${fmtDate(r.tanggal)} ${r.tanggal} ${r.status} ${r.qr_code || ""}`.toLowerCase().includes(q));
  };

  function render() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / PER));
    page = Math.min(page, pages);
    const slice = rows.slice((page - 1) * PER, page * PER);

    $("tbody").innerHTML = slice.length
      ? slice.map((r) =>
          `<tr>
            <td data-label="Tanggal">${fmtDate(r.tanggal)}</td>
            <td data-label="Waktu">${esc(String(r.waktu).slice(0, 5))}</td>
            <td data-label="Status">${badge(r.status)}</td>
            <td data-label="Jarak">${Math.round(r.distance ?? 0)} m</td>
            <td data-label="Lokasi">${badge("Valid")}</td>
          </tr>`).join("")
      : emptyRow(5, "Belum ada riwayat absensi.");

    $("info").textContent = `${rows.length} data · halaman ${page} dari ${pages}`;
    $("prev").disabled = page <= 1;
    $("next").disabled = page >= pages;
  }

  ["cari", "fTanggal", "fStatus"].forEach((id) => ($(id).oninput = () => { page = 1; render(); }));
  $("prev").onclick = () => { page--; render(); };
  $("next").onclick = () => { page++; render(); };
  render();
};
