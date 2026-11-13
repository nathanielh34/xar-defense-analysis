// Drivers tab: table with click-to-expand regression analysis per driver.
(function () {
  const A = (window.DRIVER_ANALYSIS && window.DRIVER_ANALYSIS.drivers) || {};
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const n2 = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
  const pFmt = (p) => (p == null ? "—" : p < 0.0001 ? "< 0.0001" : p.toFixed(4));
  const benchName = (a) => esc(a.bench || "S&P 500");
  const sigPill = (p) => (p == null ? "" : p < 0.05 ? '<span class="pill good">Significant at 5%</span>' : '<span class="pill bad">Not significant</span>');
  const statusPill = (s) => {
    const c = { Significant: "good", "Not significant": "bad", Testing: "mid" }[s] || "";
    return `<span class="pill ${c}">${esc(s)}</span>`;
  };

  // ---------------- SVG chart helpers ----------------
  const W = 520, H = 340, P = { l: 56, r: 16, t: 14, b: 46 };
  function nice(min, max) { const pad = (max - min) * 0.08 || 1; return [min - pad, max + pad]; }
  function ticks(min, max, n = 5) {
    const step = Math.pow(10, Math.floor(Math.log10((max - min) / n)));
    const s = [1, 2, 2.5, 5, 10].map((m) => m * step).find((st) => (max - min) / st <= n) || step * 10;
    const out = []; for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) out.push(+v.toFixed(10)); return out;
  }
  function frame(xr, yr, xl, yl, xFmt = (v) => v, yFmt = (v) => v) {
    const sx = (v) => P.l + ((v - xr[0]) / (xr[1] - xr[0])) * (W - P.l - P.r);
    const sy = (v) => P.t + (1 - (v - yr[0]) / (yr[1] - yr[0])) * (H - P.t - P.b);
    let g = "";
    ticks(...yr).forEach((t) => { g += `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="#eef1f5"/><text x="${P.l - 8}" y="${sy(t) + 4}" text-anchor="end" class="ax">${yFmt(t)}</text>`; });
    if (xl !== null) ticks(...xr).forEach((t) => { g += `<line y1="${P.t}" y2="${H - P.b}" x1="${sx(t)}" x2="${sx(t)}" stroke="#eef1f5"/><text x="${sx(t)}" y="${H - P.b + 16}" text-anchor="middle" class="ax">${xFmt(t)}</text>`; });
    if (xl) g += `<text x="${(P.l + W - P.r) / 2}" y="${H - 6}" text-anchor="middle" class="axl">${esc(xl)}</text>`;
    g += `<text transform="translate(14 ${(P.t + H - P.b) / 2}) rotate(-90)" text-anchor="middle" class="axl">${esc(yl)}</text>`;
    return { sx, sy, g };
  }
  const svg = (inner, title) => `<figure class="plot"><figcaption>${title}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${inner}</svg></figure>`;

  function scatterPlot(a) {
    const xs = a.points.map((p) => p[1]), ys = a.points.map((p) => p[2]);
    const xr = nice(Math.min(...xs), Math.max(...xs)), yr = nice(Math.min(...ys), Math.max(...ys));
    const { sx, sy, g } = frame(xr, yr, a.xLabel, a.yLabel, (v) => v + "%", (v) => v + "%");
    const al = a.coef.alpha.est, b = a.coef.beta.est;
    let s = g;
    if (xr[0] < 0 && xr[1] > 0) s += `<line x1="${sx(0)}" x2="${sx(0)}" y1="${P.t}" y2="${H - P.b}" stroke="#c4cad4"/>`;
    if (yr[0] < 0 && yr[1] > 0) s += `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="#c4cad4"/>`;
    s += a.points.map((p) => `<circle cx="${sx(p[1])}" cy="${sy(p[2])}" r="4.5" class="dot"><title>${p[0]}: ${benchName(a)} ${n2(p[1])}%, XAR ${n2(p[2])}%</title></circle>`).join("");
    s += `<line x1="${sx(xr[0])}" y1="${sy(al + b * xr[0])}" x2="${sx(xr[1])}" y2="${sy(al + b * xr[1])}" class="fit"/>`;
    s += `<text x="${W - P.r - 6}" y="${P.t + 16}" text-anchor="end" class="eq">ŷ = ${n2(al)} + ${n2(b)}x &nbsp; R² = ${n2(a.r2)}</text>`;
    return svg(s, `Regression: XAR vs ${benchName(a)} monthly returns`);
  }

  function residualPlot(a) {
    const xs = a.points.map((p) => p[3]), es = a.points.map((p) => p[4]);
    const m = Math.max(...es.map(Math.abs));
    const xr = nice(Math.min(...xs), Math.max(...xs)), yr = [-m * 1.12, m * 1.12];
    const { sx, sy, g } = frame(xr, yr, "Fitted XAR return, %", "Residual, % points", (v) => v + "%", (v) => v);
    const sd = a.residStd;
    let s = g + `<rect x="${P.l}" width="${W - P.l - P.r}" y="${sy(sd)}" height="${sy(-sd) - sy(sd)}" fill="rgba(46,85,151,.06)"/>`;
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(0)}" y2="${sy(0)}" class="fit"/>`;
    s += a.points.map((p) => `<circle cx="${sx(p[3])}" cy="${sy(p[4])}" r="4.5" class="dot ${Math.abs(p[4]) > 2 * sd ? "out" : ""}"><title>${p[0]}: fitted ${n2(p[3])}%, residual ${n2(p[4])}</title></circle>`).join("");
    return svg(s, "Residuals vs fitted values (shaded band = ±1 std. error)");
  }

  function timePlot(rows, title, yl, opts = {}) {
    const vals = rows.map((r) => r[1]);
    const lo = Math.min(...vals, opts.ref ?? Infinity, 0), hi = Math.max(...vals, opts.ref ?? -Infinity);
    const yr = opts.symmetric ? [-Math.max(...vals.map(Math.abs)) * 1.1, Math.max(...vals.map(Math.abs)) * 1.1] : nice(lo, hi);
    const n = rows.length, xr = [0, n - 1];
    const { sx, sy, g } = frame(xr, yr, null, yl, null, (v) => v);
    let s = g;
    const step = Math.max(1, Math.round(n / 6));
    rows.forEach((r, i) => { if (i % step === 0) s += `<text x="${sx(i)}" y="${H - P.b + 16}" text-anchor="middle" class="ax">${r[0]}</text>`; });
    if (opts.ref != null) s += `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(opts.ref)}" y2="${sy(opts.ref)}" stroke="#98a2b3" stroke-dasharray="4 4"/><text x="${W - P.r}" y="${sy(opts.ref) - 5}" text-anchor="end" class="ax">${opts.refLabel || ""}</text>`;
    if (opts.bars) {
      const bw = Math.max(2, (W - P.l - P.r) / n - 2);
      s += `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(0)}" y2="${sy(0)}" stroke="#98a2b3"/>`;
      s += rows.map((r, i) => `<rect x="${sx(i) - bw / 2}" width="${bw}" y="${Math.min(sy(0), sy(r[1]))}" height="${Math.abs(sy(r[1]) - sy(0))}" fill="${r[1] >= 0 ? "#1a7f4b" : "#c0392b"}" opacity=".75"><title>${r[0]}: ${n2(r[1])}</title></rect>`).join("");
    } else {
      s += `<polyline fill="none" stroke="#1f3864" stroke-width="2" points="${rows.map((r, i) => `${sx(i)},${sy(r[1])}`).join(" ")}"/>`;
      s += rows.map((r, i) => `<circle cx="${sx(i)}" cy="${sy(r[1])}" r="6" fill="transparent"><title>${r[0]}: ${n2(r[1])}</title></circle>`).join("");
    }
    return svg(s, title);
  }

  // ---------------- detail panel ----------------
  function detail(a) {
    const b = a.coef.beta, al = a.coef.alpha, bn = benchName(a);
    const annAlpha = al.est * 12;
    const card = (l, v, sub = "") => `<div class="dstat"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`;
    const flag = (ok, good, bad) => (ok ? `<span class="pill good">${good}</span>` : `<span class="pill mid">${bad}</span>`);
    const interp = [
      `<b>Beta ${n2(b.est)}:</b> over ${esc(a.period)}, when the ${bn} rose 1% in a month, XAR rose about ${n2(b.est)}% on average. ` +
        (b.ciLow > 1 ? `It is significantly <b>more volatile</b> than the ${bn} (the 95% range is entirely above 1).` :
         b.ciHigh < 1 ? `It is significantly <b>less volatile</b> than the ${bn} (the 95% range is entirely below 1).` :
         `The 95% range (${n2(b.ciLow)} to ${n2(b.ciHigh)}) includes 1, so we can't say it is more or less volatile than the ${bn}.`),
      `<b>R² ${n2(a.r2)}:</b> the ${bn} explains about <b>${Math.round(a.r2 * 100)}%</b> of XAR's month-to-month moves. The other <b>${Math.round((1 - a.r2) * 100)}%</b> is what defense-specific drivers (budgets, geopolitics, contracts, the strength index) need to explain.`,
      `<b>Correlation ${n2(a.corr)}:</b> ${Math.abs(a.corr) >= 0.7 ? "a strong" : Math.abs(a.corr) >= 0.4 ? "a moderate" : "a weak"} positive relationship (correlation is the square root of R² in a one-variable regression).`,
      `<b>Alpha ${n2(al.est)}% per month</b> (about ${n2(annAlpha, 1)}% a year): ${al.p < 0.05 ? "statistically significant, so XAR earned returns beyond what its market exposure explains." : `not statistically significant (p = ${pFmt(al.p)}), so there's no evidence XAR beat or lagged the market after adjusting for beta.`}`,
    ];
    const h = a.horizons || {};
    return `
      <div class="dpanel">
        <div class="dhead">
          <div><h3>${esc(a.title)}</h3><p class="muted">${esc(a.question)}</p></div>
          <div class="muted small">${esc(a.period)} · n = ${a.n} months<br>${esc(a.method)}</div>
        </div>
        <div class="dstats">
          ${card("5Y monthly beta", n2(b.est), `95% CI ${n2(b.ciLow)} to ${n2(b.ciHigh)}`)}
          ${card("R²", n2(a.r2), `adj. R² ${n2(a.adjR2)}`)}
          ${card("Correlation", n2(a.corr), `XAR vs ${bn}`)}
          ${card("Alpha (monthly)", n2(al.est) + "%", `p = ${pFmt(al.p)}`)}
          ${card("Beta p-value", pFmt(b.p), "H₀: beta = 0")}
          ${card("Beta ≠ 1 test", `p = ${pFmt(a.betaVsOne.p)}`, "H₀: beta = 1")}
        </div>
        <div class="equation">XAR return = <b>${n2(al.est, 3)}</b> + <b>${n2(b.est, 3)}</b> × ${bn} return + ε</div>
        <ul class="interp">${interp.map((t) => `<li>${t}</li>`).join("")}</ul>

        <div class="plots">${scatterPlot(a)}${residualPlot(a)}</div>
        <div class="plots">
          ${timePlot(a.points.map((p) => [p[0], p[4]]), "Residuals over time (unexplained XAR return each month)", "Residual", { bars: true, symmetric: true })}
          ${a.rollingBeta && a.rollingBeta.length ? timePlot(a.rollingBeta, "Rolling 36-month beta (how stable is beta?)", "Beta", { ref: 1, refLabel: "beta = 1 (moves with market)" }) : ""}
        </div>

        <div class="dtables">
          <div>
            <h4>Regression output</h4>
            <div class="tablewrap"><table>
              <thead><tr><th></th><th class="num">Coef.</th><th class="num">Std. err.</th><th class="num">t</th><th class="num">p-value</th><th class="num">95% CI</th></tr></thead>
              <tbody>
                <tr><td>Alpha (intercept)</td><td class="num">${n2(al.est, 4)}</td><td class="num">${n2(al.se, 4)}</td><td class="num">${n2(al.t)}</td><td class="num">${pFmt(al.p)}</td><td class="num">${n2(al.ciLow, 3)} to ${n2(al.ciHigh, 3)}</td></tr>
                <tr><td>Beta (${bn})</td><td class="num">${n2(b.est, 4)}</td><td class="num">${n2(b.se, 4)}</td><td class="num">${n2(b.t)}</td><td class="num">${pFmt(b.p)}</td><td class="num">${n2(b.ciLow, 3)} to ${n2(b.ciHigh, 3)}</td></tr>
              </tbody></table></div>
            <p class="muted small">n = ${a.n} · R² = ${n2(a.r2, 4)} · Adj. R² = ${n2(a.adjR2, 4)} · F = ${n2(a.fStat)} (p ${pFmt(a.fP)}) · Residual std. error = ${n2(a.residStd)}% ${sigPill(b.p)}</p>
          </div>
          <div>
            <h4>Diagnostics (are the regression's assumptions OK?)</h4>
            <div class="tablewrap"><table>
              <thead><tr><th>Test</th><th class="num">Value</th><th>Reading</th></tr></thead>
              <tbody>
                <tr><td>Durbin-Watson<br><span class="muted small">residuals independent month to month?</span></td><td class="num">${n2(a.durbinWatson)}</td><td>${flag(a.durbinWatson > 1.5 && a.durbinWatson < 2.5, "No autocorrelation", "Possible autocorrelation")}</td></tr>
                <tr><td>Breusch-Pagan<br><span class="muted small">constant residual spread?</span></td><td class="num">p ${pFmt(a.breuschPaganP)}</td><td>${flag(a.breuschPaganP > 0.05, "Constant variance", "Heteroskedasticity")}</td></tr>
                <tr><td>Jarque-Bera<br><span class="muted small">residuals normally distributed?</span></td><td class="num">p ${pFmt(a.jarqueBeraP)}</td><td>${flag(a.jarqueBeraP > 0.05, "Looks normal", "Fat tails / skew")}</td></tr>
                <tr><td>Skew / kurtosis</td><td class="num">${n2(a.skew)} / ${n2(a.kurtosis)}</td><td class="muted small">normal = 0 / 3</td></tr>
              </tbody></table></div>
          </div>
        </div>

        <h4>Does the horizon matter?</h4>
        <div class="tablewrap"><table>
          <thead><tr><th>Sample</th><th class="num">Correlation</th><th class="num">Beta</th><th class="num">Observations</th></tr></thead>
          <tbody>${Object.entries(h).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${n2(v.corr)}</td><td class="num">${n2(v.beta)}</td><td class="num">${v.n}</td></tr>`).join("")}</tbody>
        </table></div>

        <div class="next">
          <h4>What this suggests adding next</h4>
          <ul>
            <li><b>Use this as the baseline.</b> The ${Math.round((1 - a.r2) * 100)}% of variation the market doesn't explain is what each defense driver must account for. Test the next drivers on XAR's <i>residuals</i> (or add them as extra variables) so you aren't re-measuring the market.</li>
            <li><b>Multiple regression:</b> add GPR (geopolitical risk), 10-year yield and VIX changes alongside the ${bn} and watch whether adjusted R² rises.</li>
            ${a.breuschPaganP != null && a.breuschPaganP <= 0.05 ? "<li><b>Robust standard errors</b> (HC1): the Breusch-Pagan test flags changing variance, so p-values should be recomputed with robust errors.</li>" : ""}
            ${a.jarqueBeraP != null && a.jarqueBeraP <= 0.05 ? "<li><b>Check the outliers</b> (red dots in the residual plot): find which months they are and whether a news event explains them. That's a direct link to your strength index.</li>" : "<li><b>Look at the largest residuals</b> and match them to news events; that links this baseline to your strength index.</li>"}
            <li><b>Rolling beta</b> shows whether the relationship is stable; if it shifts a lot, use a shorter window when projecting.</li>
          </ul>
        </div>
      </div>`;
  }

  // ---------------- table ----------------
  window.renderDrivers = function (drivers, tableEl, filtersEl) {
    let filter = "All";
    const open = new Set(Object.keys(A).slice(0, 1)); // first analysed driver starts open
    function draw() {
      const rows = filter === "All" ? drivers : drivers.filter((d) => d.category === filter);
      tableEl.innerHTML = `<thead><tr><th></th><th>Category</th><th>Driver</th><th>Measure</th><th>Source</th><th>Status</th><th>Result</th></tr></thead><tbody>` +
        rows.map((d) => {
          const a = A[d.driver], isOpen = a && open.has(d.driver);
          return `<tr class="${a ? "clickable" : ""} ${isOpen ? "open" : ""}" data-d="${esc(d.driver)}">
              <td class="chev">${a ? (isOpen ? "▾" : "▸") : ""}</td><td>${esc(d.category)}</td><td><b>${esc(d.driver)}</b>${a ? ' <span class="pill blue">Analysis</span>' : ""}</td>
              <td>${esc(d.measure)}</td><td>${esc(d.source)}</td><td>${statusPill(d.status)}</td><td>${esc(d.result)}</td></tr>` +
            (isOpen ? `<tr class="drow"><td colspan="7">${detail(a)}</td></tr>` : "");
        }).join("") + "</tbody>";
      tableEl.querySelectorAll("tr.clickable").forEach((tr) => (tr.onclick = () => {
        const k = tr.dataset.d; open.has(k) ? open.delete(k) : open.add(k); draw();
      }));
    }
    const cats = ["All", ...new Set(drivers.map((d) => d.category))];
    const drawFilters = () => {
      filtersEl.innerHTML = cats.map((c) => `<button class="${c === filter ? "on" : ""}">${esc(c)}</button>`).join("");
      filtersEl.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { filter = cats[i]; drawFilters(); draw(); }));
    };
    drawFilters(); draw();
  };
})();
