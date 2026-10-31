// Jendela aman: kotak cari dan dialog edit. Halaman ini ada di iframe milik ekstensi, jadi situs
// yang sedang dibuka tidak bisa membaca ketikan Anda di sini. Hanya tampil kalau token sekali
// pakai di alamatnya valid untuk tab ini (dibuat background saat Anda membuka dari bar).
const LETTER_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777"];
const back = document.getElementById("back");
const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
const isJs = (u) => /^javascript:/i.test(u);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else n.setAttribute(k, v);
  }
  n.append(...kids.filter((k) => k != null));
  return n;
}

function close(toast) {
  send({ type: "ui-close", toast });
}

function origin(url) {
  try { return new URL(url).origin; } catch { return ""; }
}

function letterIcon(title, url) {
  let h = "";
  try { h = new URL(url).hostname; } catch {}
  const word = (title || h).replace(/[^\p{L}\p{N}]/gu, "");
  const ch = (word[0] || "?").toUpperCase();
  const col = LETTER_COLORS[[...(h || title)].reduce((a, c) => a + c.charCodeAt(0), 0) % LETTER_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${col}"/>` +
    `<text x="16" y="22" font-family="Segoe UI,Arial" font-size="18" font-weight="700" fill="#fff" text-anchor="middle">${ch}</text></svg>`;
  return el("img", { src: "data:image/svg+xml," + encodeURIComponent(svg), alt: "" });
}

function icon(b, ctx) {
  const img = ctx.nofav[b.u]
    ? letterIcon(b.t, b.u)
    : el("img", { src: "/_favicon/?pageUrl=" + encodeURIComponent(b.u) + "&size=32", alt: "" });
  const i = el("i", { class: "ico" }, img);
  const st = ctx.status[origin(b.u)];
  if (ctx.showStatus && st !== undefined) i.dataset.st = st ? "on" : "off";
  return i;
}

function show(box) {
  back.textContent = "";
  back.append(box);
  back.hidden = false;
}

back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

// --- pencarian ---------------------------------------------------------------------------
function score(b, terms) {
  const t = b.t.toLowerCase();
  const u = b.u.toLowerCase();
  let s = 0;
  for (const w of terms) {
    if (t.startsWith(w)) s += 4;
    else if (t.split(/[\s\-|_./]+/).some((x) => x.startsWith(w))) s += 3;
    else if (t.includes(w)) s += 2;
    else if (u.includes(w)) s += 1;
    else return 0;
  }
  return s;
}

function highlight(text, terms) {
  const out = el("b");
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    let hit = null;
    for (const w of terms) if (w && lower.startsWith(w, i) && (!hit || w.length > hit.length)) hit = w;
    if (hit) { out.append(el("mark", {}, text.slice(i, i + hit.length))); i += hit.length; }
    else { out.append(text[i]); i++; }
  }
  return out;
}

async function search() {
  const [tree, local, sync] = await Promise.all([
    send({ type: "tree" }),
    chrome.storage.local.get({ status: {}, nofav: {} }),
    chrome.storage.sync.get({ status: BB_DEFAULTS.status }),
  ]);
  const ctx = { status: local.status, nofav: local.nofav, showStatus: sync.status };
  const all = (tree ? tree.all : []).filter((b) => !isJs(b.u));
  const input = el("input", { type: "text", placeholder: "Cari bookmark… (nama atau alamat)", spellcheck: "false", autocomplete: "off" });
  const results = el("div", { class: "results" });
  show(el("div", { class: "box search" }, input, results,
    el("div", { class: "hint" }, "↑↓ pilih · Enter buka · Ctrl+Enter tab baru · Shift+Enter jendela baru · Esc tutup")));
  let list = [];
  let sel = 0;
  const open = (b, where) => { send({ type: "open", url: b.u, where }); close(); };
  const draw = () => {
    const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    list = terms.length
      ? all.map((b) => [score(b, terms), b]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, b]) => b).slice(0, 10)
      : all.slice(0, 10);
    sel = Math.min(sel, Math.max(0, list.length - 1));
    results.textContent = "";
    if (!list.length) results.append(el("div", { class: "result" }, el("small", {}, "Tidak ditemukan")));
    list.forEach((b, i) => {
      const r = el("div", { class: "result" + (i === sel ? " sel" : "") }, icon(b, ctx),
        el("div", { class: "txt" }, highlight(b.t || b.u, terms), el("small", {}, (b.p ? b.p + " · " : "") + b.u)));
      r.addEventListener("mousemove", () => { if (sel !== i) { sel = i; draw(); } });
      r.addEventListener("click", (e) => open(b, e.shiftKey ? "window" : (e.ctrlKey || e.metaKey) ? "tab" : "same"));
      r.addEventListener("auxclick", (e) => { if (e.button === 1) open(b, "tab"); });
      results.append(r);
    });
    const cur = results.children[sel];
    if (cur) cur.scrollIntoView({ block: "nearest" });
  };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, list.length - 1); draw(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
    else if (e.key === "Enter" && list[sel]) open(list[sel], e.shiftKey ? "window" : (e.ctrlKey || e.altKey || e.metaKey) ? "tab" : "same");
  });
  draw();
  input.focus();
}

// --- dialog ------------------------------------------------------------------------------
function dialog({ title, message, fields = [], ok = "Simpan", danger = false, onOk }) {
  const box = el("div", { class: "box dialog" }, el("h2", {}, title), message ? el("div", { class: "msg" }, message) : null);
  const inputs = {};
  for (const f of fields) {
    const input = el("input", { type: "text", spellcheck: "false", autocomplete: "off" });
    input.value = f.value || "";
    inputs[f.name] = input;
    box.append(el("label", {}, f.label), input);
  }
  const error = el("div", { class: "error" });
  const cancel = el("button", { class: "btn", type: "button" }, "Batal");
  const okBtn = el("button", { class: "btn " + (danger ? "danger" : "primary"), type: "button" }, ok);
  box.append(error, el("div", { class: "buttons" }, cancel, okBtn));
  const submit = async () => {
    const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
    const r = await onOk(values);
    if (typeof r === "string") { error.textContent = r; return; }
    if (r && r.error) { error.textContent = r.error; return; }
    close(r && r.toast);
  };
  cancel.addEventListener("click", () => close());
  okBtn.addEventListener("click", submit);
  box.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  show(box);
  (Object.values(inputs)[0] || okBtn).focus();
}

const SAFE = /^(https?|file|ftp|chrome|chrome-extension|edge|about):/i;

async function edit({ id }) {
  const [node] = await chrome.bookmarks.get(id);
  dialog({
    title: "Edit bookmark",
    fields: [{ name: "title", label: "Nama", value: node.title }, { name: "url", label: "Alamat (URL)", value: node.url }],
    onOk: async (v) => {
      if (!v.url) return "Alamat tidak boleh kosong.";
      if (!SAFE.test(v.url)) return "Alamat ditolak: hanya http, https, file, dan halaman Chrome.";
      const r = await send({ type: "update", id, title: v.title, url: v.url });
      return r && r.error ? r : { toast: "Bookmark disimpan" };
    },
  });
}

async function rename({ id }) {
  const [node] = await chrome.bookmarks.get(id);
  dialog({
    title: "Ganti nama folder",
    message: "Tips: tambahkan emoji di depan nama, mis. 🔴 Server",
    fields: [{ name: "title", label: "Nama folder", value: node.title }],
    onOk: (v) => send({ type: "update", id, title: v.title }),
  });
}

function newFolder({ parentId }) {
  dialog({
    title: "Folder baru",
    fields: [{ name: "title", label: "Nama folder", value: "" }],
    onOk: async (v) => {
      if (!v.title) return "Nama folder tidak boleh kosong.";
      const r = await send({ type: "create", parentId, title: v.title });
      return r && r.error ? r : { toast: "Folder dibuat" };
    },
  });
}

async function remove({ id }) {
  const [node] = await chrome.bookmarks.getSubTree(id);
  const count = (n) => (n.url ? 1 : (n.children || []).reduce((a, c) => a + count(c), 0));
  dialog({
    title: `Hapus folder "${node.title}"?`,
    message: `Folder ini beserta ${count(node)} bookmark di dalamnya akan dihapus. Bisa dibatalkan dengan Ctrl+Z di halaman Kelola bookmark.`,
    ok: "Hapus",
    danger: true,
    onOk: async () => {
      const r = await send({ type: "remove", id, folder: true });
      return r && r.error ? r : { toast: "Folder dihapus" };
    },
  });
}

// --- mulai -------------------------------------------------------------------------------
(async () => {
  const token = location.hash.slice(1);
  history.replaceState(null, "", location.pathname);
  const job = token && (await send({ type: "ui-claim", token }));
  if (!job) return close();
  try {
    const run = { search, edit, rename, newfolder: newFolder, delete: remove }[job.mode];
    if (!run) return close();
    await run(job.args);
  } catch {
    close("Bookmark tidak ditemukan");
  }
})();
