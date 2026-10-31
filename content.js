// Bookmark bar 2 baris, digambar di atas halaman (Chrome tidak mengizinkan ekstensi mengubah
// bar aslinya). Bar ada di shadow DOM tertutup: halaman tidak bisa membaca bookmark Anda, dan
// skrip ini tidak membaca isi halaman (hanya judul + alamat saat Anda memilih "Tambahkan halaman ini").
(() => {
  if (window.top !== window) return;

  const ROW_H = 30;
  const PAD = 4;
  const COLORS = ["#e53935", "#fb8c00", "#fdd835", "#43a047", "#00acc1", "#1e88e5", "#8e24aa", "#d81b60"];
  const LETTER_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777"];
  let settings = { ...BB_DEFAULTS };
  let state = { hidden: false, status: {}, nofav: {} };
  let data = { bar: { id: "", c: [] }, row2: null, other: { id: "", c: [] }, all: [], profile: "kerja", profiles: false };
  let host, root, wrap, layer, hot;
  let sections = [];
  let openMenus = [];
  let activeFolder = null;
  let savedMargin = null;
  let revealed = false;
  let hideTimer;
  let search = null;
  let dialog = null;
  let drag = null;

  const CSS = `
    :host { all: initial; --bg: #ffffff; --fg: #1f1f1f; --muted: #5f6368; --hover: rgba(31,31,31,.08);
      --line: #dadce0; --menu: #ffffff; --shadow: 0 4px 16px rgba(0,0,0,.18); --accent: #1a73e8;
      --on: #1e8e3e; --off: #d93025; }
    @media (prefers-color-scheme: dark) {
      :host { --bg: #35363a; --fg: #e8eaed; --muted: #9aa0a6; --hover: rgba(232,234,237,.1);
        --line: #4a4c50; --menu: #2b2c2f; --shadow: 0 4px 16px rgba(0,0,0,.5); --accent: #8ab4f8;
        --on: #81c995; --off: #f28b82; }
    }
    * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
    .wrap { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
      background: var(--bg); color: var(--fg); border-bottom: 1px solid var(--line);
      padding: ${PAD}px 6px; transition: transform .15s ease; }
    .wrap.away { transform: translateY(-100%); }
    .wrap[hidden] { display: none; }
    .section { position: relative; }
    .section + .section { border-top: 1px solid var(--line); margin-top: 2px; padding-top: 2px; }
    .bar { display: flex; flex-wrap: wrap; align-content: flex-start; overflow: hidden; padding-right: 30px; }
    .item { position: relative; display: inline-flex; align-items: center; gap: 6px; height: ${ROW_H - 4}px; margin: 2px 1px;
      padding: 0 8px; border: 0; border-radius: 13px; background: transparent; color: var(--fg);
      font-size: 12px; line-height: 1; cursor: pointer; white-space: nowrap; text-decoration: none; }
    .item:hover, .item.open { background: var(--hover); }
    .item span { overflow: hidden; text-overflow: ellipsis; }
    .ico { position: relative; display: flex; width: 16px; height: 16px; flex: none; }
    .ico img, .ico svg { width: 16px; height: 16px; }
    .ico[data-st]::after { content: ""; position: absolute; right: -3px; bottom: -3px; width: 8px; height: 8px;
      border-radius: 50%; border: 2px solid var(--bg); }
    .menu .ico[data-st]::after { border-color: var(--menu); }
    .ico[data-st="on"]::after { background: var(--on); }
    .ico[data-st="off"]::after { background: var(--off); }
    .item.drop-into { background: var(--hover); box-shadow: inset 0 0 0 2px var(--accent); }
    .marker { position: absolute; width: 2px; height: ${ROW_H - 8}px; background: var(--accent); border-radius: 1px; pointer-events: none; }
    .more { position: absolute; right: 0; top: 2px; padding: 0 7px; font-size: 15px; }
    .more[hidden] { display: none; }
    .pill { font-weight: 600; }
    .pill.kerja { color: #1a73e8; } .pill.pribadi { color: #e8710a; }
    @media (prefers-color-scheme: dark) { .pill.kerja { color: #8ab4f8; } .pill.pribadi { color: #fdd663; } }
    .menu { position: fixed; z-index: 2147483647; min-width: 220px; max-width: 420px; max-height: 70vh;
      overflow-y: auto; padding: 6px 0; background: var(--menu); color: var(--fg);
      border-radius: 8px; box-shadow: var(--shadow); border: 1px solid var(--line); }
    .menu .item { display: flex; width: 100%; margin: 0; height: 30px; padding: 0 14px; border-radius: 0; }
    .menu .item span { flex: 1; text-align: left; }
    .menu .arrow { color: var(--muted); flex: none !important; }
    .menu .key { color: var(--muted); flex: none !important; font-size: 11px; }
    .menu hr { border: 0; border-top: 1px solid var(--line); margin: 6px 0; }
    .menu .empty, .menu .label { padding: 6px 14px; color: var(--muted); font-size: 12px; }
    .swatches { display: flex; gap: 6px; padding: 4px 14px 8px; }
    .swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
    .swatch.none { background: transparent; border-color: var(--line); color: var(--muted); font-size: 11px; line-height: 12px; }
    .swatch.sel { border-color: var(--fg); }
    .hot { position: fixed; top: 0; left: 0; right: 0; height: 4px; z-index: 2147483645; }
    .toast { position: fixed; top: 70px; left: 50%; transform: translateX(-50%); padding: 8px 14px;
      background: #323232; color: #fff; border-radius: 6px; font-size: 12px; z-index: 2147483647; }
    .backdrop { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.25); display: flex;
      align-items: flex-start; justify-content: center; padding-top: 12vh; }
    .box { width: min(560px, calc(100vw - 32px)); background: var(--menu); color: var(--fg); border-radius: 12px;
      box-shadow: var(--shadow); border: 1px solid var(--line); overflow: hidden; }
    .dialog { padding: 18px 20px; }
    .dialog h2 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
    .dialog .msg { margin-bottom: 12px; font-size: 13px; color: var(--muted); }
    .dialog label { display: block; font-size: 12px; color: var(--muted); margin: 8px 0 4px; }
    .dialog input, .search input { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 6px;
      background: transparent; color: var(--fg); font-size: 13px; outline: none; }
    .dialog input:focus { border-color: var(--accent); }
    .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    .btn { padding: 7px 16px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: var(--fg);
      font-size: 13px; cursor: pointer; }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    .btn.danger { background: var(--off); border-color: var(--off); color: #fff; }
    .search input { border: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 14px 16px; font-size: 15px; }
    .results { max-height: 50vh; overflow-y: auto; padding: 6px 0; }
    .result { display: flex; align-items: center; gap: 10px; padding: 8px 16px; cursor: pointer; }
    .result.sel { background: var(--hover); }
    .result .txt { min-width: 0; flex: 1; }
    .result b { display: block; font-weight: 500; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .result small { display: block; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .result mark { background: none; color: var(--accent); font-weight: 700; }
    .hint { padding: 8px 16px; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
  `;

  const FOLDER_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>';
  const SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  // --- util -------------------------------------------------------------------------------
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "html") n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    n.append(...kids.filter((k) => k != null));
    return n;
  }

  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => null);
  const isJs = (u) => /^javascript:/i.test(u);
  const stop = (e) => e.stopPropagation();

  function origin(url) {
    try { return new URL(url).origin; } catch { return ""; }
  }

  function toast(text) {
    const t = el("div", { class: "toast" }, text);
    root.append(t);
    setTimeout(() => t.remove(), 2500);
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

  function icon(node) {
    if (!node.u) {
      const i = el("i", { class: "ico", html: FOLDER_SVG });
      i.style.color = settings.folderColors[node.id] || "";
      if (!settings.folderColors[node.id]) i.style.opacity = ".75";
      return i;
    }
    const img = state.nofav[node.u]
      ? letterIcon(node.t, node.u)
      : el("img", { src: chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + encodeURIComponent(node.u) + "&size=32", alt: "" });
    const i = el("i", { class: "ico" }, img);
    const o = origin(node.u);
    if (o) i.dataset.origin = o;
    setDot(i);
    return i;
  }

  function setDot(i) {
    const st = settings.status ? state.status[i.dataset.origin] : undefined;
    if (st === undefined) delete i.dataset.st;
    else i.dataset.st = st ? "on" : "off";
  }

  function updateDots() {
    if (root) root.querySelectorAll(".ico[data-origin]").forEach(setDot);
  }

  function flatten(nodes) {
    return nodes.flatMap((n) => (n.u ? (isJs(n.u) ? [] : [n]) : flatten(n.c)));
  }

  function statusText(node) {
    const st = settings.status ? state.status[origin(node.u)] : undefined;
    return st === undefined ? "" : st ? "\n● Online" : "\n● Offline / tidak menjawab";
  }

  // --- membuka bookmark -------------------------------------------------------------------
  function whereFrom(e) {
    return e.shiftKey ? "window" : (e.button === 1 || e.ctrlKey || e.metaKey) ? "tab" : "same";
  }

  function open(url, where) {
    closeAll();
    if (isJs(url)) return toast("Bookmarklet (javascript:) tidak bisa dijalankan dari ekstensi.");
    send({ type: "open", url, where });
  }

  function openAll(nodes, where = "tab") {
    closeAll();
    const urls = flatten(nodes).map((n) => n.u);
    if (urls.length) send({ type: "openAll", urls, where });
  }

  // --- item di bar dan di menu ------------------------------------------------------------
  function item(node, inMenu, parentId) {
    const isFolder = !node.u;
    const showTitle = inMenu || settings.titles === "all" || (settings.titles === "folders" && isFolder) || !node.t;
    const b = el("button", { class: "item", type: "button", title: isFolder ? node.t : `${node.t}\n${node.u}${statusText(node)}` },
      icon(node),
      showTitle ? el("span", {}, node.t || node.u) : null,
      inMenu && isFolder ? el("span", { class: "arrow" }, "›") : null);
    b._node = node;
    b._parent = parentId;
    if (!inMenu) b.style.maxWidth = settings.maxWidth + "px";

    if (isFolder) {
      b.addEventListener("click", (e) => { stop(e); toggleFolder(b, node, inMenu); });
      b.addEventListener("mouseenter", () => {
        if (inMenu) openSub(b, node);
        else if (openMenus.length && activeFolder && activeFolder !== b && activeFolder._isFolder) toggleFolder(b, node, false);
      });
      b.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); openAll(node.c); } });
      b._isFolder = true;
    } else {
      b.addEventListener("click", (e) => open(node.u, whereFrom(e)));
      b.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); open(node.u, "tab"); } });
      if (inMenu) b.addEventListener("mouseenter", () => closeFrom(Number(b.closest(".menu").dataset.level) + 1));
    }
    b.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); stop(e); itemMenu(node, parentId, e); });
    if (!inMenu && node.id) dragSource(b);
    return b;
  }

  // --- menu folder ------------------------------------------------------------------------
  function menuItem(label, onClick, key) {
    const b = el("button", { class: "item", type: "button" }, el("span", {}, label), key ? el("span", { class: "key" }, key) : null);
    b.addEventListener("click", (e) => { stop(e); onClick(); });
    b.addEventListener("mouseenter", () => {
      const m = b.closest(".menu");
      if (m && m.dataset.level) closeFrom(Number(m.dataset.level) + 1);
    });
    return b;
  }

  function menu(folder, level) {
    const m = el("div", { class: "menu" });
    m.dataset.level = level;
    const nodes = folder.c;
    if (!nodes.length) m.append(el("div", { class: "empty" }, "(kosong)"));
    for (const n of nodes) m.append(item(n, true, folder.id));
    const links = flatten(nodes);
    if (links.length > 1) m.append(el("hr"), menuItem(`Buka semua (${links.length})`, () => openAll(nodes)));
    m.addEventListener("mousedown", stop);
    m.addEventListener("contextmenu", (e) => e.preventDefault());
    return m;
  }

  function place(m, x, y, alignRight) {
    layer.append(m);
    const r = m.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let left = alignRight ? x - r.width : x;
    if (left + r.width > vw - 4) left = vw - r.width - 4;
    m.style.left = Math.max(4, left) + "px";
    m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
  }

  function toggleFolder(btn, folder, inMenu) {
    if (inMenu) return openSub(btn, folder);
    const same = activeFolder === btn;
    closeMenus();
    if (same) return;
    activeFolder = btn;
    btn.classList.add("open");
    const r = btn.getBoundingClientRect();
    const m = menu(folder, 0);
    openMenus.push(m);
    place(m, r.left, r.bottom + 2, false);
  }

  function openSub(btn, folder) {
    const level = Number(btn.closest(".menu").dataset.level) + 1;
    if (openMenus[level] && openMenus[level]._from === btn) return;
    closeFrom(level);
    const r = btn.getBoundingClientRect();
    const m = menu(folder, level);
    m._from = btn;
    openMenus.push(m);
    place(m, r.right - 2, r.top - 6);
    if (m.getBoundingClientRect().left < r.right - 10) place(m, r.left + 2, r.top - 6, true);
  }

  function closeFrom(level) {
    for (const m of openMenus.splice(level)) m.remove();
  }

  function closeMenus() {
    closeFrom(0);
    if (activeFolder) activeFolder.classList.remove("open");
    activeFolder = null;
  }

  function closeAll() {
    closeMenus();
    closeSearch();
  }

  function contextMenu(e, ...children) {
    closeMenus();
    const m = el("div", { class: "menu" }, ...children);
    m.dataset.level = 0;
    m.addEventListener("mousedown", stop);
    m.addEventListener("contextmenu", (ev) => ev.preventDefault());
    openMenus.push(m);
    place(m, e.clientX, e.clientY);
  }

  // --- klik kanan --------------------------------------------------------------------------
  function itemMenu(node, parentId, e) {
    if (!node.id) return;
    if (node.u) {
      contextMenu(e,
        menuItem("Buka di tab baru", () => open(node.u, "tab"), "Ctrl+klik"),
        menuItem("Buka di jendela baru", () => open(node.u, "window"), "Shift+klik"),
        menuItem("Buka di jendela Incognito", () => open(node.u, "incognito")),
        el("hr"),
        menuItem("Edit…", () => { closeMenus(); editBookmark(node); }),
        menuItem("Salin alamat", () => { closeMenus(); navigator.clipboard.writeText(node.u).then(() => toast("Alamat disalin")); }),
        menuItem("Hapus", () => { closeMenus(); send({ type: "remove", id: node.id }).then(() => toast("Bookmark dihapus")); }));
      return;
    }
    const links = flatten(node.c).length;
    const sw = el("div", { class: "swatches" });
    const current = settings.folderColors[node.id] || "";
    const none = el("button", { class: "swatch none" + (current ? "" : " sel"), type: "button", title: "Tanpa warna" }, "×");
    none.addEventListener("click", () => { closeMenus(); send({ type: "folderColor", id: node.id, color: "" }); });
    sw.append(none);
    for (const c of COLORS) {
      const s = el("button", { class: "swatch" + (current === c ? " sel" : ""), type: "button", title: c });
      s.style.background = c;
      s.addEventListener("click", () => { closeMenus(); send({ type: "folderColor", id: node.id, color: c }); });
      sw.append(s);
    }
    contextMenu(e,
      menuItem(`Buka semua (${links})`, () => openAll(node.c)),
      menuItem("Buka semua di jendela baru", () => openAll(node.c, "window")),
      el("hr"),
      menuItem("Tambahkan halaman ini ke folder", () => { closeMenus(); addPage(node.id); }),
      menuItem("Ganti nama…", () => { closeMenus(); renameFolder(node); }),
      el("div", { class: "label" }, "Warna folder"), sw,
      el("hr"),
      menuItem("Hapus folder…", () => { closeMenus(); deleteFolder(node, links); }));
  }

  function barMenu(e, parentId) {
    contextMenu(e,
      menuItem("Tambahkan halaman ini", () => { closeMenus(); addPage(parentId); }),
      menuItem("Folder baru…", () => { closeMenus(); newFolder(parentId); }),
      el("hr"),
      menuItem("Cari bookmark", () => { closeMenus(); openSearch(); }, "Alt+Shift+F"),
      data.profiles ? menuItem(`Ganti ke profil ${data.profile === "kerja" ? "Pribadi" : "Kerja"}`, () => { closeMenus(); send({ type: "profileToggle" }); }, "Alt+Shift+P") : null,
      menuItem("Cek status server sekarang", () => { closeMenus(); toast("Mengecek…"); send({ type: "checkNow" }); }),
      el("hr"),
      menuItem("Kelola bookmark", () => { closeMenus(); send({ type: "manage" }); }),
      menuItem("Pengaturan bar…", () => { closeMenus(); send({ type: "options" }); }));
  }

  function addPage(parentId) {
    send({ type: "create", parentId, title: document.title || location.href, url: location.href })
      .then((r) => toast(r && r.error ? r.error : "Halaman ditambahkan"));
  }

  // --- dialog ------------------------------------------------------------------------------
  function openDialog({ title, message, fields = [], ok = "Simpan", danger = false, onOk }) {
    closeDialog();
    const box = el("div", { class: "box dialog" }, el("h2", {}, title), message ? el("div", { class: "msg" }, message) : null);
    const inputs = {};
    for (const f of fields) {
      const input = el("input", { type: "text", spellcheck: "false" });
      input.value = f.value || "";
      inputs[f.name] = input;
      box.append(el("label", {}, f.label), input);
    }
    const cancel = el("button", { class: "btn", type: "button" }, "Batal");
    const okBtn = el("button", { class: "btn " + (danger ? "danger" : "primary"), type: "button" }, ok);
    box.append(el("div", { class: "buttons" }, cancel, okBtn));
    const back = el("div", { class: "backdrop" }, box);
    const submit = async () => {
      const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));
      closeDialog();
      const r = await onOk(values);
      if (r && r.error) toast(r.error);
    };
    cancel.addEventListener("click", closeDialog);
    okBtn.addEventListener("click", submit);
    back.addEventListener("mousedown", (e) => { if (e.target === back) closeDialog(); });
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") submit();
      if (e.key === "Escape") closeDialog();
    });
    for (const t of ["keyup", "keypress", "mousedown"]) box.addEventListener(t, stop);
    layer.append(back);
    dialog = back;
    (Object.values(inputs)[0] || okBtn).focus();
  }

  function closeDialog() {
    if (dialog) dialog.remove();
    dialog = null;
  }

  function editBookmark(node) {
    openDialog({
      title: "Edit bookmark",
      fields: [{ name: "title", label: "Nama", value: node.t }, { name: "url", label: "Alamat (URL)", value: node.u }],
      onOk: (v) => (v.url ? send({ type: "update", id: node.id, title: v.title, url: v.url }) : null),
    });
  }

  function renameFolder(node) {
    openDialog({
      title: "Ganti nama folder",
      message: "Tips: tambahkan emoji di depan nama, mis. 🔴 Server",
      fields: [{ name: "title", label: "Nama folder", value: node.t }],
      onOk: (v) => send({ type: "update", id: node.id, title: v.title }),
    });
  }

  function newFolder(parentId) {
    openDialog({
      title: "Folder baru",
      fields: [{ name: "title", label: "Nama folder", value: "" }],
      onOk: (v) => (v.title ? send({ type: "create", parentId, title: v.title }) : null),
    });
  }

  function deleteFolder(node, links) {
    openDialog({
      title: `Hapus folder "${node.t}"?`,
      message: `Folder ini beserta ${links} bookmark di dalamnya akan dihapus. Bisa dibatalkan dengan Ctrl+Z di halaman Kelola bookmark.`,
      ok: "Hapus",
      danger: true,
      onOk: () => send({ type: "remove", id: node.id, folder: true }),
    });
  }

  // --- pencarian cepat --------------------------------------------------------------------
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
    const span = el("b");
    const lower = text.toLowerCase();
    let i = 0;
    while (i < text.length) {
      let hit = null;
      for (const w of terms) if (w && lower.startsWith(w, i) && (!hit || w.length > hit.length)) hit = w;
      if (hit) { span.append(el("mark", {}, text.slice(i, i + hit.length))); i += hit.length; }
      else { span.append(text[i]); i++; }
    }
    return span;
  }

  function openSearch() {
    if (!host || !host.isConnected) return;
    closeMenus();
    if (search) { search.input.focus(); return; }
    const input = el("input", { type: "text", placeholder: "Cari bookmark… (nama atau alamat)", spellcheck: "false" });
    const results = el("div", { class: "results" });
    const box = el("div", { class: "box search" }, input, results,
      el("div", { class: "hint" }, "↑↓ pilih · Enter buka · Ctrl+Enter tab baru · Shift+Enter jendela baru · Esc tutup"));
    const back = el("div", { class: "backdrop" }, box);
    let list = [];
    let sel = 0;
    const draw = () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const all = data.all.filter((b) => !isJs(b.u));
      list = terms.length
        ? all.map((b) => [score(b, terms), b]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, b]) => b).slice(0, 10)
        : all.slice(0, 10);
      sel = Math.min(sel, Math.max(0, list.length - 1));
      results.textContent = "";
      if (!list.length) results.append(el("div", { class: "result" }, el("small", {}, "Tidak ditemukan")));
      list.forEach((b, i) => {
        const r = el("div", { class: "result" + (i === sel ? " sel" : "") }, icon(b),
          el("div", { class: "txt" }, highlight(b.t || b.u, terms), el("small", {}, (b.p ? b.p + " · " : "") + b.u)));
        r.addEventListener("mousemove", () => { if (sel !== i) { sel = i; draw(); } });
        r.addEventListener("click", (e) => open(b.u, whereFrom(e)));
        results.append(r);
      });
      const cur = results.children[sel];
      if (cur) cur.scrollIntoView({ block: "nearest" });
    };
    input.addEventListener("input", () => { sel = 0; draw(); });
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, list.length - 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); draw(); }
      else if (e.key === "Enter" && list[sel]) open(list[sel].u, e.shiftKey ? "window" : (e.ctrlKey || e.altKey || e.metaKey) ? "tab" : "same");
      else if (e.key === "Escape") closeSearch();
    });
    for (const t of ["keyup", "keypress", "mousedown"]) box.addEventListener(t, stop);
    back.addEventListener("mousedown", (e) => { if (e.target === back) closeSearch(); });
    layer.append(back);
    search = { back, input };
    draw();
    input.focus();
  }

  function closeSearch() {
    if (search) search.back.remove();
    search = null;
  }

  // --- drag & drop -------------------------------------------------------------------------
  function dragSource(b) {
    b.draggable = true;
    b.addEventListener("dragstart", (e) => {
      closeMenus();
      drag = { node: b._node, parent: b._parent };
      e.dataTransfer.effectAllowed = "copyMove";
      e.dataTransfer.setData("application/x-bb-id", b._node.id);
      if (b._node.u) {
        e.dataTransfer.setData("text/uri-list", b._node.u);
        e.dataTransfer.setData("text/plain", b._node.u);
      }
    });
    b.addEventListener("dragend", () => { drag = null; clearDrop(); });
  }

  function clearDrop() {
    for (const s of sections) s.marker.hidden = true;
    root.querySelectorAll(".drop-into").forEach((x) => x.classList.remove("drop-into"));
  }

  // Posisi jatuh: masuk ke folder (tengah tombol folder) atau di antara dua item.
  function dropTarget(sec, e) {
    const items = [...sec.bar.children].filter((x) => x._node && x._parent === sec.parentId && x.style.visibility !== "hidden");
    if (!items.length) return { index: 0, before: null };
    let best = null;
    for (const it of items) {
      const r = it.getBoundingClientRect();
      if (e.clientY < r.top - 2 || e.clientY > r.bottom + 2) continue;
      if (e.clientX >= r.left && e.clientX <= r.right) {
        const rel = (e.clientX - r.left) / r.width;
        if (it._node.c && rel > 0.25 && rel < 0.75 && (!drag || drag.node.id !== it._node.id)) return { into: it };
        return { it, after: rel >= 0.5 };
      }
      const d = Math.min(Math.abs(e.clientX - r.left), Math.abs(e.clientX - r.right));
      if (!best || d < best.d) best = { it, d, after: e.clientX > r.right };
    }
    return best || { it: items[items.length - 1], after: true };
  }

  function dropZone(sec) {
    const bar = sec.bar;
    bar.addEventListener("dragover", (e) => {
      const types = [...e.dataTransfer.types];
      if (!types.includes("application/x-bb-id") && !types.includes("text/uri-list")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = drag ? "move" : "copy";
      clearDrop();
      const t = dropTarget(sec, e);
      if (t.into) { t.into.classList.add("drop-into"); return; }
      if (!t.it) return;
      const r = t.it.getBoundingClientRect();
      const base = sec.el.getBoundingClientRect();
      sec.marker.style.left = (t.after ? r.right : r.left) - base.left - 1 + "px";
      sec.marker.style.top = r.top - base.top + 2 + "px";
      sec.marker.hidden = false;
    });
    bar.addEventListener("dragleave", (e) => { if (!bar.contains(e.relatedTarget)) clearDrop(); });
    bar.addEventListener("drop", (e) => {
      e.preventDefault();
      const t = dropTarget(sec, e);
      clearDrop();
      let parentId = sec.parentId;
      let index;
      if (t.into) { parentId = t.into._node.id; index = undefined; }
      else if (t.it) index = sec.nodes.indexOf(t.it._node) + (t.after ? 1 : 0);
      const id = e.dataTransfer.getData("application/x-bb-id");
      if (id) {
        if (id === parentId) return;
        send({ type: "move", id, parentId, index }).then((r) => r && r.error && toast(r.error));
        return;
      }
      const url = (e.dataTransfer.getData("text/uri-list") || "").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
      if (!url) return;
      let title = (e.dataTransfer.getData("text/plain") || "").trim();
      if (!title || title === url) {
        const html = e.dataTransfer.getData("text/html");
        const m = html && html.match(/>([^<>]{1,120})</);
        title = m ? m[1].trim() : (() => { try { return new URL(url).hostname; } catch { return url; } })();
      }
      send({ type: "create", parentId, index, title, url }).then((r) => toast(r && r.error ? r.error : "Bookmark ditambahkan"));
    });
  }

  // --- bar --------------------------------------------------------------------------------
  function section(parentId) {
    const bar = el("div", { class: "bar" });
    const more = el("button", { class: "item more", type: "button", title: "Bookmark lainnya" }, "»");
    const marker = el("div", { class: "marker" });
    marker.hidden = true;
    const sec = { el: el("div", { class: "section" }, bar, more, marker), bar, more, marker, parentId, nodes: [], hiddenNodes: [], rows: 1 };
    more.addEventListener("click", (e) => {
      stop(e);
      if (activeFolder === more) return closeMenus();
      closeMenus();
      activeFolder = more;
      more.classList.add("open");
      const r = more.getBoundingClientRect();
      const m = menu({ id: sec.parentId, c: sec.hiddenNodes }, 0);
      openMenus.push(m);
      place(m, r.right, r.bottom + 2, true);
    });
    sec.el.addEventListener("contextmenu", (e) => {
      if (e.target !== sec.el && e.target !== bar) return;
      e.preventDefault();
      barMenu(e, sec.parentId);
    });
    dropZone(sec);
    return sec;
  }

  function build() {
    host = document.createElement("bookmark-bar-2-baris");
    root = host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = CSS;
    wrap = el("div", { class: "wrap" });
    layer = el("div");
    hot = el("div", { class: "hot" });
    hot.addEventListener("mouseenter", () => reveal(true));
    wrap.addEventListener("mouseenter", () => reveal(true));
    wrap.addEventListener("mouseleave", () => reveal(false));
    root.append(style, wrap, hot, layer);

    document.addEventListener("mousedown", (e) => { if (!e.composedPath().includes(host)) closeMenus(); }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); }, true);
    addEventListener("blur", closeMenus);
    addEventListener("resize", () => requestAnimationFrame(layout));
    document.addEventListener("fullscreenchange", apply);
  }

  function leadItems() {
    const out = [];
    if (settings.searchButton) {
      const b = el("button", { class: "item", type: "button", title: "Cari bookmark (Alt+Shift+F)" }, el("i", { class: "ico", html: SEARCH_SVG }));
      b.addEventListener("click", (e) => { stop(e); openSearch(); });
      out.push(b);
    }
    if (data.profiles) {
      const kerja = data.profile === "kerja";
      const b = el("button", { class: "item pill " + data.profile, type: "button", title: "Ganti profil (Alt+Shift+P)" },
        el("span", {}, kerja ? "💼 Kerja" : "🏠 Pribadi"));
      b.addEventListener("click", (e) => { stop(e); send({ type: "profileToggle" }); });
      out.push(b);
    }
    return out;
  }

  function render() {
    closeMenus();
    wrap.textContent = "";
    sections = [];
    const two = !!data.row2;
    const first = section(data.bar.id);
    first.nodes = data.bar.c;
    first.rows = two ? Math.max(1, settings.rows - 1) : settings.rows;
    first.bar.append(...leadItems());
    for (const n of first.nodes) first.bar.append(item(n, false, data.bar.id));
    if (settings.other && data.other.c.length && data.profile === "kerja") {
      const o = item({ id: data.other.id, t: "Bookmark lain", c: data.other.c }, false, null);
      o.draggable = false;
      o.style.marginLeft = "auto";
      first.bar.append(o);
    }
    if (!first.nodes.length) first.bar.append(el("span", { class: "item", style: "cursor:default;opacity:.7" },
      data.profile === "pribadi" ? "Folder Pribadi kosong" : "Bookmark bar kosong"));
    sections.push(first);
    if (two) {
      const second = section(data.row2.id);
      second.nodes = data.row2.c;
      second.rows = 1;
      for (const n of second.nodes) second.bar.append(item(n, false, data.row2.id));
      if (!second.nodes.length) second.bar.append(el("span", { class: "item", style: "cursor:default;opacity:.7" }, `Folder "${data.row2.t}" kosong`));
      sections.push(second);
    }
    for (const s of sections) wrap.append(s.el);
    layout();
  }

  // Item yang tidak muat dalam N baris masuk ke tombol ».
  function layout() {
    if (!host || !host.isConnected || wrap.hidden) return;
    for (const sec of sections) {
      const limit = sec.rows * ROW_H;
      sec.bar.style.maxHeight = "none";
      const top0 = sec.bar.getBoundingClientRect().top;
      const hiddenNodes = [];
      let used = ROW_H;
      for (const it of sec.bar.children) {
        const off = it.getBoundingClientRect().top - top0;
        if (off >= limit - 2) { if (it._node) hiddenNodes.push(it._node); }
        else used = Math.max(used, Math.round(off / ROW_H) * ROW_H + ROW_H);
      }
      sec.bar.style.maxHeight = used + "px";
      sec.hiddenNodes = hiddenNodes;
      sec.more.hidden = !hiddenNodes.length;
    }
    pushPage();
  }

  function pushPage() {
    const de = document.documentElement;
    const shown = host && host.isConnected && !wrap.hidden && settings.mode === "push";
    if (shown) {
      if (savedMargin === null) savedMargin = de.style.getPropertyValue("margin-top") || "";
      de.style.setProperty("margin-top", wrap.getBoundingClientRect().height + "px", "important");
    } else if (savedMargin !== null) {
      if (savedMargin) de.style.setProperty("margin-top", savedMargin);
      else de.style.removeProperty("margin-top");
      savedMargin = null;
    }
  }

  function reveal(on) {
    if (settings.mode !== "reveal") return;
    clearTimeout(hideTimer);
    if (on) { revealed = true; wrap.classList.remove("away"); }
    else hideTimer = setTimeout(() => {
      if (openMenus.length) return reveal(false);
      revealed = false;
      wrap.classList.add("away");
    }, 500);
  }

  function excluded() {
    const h = location.hostname.toLowerCase();
    return settings.exclude.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
      .some((x) => h === x || h.endsWith("." + x));
  }

  function apply() {
    if (excluded()) {
      closeAll();
      if (host && host.isConnected) { host.remove(); pushPage(); }
      return;
    }
    if (!host) build();
    if (!host.isConnected) document.documentElement.append(host);
    wrap.hidden = state.hidden || !!document.fullscreenElement;
    wrap.classList.toggle("away", settings.mode === "reveal" && !revealed);
    hot.style.display = settings.mode === "reveal" && !wrap.hidden ? "block" : "none";
    if (wrap.hidden) { closeMenus(); pushPage(); return; }
    render();
  }

  async function refresh() {
    const t = await send({ type: "tree" });
    if (t) { data = t; if (host && host.isConnected) apply(); }
  }

  async function init() {
    settings = { ...BB_DEFAULTS, ...(await chrome.storage.sync.get(BB_DEFAULTS)) };
    state = { ...state, ...(await chrome.storage.local.get({ hidden: false, status: {}, nofav: {} })) };
    const t = await send({ type: "tree" });
    if (t) data = t;
    apply();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      for (const k of Object.keys(BB_DEFAULTS)) if (changes[k]) settings[k] = changes[k].newValue ?? BB_DEFAULTS[k];
      if (changes.row2Folder || changes.profileFolder) return refresh();
      apply();
      return;
    }
    if (area !== "local") return;
    if (changes.status) { state.status = changes.status.newValue || {}; updateDots(); }
    if (changes.nofav) { state.nofav = changes.nofav.newValue || {}; if (!openMenus.length && !drag) apply(); }
    if (changes.activeProfile) refresh();
    if (changes.hidden) { state.hidden = changes.hidden.newValue; apply(); }
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "changed") refresh();
    if (msg.type === "search") {
      if (!host || !host.isConnected) return;
      openSearch();
    }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  init();
})();
