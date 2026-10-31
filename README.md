# Bookmark Bar 2 Baris

Ekstensi Chrome buatan sendiri: bookmark bar ditampilkan dalam 2 baris (bisa 1–4) di atas halaman.

![Bookmark bar 2 baris](screenshots/bar-light.png)

| Menu folder dan subfolder | Tombol » untuk yang tidak muat |
| --- | --- |
| ![Menu folder](screenshots/folder-menu.png) | ![Tombol lainnya](screenshots/overflow.png) |

| Ikon saja (lebih banyak yang muat) | Tema gelap |
| --- | --- |
| ![Ikon saja](screenshots/icons-only.png) | ![Tema gelap](screenshots/bar-dark.png) |

<details>
<summary>Halaman pengaturan</summary>

![Pengaturan](screenshots/options.png)

</details>

> Gambar memakai bookmark contoh, bukan bookmark asli.

- Tidak ada koneksi internet, tidak ada analitik, tidak update otomatis (dipasang lokal).
- Izin: `bookmarks` (membaca bookmark), `storage` (pengaturan), `favicon` (ikon situs).
- Bar dibuat di shadow DOM tertutup: situs yang dibuka tidak bisa membaca bookmark Anda,
  dan ekstensi tidak membaca isi halaman.

## Pasang

1. Buka `chrome://extensions`.
2. Nyalakan **Developer mode** (kanan atas).
3. Klik **Load unpacked**, pilih folder ini.
4. Tekan **Ctrl+Shift+B** untuk menyembunyikan bar asli Chrome.

Setelah mengubah file di folder ini, klik tombol muat ulang (↻) di kartu ekstensi pada `chrome://extensions`.

## Pakai

- Klik: buka di tab ini. Klik tengah / Ctrl+klik: tab baru. Shift+klik: jendela baru.
- Klik tengah folder: buka semua isinya.
- Bookmark yang tidak muat masuk ke tombol **»**.
- **Alt+Shift+B** atau klik ikon ekstensi: tampilkan / sembunyikan.
- Klik kanan area kosong bar: Kelola bookmark / Pengaturan bar.

Bar tidak bisa tampil di halaman Chrome sendiri (`chrome://`, Web Store, tab baru).
