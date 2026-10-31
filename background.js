// Service worker: satu-satunya bagian yang boleh membaca bookmark (content script tidak bisa).
// Tidak ada koneksi ke internet sama sekali; semua data tetap di Chrome ini.

function simplify(node) {
  return node.url
    ? { t: node.title, u: node.url }
    : { t: node.title, c: (node.children || []).map(simplify) };
}

async function tree() {
  const [root] = await chrome.bookmarks.getTree();
  const [bar, other] = root.children;
  return {
    bar: (bar.children || []).map(simplify),
    other: other ? (other.children || []).map(simplify) : [],
  };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  const tabId = sender.tab && sender.tab.id;
  if (msg.type === "tree") {
    tree().then(reply);
    return true;
  }
  if (msg.type === "open") {
    if (msg.where === "window") chrome.windows.create({ url: msg.url });
    else if (msg.where === "tab") chrome.tabs.create({ url: msg.url, active: false, openerTabId: tabId });
    else if (tabId != null) chrome.tabs.update(tabId, { url: msg.url });
  }
  if (msg.type === "manage") chrome.tabs.create({ url: "chrome://bookmarks/" });
  if (msg.type === "options") chrome.runtime.openOptionsPage();
});

// Bookmark berubah -> semua tab memperbarui barnya.
let timer;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    for (const tab of await chrome.tabs.query({})) {
      chrome.tabs.sendMessage(tab.id, { type: "changed" }).catch(() => {});
    }
  }, 300);
}
for (const ev of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered", "onImportEnded"]) {
  chrome.bookmarks[ev].addListener(changed);
}

// Alt+Shift+B atau klik ikon ekstensi: tampilkan / sembunyikan di semua tab.
async function toggle() {
  const { hidden } = await chrome.storage.local.get({ hidden: false });
  chrome.storage.local.set({ hidden: !hidden });
}
chrome.commands.onCommand.addListener((cmd) => cmd === "toggle-bar" && toggle());
chrome.action.onClicked.addListener(toggle);
