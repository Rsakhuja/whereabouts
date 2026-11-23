// Whereabouts front end. Plain JS, no build step. Reads data.json (totals only).

const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style") n.style.cssText = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : String(kid));
  return n;
}
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const OUTCOMES = [
  { key: "city", label: "All three right", color: "var(--o-city)" },
  { key: "state", label: "Country and state", color: "var(--o-state)" },
  { key: "country", label: "Country only", color: "var(--o-country)" },
  { key: "wrong", label: "Wrong", color: "var(--o-wrong)" },
];
// The strip shows refusals, and the rare wrong-country answer with the right state or city
// ("partial"), as wrong, so every model's strip still has one cell per photo.
const outcomeCount = (summary, key) =>
  (summary.outcomes[key] ?? 0) + (key === "wrong" ? (summary.outcomes.refused ?? 0) + (summary.outcomes.partial ?? 0) : 0);

async function loadData() {
  const res = await fetch("data.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`data.json: HTTP ${res.status}`);
  return res.json();
}

function legend() {
  return el("ul", { class: "legend", "aria-label": "Round outcomes" },
    OUTCOMES.map((o) => el("li", {},
      el("span", { class: "sw", style: `background:${o.color}` }),
      o.label)));
}

// One cell per round, grouped from best to worst outcome. Only counts are published,
// so cells are sorted by outcome, not in image order.
function strip(summary) {
  const cells = [];
  for (const o of OUTCOMES) {
    for (let i = 0; i < outcomeCount(summary, o.key); i++) {
      cells.push(el("i", { style: `background:${o.color}` }));
    }
  }
  const text = OUTCOMES.map((o) => `${outcomeCount(summary, o.key)} ${o.label.toLowerCase()}`).join(", ");
  return el("div", { class: "strip", role: "img", "aria-label": `${summary.n} rounds: ${text}`, title: text }, cells);
}

function scroller(table) {
  return [el("div", { class: "table-scroll" }, table), el("p", { class: "scroll-hint" }, "Scroll sideways for more columns.")];
}

function emptyState() {
  return el("div", { class: "empty" },
    el("p", {}, "No results published yet."),
    el("p", {}, "Run ", el("code", {}, "npm run bench -- --model <gateway model id>"), ", then ", el("code", {}, "npm run site"), "."));
}

function renderStats(data) {
  for (const n of document.querySelectorAll("[data-stat]")) {
    const k = n.dataset.stat;
    const d = data.dataset;
    n.textContent =
      k === "images" ? d.images :
      k === "countries" ? d.countries :
      k === "regions" ? Object.keys(d.regions).length :
      k === "models" ? data.models.length :
      k === "version" ? d.version :
      k === "updated" ? fmtDate(data.generated_at) :
      k === "landmarks" ? d.landmark_images : n.textContent;
  }
  if (data.repo_url) {
    for (const a of document.querySelectorAll("[data-repo]")) { a.href = data.repo_url; a.hidden = false; }
  }
}

/* ---------- Leaderboard ---------- */

function renderLeaderboard(data) {
  const host = $("#leaderboard");
  const toggleHost = $("#older-toggle");
  const hasOlder = data.models.some((m) => m.older);
  let showOlder = false;
  if (hasOlder) {
    toggleHost.replaceChildren(el("label", {},
      el("input", { type: "checkbox", onchange: (e) => { showOlder = e.target.checked; draw(); } }),
      `Show older models (${data.models.filter((m) => m.older).length})`));
  }
  if (!data.models.length) { host.replaceChildren(emptyState()); return; }

  const cols = [
    { key: "rank", label: "#", cls: "l" },
    { key: "model", label: "Model", cls: "l" },
    { key: "pct", label: "Score", get: (m) => m.summary.pct },
    { key: "strip", label: "Every round, best to worst", cls: "l" },
    { key: "country", label: "Country", get: (m) => m.summary.country },
    { key: "admin", label: "State", get: (m) => m.summary.admin },
    { key: "city", label: "City", get: (m) => m.summary.city },
  ];
  let sortKey = "pct";

  const draw = () => {
    const col = cols.find((c) => c.key === sortKey);
    const rows = data.models.filter((m) => showOlder || !m.older)
      .sort((a, b) => col.get(b) - col.get(a) || b.summary.pct - a.summary.pct);
    const head = el("tr", {}, cols.map((c) => el("th", { scope: "col", class: c.cls, "aria-sort": c.key === sortKey ? "descending" : null },
      c.get ? el("button", { type: "button", onclick: () => { sortKey = c.key; draw(); } }, c.label) : c.label)));
    const body = rows.map((m, i) => {
      const s = m.summary;
      return el("tr", {},
        el("td", { class: "rank l" }, i + 1),
        el("td", { class: "l" },
          el("span", { class: "model-name" }, m.name), m.is_new ? el("span", { class: "tag-new" }, "new") : null,
          el("span", { class: "model-sub" }, `${m.provider}${m.reasoning !== "off" ? `, reasoning ${m.reasoning}` : ""}, run ${fmtDate(m.evaluated_at)}`),
          !m.complete ? el("span", { class: "model-sub" }, "partial run (preview only)") : null),
        el("td", { class: "score" }, el("b", {}, pct(s.pct, 1)), el("small", {}, `${pct(s.ci95[0])}–${pct(s.ci95[1])}`)),
        el("td", { class: "l strip-cell" }, strip(s)),
        el("td", {}, pct(s.country)),
        el("td", {}, pct(s.admin)),
        el("td", {}, pct(s.city)));
    });
    host.replaceChildren(...scroller(el("table", { class: "board" }, el("thead", {}, head), el("tbody", {}, body))));
  };
  draw();
}

function renderRegions(data) {
  const host = $("#regions");
  if (!data.models.length) { host.closest("section").hidden = true; return; }
  const regions = Object.keys(data.dataset.regions);
  const models = data.models.filter((m) => !m.older);
  host.replaceChildren(el("div", { class: "table-scroll" }, el("table", { class: "heat" },
    el("thead", {}, el("tr", {}, el("th", { class: "l", scope: "col" }, "Model"),
      regions.map((r) => el("th", { scope: "col" }, r, el("br"), el("span", { style: "font-weight:400" }, `${data.dataset.regions[r]} images`))))),
    el("tbody", {}, models.map((m) => el("tr", {},
      el("td", { class: "l" }, m.name),
      regions.map((r) => {
        const v = m.summary.byRegion[r]?.pct ?? 0;
        return el("td", { class: "v" }, pct(v), el("span", { style: `width:${Math.max(3, v * 80)}px` }));
      })))))));
}

/* ---------- Clues ---------- */

function renderClues(data) {
  const share = $("#clue-share"), payoff = $("#clue-payoff");
  const models = data.models.filter((m) => !m.older);
  if (!models.length) { share.replaceChildren(emptyState()); payoff.closest("section").hidden = true; return; }
  // Hide categories no model ever cited.
  const cats = data.categories.filter((c) => models.some((m) => (m.summary.clues[c.key]?.cited ?? 0) > 0));
  const header = el("thead", {}, el("tr", {}, el("th", { class: "l", scope: "col" }, "Feature type"),
    models.map((m) => el("th", { scope: "col" }, m.name))));

  share.replaceChildren(el("div", { class: "table-scroll" }, el("table", { class: "heat" }, header.cloneNode(true),
    el("tbody", {}, cats.map((c) => el("tr", {},
      el("td", { class: "l" }, c.label),
      models.map((m) => {
        const v = m.summary.clues[c.key]?.share ?? 0;
        return el("td", { class: "v" }, pct(v), el("span", { style: `width:${Math.max(3, v * 80)}px` }));
      })))))));

  payoff.replaceChildren(el("div", { class: "table-scroll" }, el("table", { class: "heat" }, header.cloneNode(true),
    el("tbody", {},
      el("tr", {}, el("td", { class: "l" }, el("b", {}, "All rounds (baseline)")),
        models.map((m) => el("td", { class: "v" }, pct(m.summary.city), el("small", {}, `${m.summary.n} rounds`)))),
      cats.map((c) => el("tr", {},
        el("td", { class: "l" }, c.label),
        models.map((m) => {
          const k = m.summary.clues[c.key];
          if (!k || k.cited < 3) return el("td", { class: "na", title: "Too few rounds to say" }, k?.cited ? `n=${k.cited}` : "–");
          const diff = Math.round((k.cityWhenCited - m.summary.city) * 100);
          const rel = diff === 0 ? "same as baseline" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)} pts`;
          return el("td", { class: "v" }, pct(k.cityWhenCited), el("small", {}, `${k.cited} rounds, ${rel}`));
        })))))));
}

/* ---------- Boot ---------- */

loadData().then((data) => {
  renderStats(data);
  if ($("#leaderboard")) { renderLeaderboard(data); $("#legend")?.replaceChildren(legend()); }
  if ($("#regions")) renderRegions(data);
  if ($("#clue-share")) renderClues(data);
}).catch((err) => {
  $("main")?.prepend(el("div", { class: "empty", style: "margin:32px 0" },
    el("p", {}, `Couldn't load results (${err.message}).`),
    el("p", {}, "If you're running locally, build the data first with ", el("code", {}, "npm run site"), ".")));
});
