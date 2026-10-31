// Bookmark bar 2 baris, digambar di atas halaman (Chrome tidak mengizinkan ekstensi mengubah
// bar aslinya). Bar ada di shadow DOM tertutup: halaman tidak bisa membaca bookmark Anda, dan
// skrip ini tidak membaca apa pun dari halaman. Tidak ada koneksi ke internet.
(() => {
  if (window.top !== window) return;

  const ROW_H = 30;
  const PAD = 4;
  const DEFAULTS = { rows: 2, titles: "all", mode: "push", maxWidth: 170, other: true, exclude: "" };
  let settings = { ...DEFAULTS };
  let hidden = false;
  let data = { bar: [], other: [] };
  let host, root, bar, more, layer, hot;
  let openMenus = [];
  let activeFolder = null;
  let savedMargin = null;
  let revealed = false;
  let hideTimer;

  const CSS = `
    :host { all: initial; --bg: #ffffff; --fg: #1f1f1f; --muted: #5f6368; --hover: rgba(31,31,31,.08);
      --line: #dadce0; --menu: #ffffff; --shadow: 0 4px 16px rgba(0,0,0,.18); }
    @media (prefers-color-scheme: dark) {
      :host { --bg: #35363a; --fg: #e8eaed; --muted: #9aa0a6; --hover: rgba(232,234,237,.1);
        --line: #4a4c50; --menu: #2b2c2f; --shadow: 0 4px 16px rgba(0,0,0,.5); }
    }
    * { box-sizing: border-box; font-family: "Segoe UI", system-ui, sans-serif; }
    .wrap { position: fixed; top: 0; left: 0; right: 0; z-index: 2147483646;
      background: var(--bg); color: var(--fg); border-bottom: 1px solid var(--line);
      padding: ${PAD}px 6px; transition: transform .15s ease; }
    .wrap.away { transform: translateY(-100%); }
    .bar { display: flex; flex-wrap: wrap; align-content: flex-start; overflow: hidden; padding-right: 30px; }
    .item { display: inline-flex; align-items: center; gap: 6px; height: ${ROW_H - 4}px; margin: 2px 1px;
      padding: 0 8px; border: 0; border-radius: 13px; background: transparent; color: var(--fg);
      font-size: 12px; line-height: 1; cursor: pointer; white-space: nowrap; text-decoration: none; }
    .item:hover, .item.open { background: var(--hover); }
    .item span { overflow: hidden; text-overflow: ellipsis; }
    .item img, .item svg { width: 16px; height: 16px; flex: none; }
    .more { position: absolute; right: 6px; top: ${PAD + 2}px; padding: 0 7px; font-size: 15px; }
    .more[hidden] { display: none; }
    .menu { position: fixed; z-index: 2147483647; min-width: 220px; max-width: 420px; max-height: 70vh;
      overflow-y: auto; padding: 6px 0; background: var(--menu); color: var(--fg);
      border-radius: 8px; box-shadow: var(--shadow); border: 1px solid var(--line); }
    .menu .item { display: flex; width: 100%; margin: 0; height: 30px; padding: 0 14px; border-radius: 0; }
    .menu .item span { flex: 1; text-align: left; }
    .menu .arrow { color: var(--muted); }
    .menu hr { border: 0; border-top: 1px solid var(--line); margin: 6px 0; }
    .menu .empty { padding: 6px 14px; color: var(--muted); font-size: 12px; }
    .hot { position: fixed; top: 0; left: 0; right: 0; height: 4px; z-index: 2147483645; }
    .toast { position: fixed; top: 70px; left: 50%; transform: translateX(-50%); padding: 8px 14px;
      background: #323232; color: #fff; border-radius: 6px; font-size: 12px; z-index: 2147483647; }
  `;

  const FOLDER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" opacity=".75"/></svg>';

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

  function favicon(url) {
    return el("img", { src: chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + encodeURIComponent(url) + "&size=32", alt: "" });
  }

  function excluded() {
    const h = location.hostname.toLowerCase();
    return settings.exclude.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
      .some((x) => h === x || h.endsWith("." + x));
  }

  function send(msg) {
    return chrome.runtime.sendMessage(msg).catch(() => null);
  }

  function toast(text) {
    const t = el("div", { class: "toast" }, text);
    root.append(t);
    setTimeout(() => t.remove(), 2500);
  }

  // --- membuka bookmark -------------------------------------------------------------------
  function open(url, e) {
    closeMenus();
    if (/^javascript:/i.test(url)) return toast("Bookmarklet (javascript:) tidak bisa dijalankan dari ekstensi.");
    const where = e.shiftKey ? "window" : (e.button === 1 || e.ctrlKey || e.metaKey) ? "tab" : "same";
    send({ type: "open", url, where });
  }

  function openAll(nodes) {
    closeMenus();
    for (const n of flatten(nodes)) send({ type: "open", url: n.u, where: "tab" });
  }

  function flatten(nodes) {
    return nodes.flatMap((n) => (n.u ? (/^javascript:/i.test(n.u) ? [] : [n]) : flatten(n.c)));
  }

  // --- item di bar dan di menu ------------------------------------------------------------
  function item(node, inMenu) {
    const isFolder = !node.u;
    const showTitle = inMenu || settings.titles === "all" || (settings.titles === "folders" && isFolder) || !node.t;
    const b = el("button", { class: "item", type: "button", title: isFolder ? node.t : `${node.t}\n${node.u}` },
      isFolder ? el("i", { html: FOLDER, style: "display:flex" }) : favicon(node.u),
      showTitle ? el("span", {}, node.t || node.u) : null,
      inMenu && isFolder ? el("span", { class: "arrow", style: "flex:none" }, "›") : null);
    if (!inMenu) b.style.maxWidth = settings.maxWidth + "px";

    if (isFolder) {
      b.addEventListener("click", (e) => { e.stopPropagation(); toggleFolder(b, node.c, inMenu); });
      b.addEventListener("mouseenter", () => {
        if (inMenu) openSub(b, node.c);
        else if (openMenus.length && activeFolder !== b) toggleFolder(b, node.c, false);
      });
      b.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); openAll(node.c); } });
    } else {
      b.addEventListener("click", (e) => open(node.u, e));
      b.addEventListener("auxclick", (e) => { if (e.button === 1) { e.preventDefault(); open(node.u, e); } });
      if (inMenu) b.addEventListener("mouseenter", () => closeFrom(Number(b.closest(".menu").dataset.level) + 1));
    }
    b.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    return b;
  }

  // --- menu folder ------------------------------------------------------------------------
  function menu(nodes, level, extra) {
    const m = el("div", { class: "menu" });
    m.dataset.level = level;
    if (!nodes.length) m.append(el("div", { class: "empty" }, "(kosong)"));
    for (const n of nodes) m.append(item(n, true));
    if (extra) m.append(...extra);
    const links = flatten(nodes);
    if (links.length > 1) {
      const all = el("button", { class: "item", type: "button" }, el("span", {}, `Buka semua (${links.length})`));
      all.addEventListener("click", () => openAll(nodes));
      m.append(el("hr"), all);
    }
    m.addEventListener("mousedown", (e) => e.stopPropagation());
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

  function toggleFolder(btn, nodes, inMenu) {
    if (inMenu) return openSub(btn, nodes);
    const same = activeFolder === btn;
    closeMenus();
    if (same) return;
    activeFolder = btn;
    btn.classList.add("open");
    const r = btn.getBoundingClientRect();
    const m = menu(nodes, 0);
    openMenus.push(m);
    place(m, r.left, r.bottom + 2);
  }

  function openSub(btn, nodes) {
    const level = Number(btn.closest(".menu").dataset.level) + 1;
    if (openMenus[level] && openMenus[level]._from === btn) return;
    closeFrom(level);
    const r = btn.getBoundingClientRect();
    const m = menu(nodes, level);
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

  // --- bar --------------------------------------------------------------------------------
  function build() {
    host = document.createElement("bookmark-bar-2-baris");
    root = host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = CSS;
    bar = el("div", { class: "bar" });
    more = el("button", { class: "item more", type: "button", title: "Bookmark lainnya" }, "»");
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      if (activeFolder === more) return closeMenus();
      closeMenus();
      activeFolder = more;
      more.classList.add("open");
      const r = more.getBoundingClientRect();
      const m = menu(more._nodes || [], 0);
      openMenus.push(m);
      place(m, r.right, r.bottom + 2, true);
    });
    const wrap = el("div", { class: "wrap" }, bar, more);
    layer = el("div");
    hot = el("div", { class: "hot" });
    hot.addEventListener("mouseenter", () => reveal(true));
    wrap.addEventListener("mouseenter", () => reveal(true));
    wrap.addEventListener("mouseleave", () => reveal(false));
    wrap.addEventListener("contextmenu", (e) => {
      if (e.target !== wrap && e.target !== bar) return;
      e.preventDefault();
      closeMenus();
      const manage = el("button", { class: "item", type: "button" }, el("span", {}, "Kelola bookmark…"));
      manage.addEventListener("click", () => { closeMenus(); send({ type: "manage" }); });
      const opts = el("button", { class: "item", type: "button" }, el("span", {}, "Pengaturan bar…"));
      opts.addEventListener("click", () => { closeMenus(); send({ type: "options" }); });
      const m = el("div", { class: "menu" }, manage, opts);
      m.dataset.level = 0;
      m.addEventListener("mousedown", (ev) => ev.stopPropagation());
      openMenus.push(m);
      place(m, e.clientX, e.clientY);
    });
    root.append(style, wrap, hot, layer);
    host._wrap = wrap;

    document.addEventListener("mousedown", (e) => { if (!e.composedPath().includes(host)) closeMenus(); }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); }, true);
    addEventListener("blur", closeMenus);
    addEventListener("resize", () => requestAnimationFrame(layout));
    document.addEventListener("fullscreenchange", apply);
  }

  function render() {
    bar.textContent = "";
    for (const n of data.bar) bar.append(item(n, false));
    if (settings.other && data.other.length) {
      const otherBtn = item({ t: "Bookmark lain", c: data.other }, false);
      otherBtn.style.marginLeft = "auto";
      bar.append(otherBtn);
    }
    if (!data.bar.length) bar.append(el("span", { class: "item", style: "cursor:default;opacity:.7" }, "Bookmark bar kosong"));
    layout();
  }

  // Item yang tidak muat dalam N baris masuk ke tombol ».
  function layout() {
    if (!bar || !host.isConnected) return;
    const limit = settings.rows * ROW_H;
    bar.style.maxHeight = "none";
    const items = [...bar.children];
    const top0 = bar.getBoundingClientRect().top;
    const hiddenNodes = [];
    let used = ROW_H;
    const all = settings.other && data.other.length ? [...data.bar, { t: "Bookmark lain", c: data.other }] : data.bar;
    items.forEach((it, i) => {
      const off = it.getBoundingClientRect().top - top0;
      if (off >= limit - 2) hiddenNodes.push(all[i]);
      else used = Math.max(used, Math.round(off / ROW_H) * ROW_H + ROW_H);
    });
    bar.style.maxHeight = used + "px";
    more._nodes = hiddenNodes.filter(Boolean);
    more.hidden = !more._nodes.length;
    pushPage();
  }

  function height() {
    return host && host._wrap ? host._wrap.getBoundingClientRect().height : 0;
  }

  function pushPage() {
    const de = document.documentElement;
    const shown = host.isConnected && !hidden && !document.fullscreenElement && settings.mode === "push";
    if (shown) {
      if (savedMargin === null) savedMargin = de.style.getPropertyValue("margin-top") || "";
      de.style.setProperty("margin-top", height() + "px", "important");
    } else if (savedMargin !== null) {
      if (savedMargin) de.style.setProperty("margin-top", savedMargin);
      else de.style.removeProperty("margin-top");
      savedMargin = null;
    }
  }

  function reveal(on) {
    if (settings.mode !== "reveal") return;
    clearTimeout(hideTimer);
    if (on) { revealed = true; host._wrap.classList.remove("away"); }
    else hideTimer = setTimeout(() => {
      if (openMenus.length) return reveal(false);
      revealed = false;
      host._wrap.classList.add("away");
    }, 500);
  }

  function apply() {
    const show = !hidden && !excluded() && !document.fullscreenElement;
    if (!show) {
      closeMenus();
      if (host && host.isConnected) host.remove();
      if (host) pushPage();
      return;
    }
    if (!host) build();
    if (!host.isConnected) document.documentElement.append(host);
    host._wrap.classList.toggle("away", settings.mode === "reveal" && !revealed);
    hot.style.display = settings.mode === "reveal" ? "block" : "none";
    render();
  }

  async function refresh() {
    const t = await send({ type: "tree" });
    if (t) { data = t; if (host && host.isConnected) render(); }
  }

  async function init() {
    settings = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
    hidden = (await chrome.storage.local.get({ hidden: false })).hidden;
    const t = await send({ type: "tree" });
    if (t) data = t;
    apply();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") for (const k of Object.keys(DEFAULTS)) if (changes[k]) settings[k] = changes[k].newValue;
    if (area === "local" && changes.hidden) hidden = changes.hidden.newValue;
    apply();
  });
  chrome.runtime.onMessage.addListener((msg) => { if (msg.type === "changed") refresh(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

  init();
})();
