const DEFAULTS = { rows: 2, titles: "all", mode: "push", maxWidth: 170, other: true, exclude: "" };
const $ = (id) => document.getElementById(id);
let timer;

function saved() {
  $("saved").style.opacity = 1;
  clearTimeout(timer);
  timer = setTimeout(() => ($("saved").style.opacity = 0), 1200);
}

chrome.storage.sync.get(DEFAULTS).then((s) => {
  $("rows").value = String(s.rows);
  $("titles").value = s.titles;
  $("maxWidth").value = s.maxWidth;
  $("mode").value = s.mode;
  $("other").checked = s.other;
  $("exclude").value = s.exclude;
});

const save = (key, value) => chrome.storage.sync.set({ [key]: value }).then(saved);
$("rows").addEventListener("change", (e) => save("rows", Number(e.target.value)));
$("titles").addEventListener("change", (e) => save("titles", e.target.value));
$("mode").addEventListener("change", (e) => save("mode", e.target.value));
$("other").addEventListener("change", (e) => save("other", e.target.checked));
$("maxWidth").addEventListener("change", (e) =>
  save("maxWidth", Math.min(400, Math.max(60, Number(e.target.value) || DEFAULTS.maxWidth))));
let typing;
$("exclude").addEventListener("input", (e) => {
  clearTimeout(typing);
  typing = setTimeout(() => save("exclude", e.target.value), 400);
});
