# Sistem Absensi

Aplikasi web statis (HTML/CSS/JS) + Supabase, siap di-deploy ke Vercel.
Fitur: login/register, absen mandiri lewat QR + GPS (radius), riwayat, dashboard, panel admin, serta modul lama (data mahasiswa, absensi kelas, laporan kelas) untuk admin.

## 1. Siapkan Supabase
1. Buat project di https://supabase.com
2. **SQL Editor** > tempel seluruh `supabase/schema.sql` > **Run** (aman dijalankan ulang)
3. **Project Settings > API**: salin Project URL dan anon/publishable key ke `js/config.js`
4. Pastikan akun admin Anda berperan admin:
   `select email, role from public.profiles;`
   Jika perlu: `update public.profiles set role = 'admin' where email = 'email-anda';`
5. **Authentication > Sign In / Providers > Email**: pastikan **Allow new users to sign up** AKTIF (register membutuhkannya). Opsional: matikan **Confirm email** agar user bisa langsung login setelah daftar.

## 2. Deploy ke Vercel
Push ke GitHub lalu import di vercel.com (Framework Preset: **Other**, Build Command dan Output Directory kosong), atau `npm i -g vercel && vercel --prod`.
Kamera dan GPS hanya berfungsi di **HTTPS** (Vercel otomatis) atau `localhost`.

## 3. Uji lokal
`npx serve .`

## Alur pakai
- Admin: **Panel Admin > QR Absensi** > isi kegiatan, waktu, lokasi, radius > GENERATE QR > tampilkan di layar.
- User: daftar/login > **Scan QR untuk Absen** > izinkan kamera dan lokasi.
- Validasi QR, masa berlaku, radius, dan absen ganda dicek ulang di server (fungsi `submit_attendance`).

## Keamanan
- Hanya `SUPABASE_URL` dan anon key yang ada di frontend. Jangan pakai service_role key di sini.
- RLS aktif: user hanya membaca absensinya sendiri; tabel QR dan data kelas hanya untuk admin; role tidak bisa diubah user.
- Catatan: koordinat GPS dikirim dari perangkat user, sehingga aplikasi seperti "fake GPS" masih bisa memalsukannya. Radius dan QR mengurangi kecurangan, tetapi tidak menghilangkannya sepenuhnya.
