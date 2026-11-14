// Strength Index tab: decayed headline index vs XAR, weekly volume, headline log with overrides, backtest, rules.
(function () {
  const S = window.STRENGTH, M = window.MARKET, LC = window.LightweightCharts;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!$("#index")) return;
  if (!S || !S.series || !S.series.length) { $("#siEmpty").hidden = false; $("#siBody").hidden = true; return; }

  const n1 = (v, d = 1) => (v == null ? "—" : Number(v).toFixed(d));
  const sgn = (v, d = 1) => (v == null ? "—" : (v > 0 ? "+" : "") + Number(v).toFixed(d));
  const cls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
  const pFmt = (p) => (p == null ? "—" : p < 0.001 ? "< 0.001" : p.toFixed(3));
  const scorePill = (s) => `<span class="spill ${s > 0 ? "p" : s < 0 ? "n" : "z"}">${s > 0 ? "+1" : s < 0 ? "−1" : "0"}</span>`;
  $("#siHalf").textContent = S.halfLifeDays;

  // ---------------- summary cards ----------------
  const now = S.now, cov = S.coverage;
  const stat = (v, l, sub = "") => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div>${sub ? `<div class="l small">${sub}</div>` : ""}</div>`;
  $("#siStats").innerHTML =
    stat(`<span class="${cls(now.index)}">${sgn(now.index)}</span>`, "Strength index now", `as of ${esc(now.date)}`) +
    stat(`<span class="${cls(now.change30)}">${sgn(now.change30)}</span>`, "Change over 30 days") +
    stat(`<span class="${cls(now.tone)}">${now.tone == null ? "—" : sgn(now.tone * 100, 0) + "%"}</span>`, "Tone", "net share of positive headlines") +
    stat(`${now.articles30}`, "Headlines, last 30 days", `<span class="pos">${now.pos30} positive</span> · <span class="neg">${now.neg30} negative</span>`) +
    stat(cov.articles.toLocaleString(), "Headlines since " + esc((cov.start || "").slice(0, 7)), `${cov.ignored ? cov.ignored.toLocaleString() + " off-topic ignored · " : ""}${cov.overrides} overrides`);

  // ---------------- charts ----------------
  let built = false, logMonthSetter = null;
  function build() {
    if (built) return; built = true;
    const base = {
      autoSize: true,
      layout: { background: { type: "solid", color: "#fff" }, textColor: "#5b6577", fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12 },
      grid: { vertLines: { color: "#eef1f5" }, horzLines: { color: "#eef1f5" } },
      rightPriceScale: { borderVisible: false, minimumWidth: 64 },
      leftPriceScale: { borderVisible: false, visible: true, minimumWidth: 64 },
      timeScale: { borderVisible: false, rightOffset: 2 },
      crosshair: { mode: LC.CrosshairMode.Normal },
    };
    const ch = LC.createChart($("#siChart"), { ...base, timeScale: { ...base.timeScale, visible: false } });
    const vc = LC.createChart($("#siVolChart"), { ...base, layout: { ...base.layout, attributionLogo: false }, handleScroll: false, handleScale: false });
    const idx = ch.addBaselineSeries({ baseValue: { type: "price", price: 0 }, priceScaleId: "right", lineWidth: 2,
      topLineColor: "#1a7f4b", topFillColor1: "rgba(26,127,75,.28)", topFillColor2: "rgba(26,127,75,.04)",
      bottomLineColor: "#c0392b", bottomFillColor1: "rgba(192,57,43,.04)", bottomFillColor2: "rgba(192,57,43,.28)", priceLineVisible: false, title: "Index" });
    const xar = ch.addLineSeries({ priceScaleId: "left", color: "#1f3864", lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, title: "XAR" });
    const vol = vc.addHistogramSeries({ color: "rgba(46,85,151,.55)", priceLineVisible: false, lastValueVisible: false });
    vc.applyOptions({ leftPriceScale: { visible: true } });

    // weekly volume from daily count7 on each Sunday
    const weekly = S.series.filter((r) => new Date(r[0] + "T00:00:00Z").getUTCDay() === 0 || r === S.series[S.series.length - 1]);
    const xarDaily = (M && M.daily || []).filter((r) => r[4] != null).map((r) => ({ time: r[0], value: r[4] }));
    const state = { range: "ALL", mode: "Index", xar: true };

    // Sync the two charts by time range
    let syncing = false;
    vol.setData(weekly.filter((r) => r[3] != null).map((r) => ({ time: r[0], value: r[3] })));
    ch.timeScale().subscribeVisibleTimeRangeChange((r) => {
      if (!r || syncing) return; syncing = true;
      try { vc.timeScale().setVisibleRange(r); } catch (e) { /* volume chart not ready yet */ }
      syncing = false;
    });

    function draw() {
      const tone = state.mode === "Tone";
      idx.applyOptions({ title: tone ? "Tone %" : "Index" });
      idx.setData(S.series.map((r) => (tone ? (r[2] == null ? { time: r[0] } : { time: r[0], value: Math.round(r[2] * 1000) / 10 }) : { time: r[0], value: r[1] })));
      xar.applyOptions({ visible: state.xar });
      ch.applyOptions({ leftPriceScale: { visible: state.xar } });
      xar.setData(xarDaily.filter((p) => p.time >= S.series[0][0]));
      const last = S.series[S.series.length - 1][0];
      const back = { "6M": 182, "1Y": 365, "3Y": 1095 }[state.range];
      if (back) {
        const d = new Date(last + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - back);
        ch.timeScale().setVisibleRange({ from: d.toISOString().slice(0, 10), to: last });
      } else ch.timeScale().fitContent();
      legend(null);
      segs.forEach((f) => f());
    }
    function legend(t) {
      const r = t ? S.series.find((x) => x[0] === t) : S.series[S.series.length - 1];
      if (!r) return;
      const px = xarDaily.find((p) => p.time === r[0]);
      $("#siLegend").innerHTML = `<b>${r[0]}</b> &nbsp; Index <b class="${cls(r[1])}">${sgn(r[1])}</b> &nbsp; Tone <b class="${cls(r[2])}">${r[2] == null ? "—" : sgn(r[2] * 100, 0) + "%"}</b> &nbsp; Headlines (7 days) <b>${r[3]}</b>${px && state.xar ? ` &nbsp; <span style="color:#1f3864">XAR <b>${px.value.toFixed(2)}</b></span>` : ""}`;
    }
    ch.subscribeCrosshairMove((p) => legend(p && p.time ? (typeof p.time === "string" ? p.time : `${p.time.year}-${String(p.time.month).padStart(2, "0")}-${String(p.time.day).padStart(2, "0")}`) : null));
    const toISO = (t) => (typeof t === "string" ? t : `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`);
    [ch, vc].forEach((c) => c.subscribeClick((p) => { if (p && p.time && logMonthSetter) { logMonthSetter(toISO(p.time).slice(0, 7)); $("#siLogTitle").scrollIntoView({ behavior: "smooth" }); } }));

    const segs = [];
    function seg(el, opts, isOn, onClick) {
      const r = () => { el.innerHTML = opts.map((o) => `<button class="${isOn(o) ? "on" : ""}">${o}</button>`).join(""); el.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { onClick(opts[i]); draw(); })); };
      segs.push(r); r();
    }
    seg($("#siRange"), ["6M", "1Y", "3Y", "ALL"], (o) => o === state.range, (o) => (state.range = o));
    seg($("#siMode"), ["Index", "Tone"], (o) => o === state.mode, (o) => (state.mode = o));
    seg($("#siOverlay"), ["XAR price"], () => state.xar, () => (state.xar = !state.xar));
    draw();
  }

  // ---------------- headline log ----------------
  // row: [id, date, score, auto, overridden, title, source, link, topic, why[]]
  const loaded = { recent: S.recent };
  const months = [];
  { const end = new Date((S.now.date || S.series[S.series.length - 1][0]) + "T00:00:00Z"), start = new Date(S.series[0][0] + "T00:00:00Z");
    for (let d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)); d >= start; d.setUTCMonth(d.getUTCMonth() - 1)) months.push(d.toISOString().slice(0, 7)); }
  const log = { month: "recent", score: "All", q: "", limit: 100 };
  const sel = $("#siMonth");
  sel.innerHTML = `<option value="recent">Latest ${S.recent.length} headlines</option>` + months.map((m) => `<option value="${m}">${new Date(m + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</option>`).join("");
  sel.onchange = () => { log.month = sel.value; log.limit = 100; drawLog(); };
  logMonthSetter = (m) => { sel.value = m; log.month = m; log.limit = 100; drawLog(); };

  function loadYear(y) {
    return new Promise((res) => {
      if (window.SCORED && window.SCORED[y]) return res(window.SCORED[y]);
      const s = document.createElement("script");
      s.src = `data/news/scored_${y}.js?v=${encodeURIComponent(S.updated)}`;
      s.onload = () => res((window.SCORED && window.SCORED[y]) || []);
      s.onerror = () => res(null);
      document.head.appendChild(s);
    });
  }

  const scoreSeg = $("#siScoreFilter");
  function drawScoreSeg() {
    const opts = ["All", "+1", "0", "−1", "Overridden", "Ignored"];
    scoreSeg.innerHTML = opts.map((o) => `<button class="${o === log.score ? "on" : ""}">${o}</button>`).join("");
    scoreSeg.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { log.score = opts[i]; log.limit = 100; drawScoreSeg(); drawLog(); }));
  }
  drawScoreSeg();
  $("#siSearch").oninput = (e) => { log.q = e.target.value.toLowerCase(); log.limit = 100; drawLog(); };

  async function drawLog() {
    let rows;
    if (log.month === "recent") rows = S.recent;
    else {
      $("#siTable").innerHTML = `<tbody><tr><td class="empty">Loading ${log.month}…</td></tr></tbody>`;
      const yr = await loadYear(log.month.slice(0, 4));
      if (!yr) { $("#siTable").innerHTML = `<tbody><tr><td class="empty">Couldn't load that year's headlines.</td></tr></tbody>`; return; }
      rows = yr.filter((r) => r[1].startsWith(log.month));
    }
    const f = rows.filter((r) =>
      (log.score === "Ignored" ? r[10] : !r[10]) &&
      (log.score === "All" || log.score === "Ignored" || (log.score === "+1" && r[2] > 0) || (log.score === "0" && r[2] === 0) || (log.score === "−1" && r[2] < 0) || (log.score === "Overridden" && r[4])) &&
      (!log.q || r[5].toLowerCase().includes(log.q) || r[6].toLowerCase().includes(log.q)));
    const pos = f.filter((r) => r[2] > 0).length, neg = f.filter((r) => r[2] < 0).length;
    $("#siCount").innerHTML = `${f.length} headlines · <span class="pos">${pos} +1</span> · <span class="neg">${neg} −1</span>`;
    const shown = f.slice(0, log.limit);
    $("#siTable").innerHTML = `<thead><tr><th>Date</th><th>Score</th><th>Headline</th><th>Why</th><th></th></tr></thead><tbody>` +
      (shown.length ? shown.map((r) => `<tr>
        <td class="nowrap">${r[1]}</td>
        <td>${r[10] ? '<span class="pill">ignored</span>' : scorePill(r[2])}${r[4] ? `<div class="muted small" title="Automatic score was ${r[3]}">edited</div>` : ""}</td>
        <td><a href="${esc(r[7])}" target="_blank" rel="noopener" class="hl">${esc(r[5])}</a><div class="muted small">${esc(r[6])} · ${esc(r[8])} · <span class="mono">${r[0]}</span></div></td>
        <td>${(r[9] || []).map((w) => `<span class="pill">${esc(w)}</span>`).join(" ")}</td>
        <td><button class="btn small" data-id="${r[0]}">Change</button></td></tr>`).join("") : `<tr><td colspan="5" class="empty">No headlines match.</td></tr>`) + "</tbody>";
    $("#siTable").querySelectorAll("button[data-id]").forEach((b) => (b.onclick = () => openDialog(f.find((r) => r[0] === b.dataset.id))));
    $("#siMore").innerHTML = f.length > log.limit ? `<button class="btn small" id="siMoreBtn">Show ${Math.min(100, f.length - log.limit)} more</button>` : "";
    if (f.length > log.limit) $("#siMoreBtn").onclick = () => { log.limit += 100; drawLog(); };
  }
  drawLog();

  // ---------------- override dialog ----------------
  const dlg = { row: null, score: 0 };
  function snippet() {
    const by = $("#siDlgBy").value.trim(), note = $("#siDlgNote").value.trim();
    const o = { score: dlg.score }; if (by) o.by = by; if (note) o.note = note;
    $("#siDlgSnippet").textContent = `"${dlg.row[0]}": ${JSON.stringify(o)}`;
  }
  function drawDlgScore() {
    const el = $("#siDlgScore");
    el.innerHTML = [1, 0, -1].map((v) => `<button class="${v === dlg.score ? "on" : ""}">${v > 0 ? "+1" : v < 0 ? "−1" : "0"}</button>`).join("");
    el.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { dlg.score = [1, 0, -1][i]; drawDlgScore(); snippet(); }));
  }
  function openDialog(r) {
    dlg.row = r; dlg.score = r[2] > 0 ? -1 : r[2] < 0 ? 1 : 1;
    $("#siDlgTitle").textContent = r[5];
    $("#siDlgAuto").innerHTML = `Current score ${scorePill(r[2])} · keyword rules gave ${scorePill(r[3])}${(r[9] || []).length ? " (" + r[9].map(esc).join(", ") + ")" : " (no rules matched)"}`;
    drawDlgScore(); snippet();
    $("#siDialog").hidden = false;
  }
  $("#siDlgBy").oninput = snippet; $("#siDlgNote").oninput = snippet;
  $("#siDlgClose").onclick = () => ($("#siDialog").hidden = true);
  $("#siDialog").onclick = (e) => { if (e.target.id === "siDialog") $("#siDialog").hidden = true; };
  $("#siDlgCopy").onclick = async () => {
    try { await navigator.clipboard.writeText($("#siDlgSnippet").textContent); $("#siDlgCopy").textContent = "Copied ✓"; }
    catch { const r = document.createRange(); r.selectNodeContents($("#siDlgSnippet")); getSelection().removeAllRanges(); getSelection().addRange(r); $("#siDlgCopy").textContent = "Selected, press Ctrl+C"; }
    setTimeout(() => ($("#siDlgCopy").textContent = "Copy line"), 2000);
  };

  // ---------------- backtest ----------------
  const bt = S.backtest || [];
  $("#siBacktest").innerHTML = bt.length ? `<thead><tr><th>Test</th><th class="num">Coef.</th><th class="num">p-value</th><th class="num">R²</th><th class="num">Corr.</th><th class="num">n</th><th>Reading</th></tr></thead><tbody>` +
    bt.map((t) => `<tr><td><b>${esc(t.kind)}</b><div class="muted small">${esc(t.y)} on ${esc(t.x.toLowerCase())}</div></td>
      <td class="num ${cls(t.coef)}">${sgn(t.coef, 3)}</td><td class="num">${pFmt(t.p)}</td><td class="num">${n1(t.r2, 3)}</td><td class="num">${sgn(t.corr, 2)}</td><td class="num">${t.n}</td>
      <td>${t.p < 0.05 ? `<span class="pill good">Significant${t.coef > 0 ? ", positive" : ", negative"}</span>` : t.p < 0.1 ? '<span class="pill mid">Weak evidence</span>' : '<span class="pill">No evidence</span>'}</td></tr>`).join("") + "</tbody>"
    : `<tbody><tr><td class="empty">The backtest needs at least 12 months of index history.</td></tr></tbody>`;

  // ---------------- rules ----------------
  $("#siRules").innerHTML = `<thead><tr><th>Rule</th><th class="num">Weight</th></tr></thead><tbody>` +
    S.rules.map((r) => `<tr><td>${esc(r.label)}</td><td class="num ${cls(r.weight)}">${sgn(r.weight, r.weight % 1 ? 1 : 0)}</td></tr>`).join("") + "</tbody>";

  // ---------------- lazy chart build ----------------
  function maybe() { if ((location.hash || "#overview") === "#index") requestAnimationFrame(build); }
  window.addEventListener("hashchange", maybe); maybe();
})();
