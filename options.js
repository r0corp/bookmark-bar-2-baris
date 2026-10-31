const DEFAULTS = globalThis.BB_DEFAULTS;
const $ = (id) => document.getElementById(id);
let timer;

function saved(text = "Tersimpan") {
  $("saved").textContent = text;
  $("saved").style.opacity = 1;
  clearTimeout(timer);
  timer = setTimeout(() => ($("saved").style.opacity = 0), 1400);
}

const save = (key, value) => chrome.storage.sync.set({ [key]: value }).then(() => saved());

// Daftar folder untuk pilihan "Isi baris 2" dan "Folder Pribadi".
async function folderOptions(select, emptyLabel, value) {
  select.textContent = "";
  select.append(new Option(emptyLabel, ""));
  if (!chrome.bookmarks) return;
  const [root] = await chrome.bookmarks.getTree();
  const walk = (node, depth) => {
    for (const c of node.children || []) {
      if (c.url) continue;
      select.append(new Option("  ".repeat(depth) + (c.title || "(tanpa nama)"), c.id));
      walk(c, depth + 1);
    }
  };
  for (const top of root.children) {
    const group = top.title || "Bookmark";
    select.append(new Option(group, top.id));
    walk(top, 1);
  }
  select.value = value || "";
  if (select.value !== (value || "")) select.value = "";
}

async function showStatus() {
  if (!chrome.storage.local) return;
  const { status = {}, statusAt } = await chrome.storage.local.get(["status", "statusAt"]);
  const all = Object.values(status);
  if (!statusAt) { $("statusInfo").textContent = "Belum pernah dicek."; return; }
  const on = all.filter(Boolean).length;
  $("statusInfo").textContent = `${all.length} alamat dicek: ${on} online, ${all.length - on} offline · ` +
    new Date(statusAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  $("rows").value = String(s.rows);
  $("titles").value = s.titles;
  $("maxWidth").value = s.maxWidth;
  $("mode").value = s.mode;
  $("searchButton").checked = s.searchButton;
  $("other").checked = s.other;
  $("status").checked = s.status;
  $("statusHosts").value = s.statusHosts;
  $("profileAuto").checked = s.profileAuto;
  $("workStart").value = s.workStart;
  $("workEnd").value = s.workEnd;
  $("exclude").value = s.exclude;
  await folderOptions($("row2Folder"), "Lanjutan bookmark bar (bawaan)", s.row2Folder);
  await folderOptions($("profileFolder"), "Tidak dipakai (fitur profil mati)", s.profileFolder);
  showStatus();
}

const bind = (id, key, read) => $(id).addEventListener("change", (e) => save(key, read(e.target)));
bind("rows", "rows", (t) => Number(t.value));
bind("titles", "titles", (t) => t.value);
bind("mode", "mode", (t) => t.value);
bind("row2Folder", "row2Folder", (t) => t.value);
bind("profileFolder", "profileFolder", (t) => t.value);
bind("searchButton", "searchButton", (t) => t.checked);
bind("other", "other", (t) => t.checked);
bind("status", "status", (t) => t.checked);
bind("profileAuto", "profileAuto", (t) => t.checked);
bind("workStart", "workStart", (t) => t.value || DEFAULTS.workStart);
bind("workEnd", "workEnd", (t) => t.value || DEFAULTS.workEnd);
bind("maxWidth", "maxWidth", (t) => Math.min(400, Math.max(60, Number(t.value) || DEFAULTS.maxWidth)));

for (const [id, key] of [["exclude", "exclude"], ["statusHosts", "statusHosts"]]) {
  let typing;
  $(id).addEventListener("input", (e) => {
    clearTimeout(typing);
    typing = setTimeout(() => save(key, e.target.value), 500);
  });
}

$("checkNow").addEventListener("click", async () => {
  $("statusInfo").textContent = "Mengecek…";
  await chrome.runtime.sendMessage({ type: "checkNow" });
  showStatus();
});

$("export").addEventListener("click", async () => {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  const blob = new Blob([JSON.stringify({ app: "bookmark-bar-2-baris", version: 1, settings: s }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bookmark-bar-2-baris-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("import").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    if (json.app !== "bookmark-bar-2-baris" || !json.settings) throw new Error();
    const clean = Object.fromEntries(Object.entries(json.settings).filter(([k]) => k in DEFAULTS));
    await chrome.storage.sync.set(clean);
    await load();
    saved("Pengaturan diimpor");
  } catch {
    saved("File bukan backup pengaturan ini");
  }
});

$("reset").addEventListener("click", async () => {
  if (!confirm("Kembalikan semua pengaturan ke bawaan? Warna folder ikut terhapus.")) return;
  await chrome.storage.sync.clear();
  await load();
  saved("Pengaturan bawaan");
});

if (chrome.storage.onChanged) chrome.storage.onChanged.addListener((c, area) => {
  if (area === "local" && c.status) showStatus();
  // Folder bisa diganti dari tempat lain (mis. impor di jendela lain): samakan pilihannya.
  if (area === "sync" && c.row2Folder) folderOptions($("row2Folder"), "Lanjutan bookmark bar (bawaan)", c.row2Folder.newValue);
  if (area === "sync" && c.profileFolder) folderOptions($("profileFolder"), "Tidak dipakai (fitur profil mati)", c.profileFolder.newValue);
});

load();
