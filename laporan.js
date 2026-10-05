// laporan.js - Laporan kehadiran kelas dalam format "page script" (window.PAGES.laporan).
// Logikanya sama dengan initLaporan() di script.js.
// CATATAN: router di script.js memprioritaskan modul lama (legacy[page] || pages[page]),
// jadi file ini TIDAK aktif sampai ia ditautkan di laporan.html dan initLaporan dihapus
// dari script.js. Dibiarkan dormant agar perilaku project awal tidak berubah.
(window.PAGES = window.PAGES || {}).laporan = async (App) => {
  const { db, $, esc, must, emptyRow, fetchAll } = App;

  const [mhs, abs] = await Promise.all([
    db.from("mahasiswa").select("*").order("kelas").order("nama").then(must),
    fetchAll(() => db.from("absensi").select("npm,status").order("id")),
  ]);

  const kosong = () => ({ Hadir: 0, Izin: 0, Sakit: 0, Alpa: 0 });
  const rekap = {};
  abs.forEach((a) => {
    const key = String(a.npm);
    rekap[key] = rekap[key] || kosong();
    if (rekap[key][a.status] !== undefined) rekap[key][a.status]++;
  });

  $("tbody").innerHTML = mhs.length
    ? mhs.map((m) => {
        const r = rekap[String(m.npm)] || kosong();
        const total = r.Hadir + r.Izin + r.Sakit + r.Alpa;
        const p = total ? Math.round((r.Hadir / total) * 100) : 0;
        return `<tr><td>${esc(m.nama)}</td><td>${esc(m.npm)}</td><td>${esc(m.kelas)}</td>
          <td>${r.Hadir}</td><td>${r.Izin}</td><td>${r.Sakit}</td><td>${r.Alpa}</td>
          <td><span class="bar"><i style="width:${p}%"></i></span>${p}%</td></tr>`;
      }).join("")
    : emptyRow(8, "Belum ada data.");
};
