// Pengaturan bawaan, dipakai bersama oleh background, bar (content script) dan halaman pengaturan.
globalThis.BB_DEFAULTS = {
  rows: 2,
  titles: "all",          // all | folders | none
  mode: "push",           // push | overlay | reveal
  maxWidth: 170,
  other: true,
  exclude: "",
  searchButton: true,
  row2Folder: "",         // id folder untuk baris 2 ("" = bookmark bar meluber ke baris 2)
  status: true,           // titik online/offline untuk alamat lokal
  statusHosts: "localhost\n127.0.0.1\n192.168.*\n10.*\n172.16.*\n*.local",
  folderColors: {},       // { idFolder: "#warna" }
  profileFolder: "",      // id folder untuk profil Pribadi ("" = fitur profil mati)
  profileAuto: false,     // ganti otomatis: Senin–Jumat jam kerja = Kerja, selain itu Pribadi
  workStart: "08:00",
  workEnd: "17:00",
};
