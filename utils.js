// utils.js - helper umum, SALINAN dari bagian atas script.js.
// Belum dimuat oleh halaman mana pun; script.js tetap memakai versinya sendiri.
// Pemakaian (opsional): <script src="js/utils.js"></script> sebelum script halaman, lalu window.Utils.esc(...)
window.Utils = (() => {
  "use strict";
  const TZ = "Asia/Jakarta";
  const STATUS = ["Hadir", "Izin", "Sakit", "Alpa"];
  const $ = (id) => document.getElementById(id);

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
  const fmtDate = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const fmtLongDate = (d = new Date()) =>
    new Date(d).toLocaleDateString("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hm = (d = new Date()) =>
    new Date(d).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\./g, ":");
  const hms = (d = new Date()) =>
    new Date(d).toLocaleTimeString("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).replace(/\./g, ":");

  const emptyRow = (cols, msg) => `<tr><td class="empty" colspan="${cols}">${msg}</td></tr>`;
  const badge = (s) => `<span class="badge b-${esc(s)}">${esc(s)}</span>`;
  const must = ({ data, error }) => { if (error) throw error; return data; };

  let timer;
  function toast(msg, isErr) {
    const t = $("toast");
    if (!t) return;
    t.textContent = (isErr ? "✕ " : "✓ ") + msg;
    t.className = "show" + (isErr ? " err" : "");
    clearTimeout(timer);
    timer = setTimeout(() => (t.className = ""), 3500);
  }

  return { TZ, STATUS, $, esc, today, fmtDate, fmtLongDate, hm, hms, emptyRow, badge, must, toast };
})();
