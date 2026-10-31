// Service worker: satu-satunya bagian yang boleh membaca dan mengubah bookmark.
// Tidak ada koneksi ke internet. Fitur status hanya mengetuk alamat lokal yang cocok dengan
// daftar di pengaturan (bawaan: localhost, 192.168.*, 10.*, *.local) untuk tahu hidup/mati.
importScripts("defaults.js");

const settings = async () => ({ ...BB_DEFAULTS, ...(await chrome.storage.sync.get(BB_DEFAULTS)) });
const local = (defaults) => chrome.storage.local.get(defaults);

// --- pohon bookmark -------------------------------------------------------------------------
function simplify(node) {
  return node.url
    ? { id: node.id, t: node.title, u: node.url }
    : { id: node.id, t: node.title, c: (node.children || []).map(simplify) };
}

async function subtree(id) {
  if (!id) return null;
  try {
    const [node] = await chrome.bookmarks.getSubTree(id);
    return node && !node.url ? simplify(node) : null;
  } catch {
    return null;   // folder sudah dihapus
  }
}

function flatten(nodes, path = []) {
  return nodes.flatMap((n) => (n.u ? [{ id: n.id, t: n.t, u: n.u, p: path.join(" › ") }] : flatten(n.c, [...path, n.t])));
}

async function tree() {
  const s = await settings();
  const { activeProfile } = await local({ activeProfile: "kerja" });
  const [root] = await chrome.bookmarks.getTree();
  const [barNode, otherNode] = root.children;
  const bar = simplify(barNode);
  const other = otherNode ? simplify(otherNode) : { id: "", c: [] };
  const personal = s.profileFolder ? await subtree(s.profileFolder) : null;
  const profile = personal ? activeProfile : "kerja";
  const main = profile === "pribadi" ? personal : bar;
  const row2 = profile === "kerja" && s.row2Folder ? await subtree(s.row2Folder) : null;
  return {
    profile,
    profiles: !!personal,
    bar: { id: main.id, c: main.c },
    row2,
    other: { id: other.id, c: other.c },
    all: flatten([...bar.c, ...other.c]),
  };
}

// --- pesan dari bar --------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab && sender.tab.id;
  const done = (p) => { Promise.resolve(p).then(() => reply(true), (e) => reply({ error: String(e.message || e) })); return true; };
  switch (msg.type) {
    case "tree":
      tree().then(reply);
      return true;
    case "open":
      if (msg.where === "window") chrome.windows.create({ url: msg.url });
      else if (msg.where === "incognito") chrome.windows.create({ url: msg.url, incognito: true });
      else if (msg.where === "tab") chrome.tabs.create({ url: msg.url, active: false, openerTabId: tabId });
      else if (tabId != null) chrome.tabs.update(tabId, { url: msg.url });
      return false;
    case "openAll":
      if (msg.where === "window") chrome.windows.create({ url: msg.urls });
      else msg.urls.forEach((url) => chrome.tabs.create({ url, active: false, openerTabId: tabId }));
      return false;
    case "update":
      return done(chrome.bookmarks.update(msg.id, msg.url != null ? { title: msg.title, url: msg.url } : { title: msg.title }));
    case "remove":
      return done(msg.folder ? chrome.bookmarks.removeTree(msg.id) : chrome.bookmarks.remove(msg.id));
    case "create":
      return done(chrome.bookmarks.create({ parentId: msg.parentId, index: msg.index, title: msg.title, url: msg.url }));
    case "move":
      return done(chrome.bookmarks.move(msg.id, { parentId: msg.parentId, index: msg.index }));
    case "folderColor":
      return done(settings().then((s) => {
        const colors = { ...s.folderColors };
        if (msg.color) colors[msg.id] = msg.color; else delete colors[msg.id];
        return chrome.storage.sync.set({ folderColors: colors });
      }));
    case "profileToggle":
      return done(toggleProfile());
    case "checkNow":
      return done(checkStatus().then(checkFavicons));
    case "manage":
      chrome.tabs.create({ url: "chrome://bookmarks/" });
      return false;
    case "options":
      chrome.runtime.openOptionsPage();
      return false;
  }
  return false;
});

// --- bookmark berubah -> semua tab memperbarui barnya -------------------------------------
let timer;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    for (const tab of await chrome.tabs.query({})) {
      chrome.tabs.sendMessage(tab.id, { type: "changed" }).catch(() => {});
    }
    checkStatus();
    checkFavicons();
  }, 300);
}
for (const ev of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"]) {
  chrome.bookmarks[ev].addListener(changed);
}

// --- status online / offline alamat lokal ---------------------------------------------------
function hostPatterns(text) {
  return text.split(/[\s,]+/).map((p) => p.trim().toLowerCase()).filter(Boolean)
    .map((p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
}

async function reachable(origin) {
  const opts = { mode: "no-cors", cache: "no-store", credentials: "omit", redirect: "manual" };
  try {
    await fetch(origin + "/", { ...opts, signal: AbortSignal.timeout(4000) });
    return true;
  } catch {}
  // HTTPS dengan sertifikat sendiri (router, PBX, NAS) gagal di TLS; port yang masih menjawab
  // lewat HTTP berarti perangkatnya hidup.
  if (origin.startsWith("https://")) {
    try {
      await fetch("http://" + origin.slice(8) + "/", { ...opts, signal: AbortSignal.timeout(4000) });
      return true;
    } catch {}
  }
  return false;
}

let checking = false;
async function checkStatus() {
  const s = await settings();
  if (!s.status || checking) return;
  checking = true;
  try {
    const patterns = hostPatterns(s.statusHosts);
    const { all } = await tree();
    const origins = new Set();
    for (const b of all) {
      let u;
      try { u = new URL(b.u); } catch { continue; }
      if (!/^https?:$/.test(u.protocol)) continue;
      if (patterns.some((re) => re.test(u.hostname.toLowerCase()))) origins.add(u.origin);
    }
    const status = {};
    await Promise.all([...origins].map(async (o) => { status[o] = await reachable(o); }));
    await chrome.storage.local.set({ status, statusAt: Date.now() });
  } finally {
    checking = false;
  }
}

// --- bookmark tanpa ikon -> ikon huruf ---------------------------------------------------
async function faviconBytes(pageUrl) {
  const r = await fetch(chrome.runtime.getURL("/_favicon/") + "?pageUrl=" + encodeURIComponent(pageUrl) + "&size=32");
  return new Uint8Array(await r.arrayBuffer());
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

async function checkFavicons() {
  try {
    const blank = await faviconBytes("https://no-favicon.invalid/" + Date.now());
    const { all } = await tree();
    const nofav = {};
    await Promise.all([...new Set(all.map((b) => b.u))].map(async (u) => {
      if (same(await faviconBytes(u), blank)) nofav[u] = true;
    }));
    await chrome.storage.local.set({ nofav });
  } catch {}
}

// --- profil Kerja / Pribadi ------------------------------------------------------------------
function scheduled(s, d) {
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const workday = d.getDay() >= 1 && d.getDay() <= 5;
  return workday && hm >= s.workStart && hm < s.workEnd ? "kerja" : "pribadi";
}

function nextChange(s, now) {
  const current = scheduled(s, now);
  const d = new Date(now);
  d.setSeconds(0, 0);
  for (let i = 0; i < 8 * 24 * 12; i++) {
    d.setMinutes(d.getMinutes() + 5);
    if (scheduled(s, d) !== current) return d.getTime();
  }
  return now.getTime() + 24 * 3600e3;
}

async function computeProfile() {
  const s = await settings();
  const { profileManual, profileChosen } = await local({ profileManual: null, profileChosen: "kerja" });
  const now = new Date();
  let profile = "kerja";
  if (s.profileFolder) {
    if (profileManual && profileManual.until > now.getTime()) profile = profileManual.profile;
    else if (s.profileAuto) profile = scheduled(s, now);
    else profile = profileChosen;
  }
  const { activeProfile } = await local({ activeProfile: null });
  if (activeProfile !== profile) await chrome.storage.local.set({ activeProfile: profile });
  return profile;
}

async function toggleProfile() {
  const s = await settings();
  const next = (await computeProfile()) === "kerja" ? "pribadi" : "kerja";
  if (s.profileAuto) {
    // Ganti manual berlaku sampai jadwal berikutnya berganti.
    await chrome.storage.local.set({ profileManual: { profile: next, until: nextChange(s, new Date()) } });
  } else {
    await chrome.storage.local.set({ profileChosen: next, profileManual: null });
  }
  return computeProfile();
}

// --- jadwal ----------------------------------------------------------------------------------
async function tick() {
  await computeProfile();
  await checkStatus();
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "tick") tick(); });
async function setup() {
  chrome.alarms.create("tick", { periodInMinutes: 1 });
  await tick();
  await checkFavicons();
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (["profileFolder", "profileAuto", "workStart", "workEnd"].some((k) => changes[k])) computeProfile();
  if (changes.status || changes.statusHosts) checkStatus();
});

// --- shortcut dan ikon ekstensi -------------------------------------------------------------
async function toggleBar() {
  const { hidden } = await local({ hidden: false });
  chrome.storage.local.set({ hidden: !hidden });
}
chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd === "toggle-bar") return toggleBar();
  if (cmd === "search") {
    const target = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (target) chrome.tabs.sendMessage(target.id, { type: "search" }).catch(() => {});
  }
  if (cmd === "profile") toggleProfile();
});
chrome.action.onClicked.addListener(toggleBar);
