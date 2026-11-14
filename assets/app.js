(function () {
  const RESULTS = window.RESULTS || null;
  const DRIVERS = (window.DRIVERS || []).map((d) => {
    const da = window.DRIVER_ANALYSIS && window.DRIVER_ANALYSIS.drivers && window.DRIVER_ANALYSIS.drivers[d.driver];
    if (da) return { ...d, status: da.status, result: da.result };
    const r = RESULTS && RESULTS.drivers && RESULTS.drivers[d.driver];
    return r ? { ...d, status: r.status, result: r.result } : d;
  });
  const PROJECTIONS = window.PROJECTIONS || [];
  const FINDINGS = (window.FINDINGS || []).slice().sort((a, b) => b.date.localeCompare(a.date));

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n, d = 2) => (n === null || n === undefined || n === "" ? "—" : Number(n).toFixed(d));
  const signed = (n) => (n > 0 ? `<span class="pos">+${n}</span>` : n < 0 ? `<span class="neg">${n}</span>` : "0");

  // ---------- Tabs ----------
  function showTab() {
    const id = (location.hash || "#overview").slice(1);
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === id));
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", showTab);

  // ---------- Generic sortable table ----------
  function renderTable(el, cols, rows) {
    let sortKey = null, dir = 1;
    function draw() {
      const data = rows.slice();
      if (sortKey) data.sort((a, b) => {
        const x = a[sortKey], y = b[sortKey];
        if (x == null) return 1; if (y == null) return -1;
        return (x > y ? 1 : x < y ? -1 : 0) * dir;
      });
      const head = "<tr>" + cols.map((c) => `<th data-k="${c.key}">${c.label}${sortKey === c.key ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("") + "</tr>";
      const body = data.length
        ? data.map((r) => "<tr>" + cols.map((c) => `<td class="${c.num ? "num" : ""}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join("") + "</tr>").join("")
        : `<tr><td class="empty" colspan="${cols.length}">No entries yet</td></tr>`;
      el.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
      el.querySelectorAll("th").forEach((th) => th.onclick = () => {
        const k = th.dataset.k; dir = sortKey === k ? -dir : 1; sortKey = k; draw();
      });
    }
    draw();
    return (newRows) => { rows = newRows; draw(); };
  }

  function filterBar(el, values, onChange) {
    const all = ["All", ...values];
    let cur = "All";
    function draw() {
      el.innerHTML = all.map((v) => `<button class="${v === cur ? "on" : ""}">${esc(v)}</button>`).join("");
      el.querySelectorAll("button").forEach((b, i) => b.onclick = () => { cur = all[i]; draw(); onChange(cur); });
    }
    draw();
  }

  const statusPill = (s) => {
    const cls = { "Significant": "good", "Confirmed": "good", "Not significant": "bad", "Rejected": "bad", "Testing": "mid", "Idea": "blue" }[s] || "";
    return `<span class="pill ${cls}">${esc(s)}</span>`;
  };

  // ---------- Projections ----------
  const projRows = PROJECTIONS.map((p) => {
    const hasActual = p.actual != null && p.projected != null;
    const errPct = hasActual ? ((p.actual - p.projected) / p.projected) * 100 : null;
    const inBand = hasActual && p.low != null && p.high != null ? (p.actual >= p.low && p.actual <= p.high) : null;
    const dirRight = hasActual && p.priceAtMade != null ? Math.sign(p.projected - p.priceAtMade) === Math.sign(p.actual - p.priceAtMade) : null;
    return { ...p, errPct, inBand, dirRight };
  });
  const scored = projRows.filter((r) => r.errPct != null);
  const mape = scored.length ? scored.reduce((s, r) => s + Math.abs(r.errPct), 0) / scored.length : null;
  const dirScored = scored.filter((r) => r.dirRight != null);
  const dirHit = dirScored.length ? (dirScored.filter((r) => r.dirRight).length / dirScored.length) * 100 : null;
  const bandScored = scored.filter((r) => r.inBand != null);
  const bandHit = bandScored.length ? (bandScored.filter((r) => r.inBand).length / bandScored.length) * 100 : null;

  const stat = (v, l) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`;

  // ---------- Render ----------
  $("#stats").innerHTML =
    (window.STRENGTH && window.STRENGTH.now ? stat(signed(Math.round(window.STRENGTH.now.index)), "Strength index now") + stat(window.STRENGTH.coverage.articles.toLocaleString(), "Headlines scored") : "") +
    stat(PROJECTIONS.length, "Projections logged") +
    stat(DRIVERS.filter((d) => d.status === "Significant").length + " / " + DRIVERS.length, "Drivers significant") +
    stat(FINDINGS.length, "Findings") +
    (RESULTS ? stat(RESULTS.beta.toFixed(2), "XAR beta vs S&P 500") + stat(Math.round(RESULTS.r2Market * 100) + "%", "Moves explained by market") : "");

  window.renderDrivers(DRIVERS, $("#driverTable"), $("#driverFilters"));


  $("#projStats").innerHTML =
    stat(scored.length + " / " + projRows.length, "Projections resolved") +
    stat(mape == null ? "—" : fmt(mape, 1) + "%", "Avg. absolute error") +
    stat(dirHit == null ? "—" : fmt(dirHit, 0) + "%", "Direction correct") +
    stat(bandHit == null ? "—" : fmt(bandHit, 0) + "%", "Actual inside range");

  renderTable($("#projTable"), [
    { key: "made", label: "Made" },
    { key: "target", label: "Target" },
    { key: "method", label: "Method" },
    { key: "priceAtMade", label: "Price then", num: true, render: (r) => fmt(r.priceAtMade) },
    { key: "projected", label: "Projected", num: true, render: (r) => fmt(r.projected) },
    { key: "low", label: "Range", num: true, render: (r) => r.low == null ? "—" : `${fmt(r.low)}–${fmt(r.high)}` },
    { key: "indexValue", label: "Index", num: true, render: (r) => r.indexValue == null ? "—" : signed(r.indexValue) },
    { key: "actual", label: "Actual", num: true, render: (r) => fmt(r.actual) },
    { key: "errPct", label: "Error", num: true, render: (r) => r.errPct == null ? "—" : `<span class="${Math.abs(r.errPct) < 5 ? "pos" : "neg"}">${fmt(r.errPct, 1)}%</span>` },
    { key: "note", label: "Note" },
  ], projRows);

  function drawFindings(status) {
    const list = status === "All" ? FINDINGS : FINDINGS.filter((f) => f.status === status);
    $("#findingList").innerHTML = list.length ? list.map((f) => `
      <article class="finding">
        <h3>${esc(f.title)}</h3>
        <div class="meta">${esc(f.date)} ${statusPill(f.status)} ${(f.tags || []).map((t) => `<span class="pill">${esc(t)}</span>`).join(" ")}</div>
        <p>${esc(f.body)}</p>
      </article>`).join("") : `<div class="empty">No findings in this category yet.</div>`;
  }
  filterBar($("#findingFilters"), ["Confirmed", "Testing", "Rejected", "Idea"], drawFindings);
  drawFindings("All");

  showTab();
})();
