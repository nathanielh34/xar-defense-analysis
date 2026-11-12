// XAR Watch tab: quote, interactive chart with MACD & RSI, key stats, performance, headlines.
(function () {
  const M = window.MARKET;
  const LC = window.LightweightCharts;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  if (!$("#watch")) return;

  if (!M || !M.daily || !M.daily.length || !LC) {
    $("#watchEmpty").hidden = false;
    $("#watchBody").hidden = true;
    return;
  }

  // ---------- colors ----------
  const C = { up: "#1a7f4b", down: "#c0392b", upSoft: "rgba(26,127,75,.45)", downSoft: "rgba(192,57,43,.45)",
    navy: "#1f3864", blue: "#2e5597", orange: "#d9822b", purple: "#7b4fb3", grid: "#eef1f5", text: "#5b6577",
    sma50: "#d9822b", sma200: "#7b4fb3" };

  // ---------- number formatting ----------
  const f2 = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fPct = (n) => (n == null ? "—" : (n > 0 ? "+" : "") + n.toFixed(2) + "%");
  const fVol = (n) => (n == null ? "—" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n));
  const cls = (n) => (n == null ? "" : n > 0 ? "pos" : n < 0 ? "neg" : "");

  // ---------- data ----------
  const toBars = (rows) => rows.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] }));
  const daily = toBars(M.daily);
  const intraday = toBars(M.intraday || []);

  // ---------- indicators ----------
  function ema(vals, n) {
    const k = 2 / (n + 1), out = new Array(vals.length).fill(null);
    let prev = null, sum = 0;
    for (let i = 0; i < vals.length; i++) {
      if (i < n - 1) { sum += vals[i]; continue; }
      if (i === n - 1) { sum += vals[i]; prev = sum / n; out[i] = prev; continue; }
      prev = vals[i] * k + prev * (1 - k); out[i] = prev;
    }
    return out;
  }
  function sma(vals, n) {
    const out = new Array(vals.length).fill(null); let s = 0;
    for (let i = 0; i < vals.length; i++) { s += vals[i]; if (i >= n) s -= vals[i - n]; if (i >= n - 1) out[i] = s / n; }
    return out;
  }
  function macd(vals, fast = 12, slow = 26, sig = 9) {
    const ef = ema(vals, fast), es = ema(vals, slow);
    const line = vals.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
    const start = line.findIndex((v) => v != null);
    const sigPart = start < 0 ? [] : ema(line.slice(start), sig);
    const signal = line.map((_, i) => (i < start ? null : sigPart[i - start]));
    const hist = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
    return { line, signal, hist };
  }
  function rsi(vals, n = 14) {
    const out = new Array(vals.length).fill(null);
    if (vals.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = vals[i] - vals[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n; out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    for (let i = n + 1; i < vals.length; i++) {
      const d = vals[i] - vals[i - 1];
      g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  }
  function withIndicators(bars) {
    const closes = bars.map((b) => b.close);
    return { bars, macd: macd(closes), rsi: rsi(closes), sma50: sma(closes, 50), sma200: sma(closes, 200) };
  }
  function toWeekly(bars) {
    const out = [];
    for (const b of bars) {
      const d = new Date(b.time + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const wk = d.toISOString().slice(0, 10), w = out[out.length - 1];
      if (w && w.key === wk) { w.high = Math.max(w.high, b.high); w.low = Math.min(w.low, b.low); w.close = b.close; w.volume += b.volume; }
      else out.push({ key: wk, time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    }
    return out.map(({ key, ...b }) => b);
  }
  const D = withIndicators(daily);
  const W = withIndicators(toWeekly(daily));
  const I = withIndicators(intraday);

  // ---------- quote header ----------
  const q = M.quote || {};
  $("#qPrice").textContent = f2(q.price);
  $("#qChange").innerHTML = `<span class="${cls(q.change)}">${q.change > 0 ? "+" : ""}${f2(q.change)} (${fPct(q.changePct)})</span>`;
  $("#qAsOf").textContent = `As of ${q.asOf || "—"} ET · delayed, updated about every 2 hours on weekdays`;

  // ---------- signals ----------
  const li = daily.length - 1;
  const rsiNow = D.rsi[li], mNow = D.macd.hist[li], mPrev = D.macd.hist[li - 1];
  const s50 = D.sma50[li], s200 = D.sma200[li], px = daily[li].close;
  const rsiLabel = rsiNow == null ? ["—", ""] : rsiNow >= 70 ? ["Overbought", "bad"] : rsiNow <= 30 ? ["Oversold", "good"] : ["Neutral", ""];
  const macdLabel = mNow == null ? ["—", ""] : mNow > 0 ? [mNow > mPrev ? "Bullish, strengthening" : "Bullish, fading", "good"] : [mNow < mPrev ? "Bearish, strengthening" : "Bearish, fading", "bad"];
  const trendLabel = s200 == null ? ["—", ""] : px > s50 && s50 > s200 ? ["Uptrend", "good"] : px < s50 && s50 < s200 ? ["Downtrend", "bad"] : ["Mixed", "mid"];
  const sig = (name, val, label) => `<div class="sig"><div class="sig-n">${name}</div><div class="sig-v">${val}</div><span class="pill ${label[1]}">${label[0]}</span></div>`;
  $("#signals").innerHTML =
    sig("RSI (14)", rsiNow == null ? "—" : rsiNow.toFixed(1), rsiLabel) +
    sig("MACD hist.", mNow == null ? "—" : mNow.toFixed(2), macdLabel) +
    sig("Trend (50/200-day)", s50 == null ? "—" : `${f2(s50)} / ${f2(s200)}`, trendLabel);

  // ---------- key stats ----------
  const ytdBase = daily.filter((b) => b.time < new Date().getFullYear() + "-01-01").pop();
  const offHigh = q.high52 ? ((q.price / q.high52 - 1) * 100) : null;
  const stat = (l, v) => `<div class="kstat"><div class="l">${l}</div><div class="v">${v}</div></div>`;
  $("#keyStats").innerHTML =
    stat("Previous close", f2(q.prevClose)) +
    stat("Open", f2(q.open)) +
    stat("Day's range", `${f2(q.dayLow)} – ${f2(q.dayHigh)}`) +
    stat("52-week range", `${f2(q.low52)} – ${f2(q.high52)}`) +
    stat("Volume", fVol(q.volume)) +
    stat("Avg. volume (3M)", fVol(q.avgVolume3m)) +
    stat("Beta vs S&amp;P 500 (1Y)", M.beta1y == null ? "—" : M.beta1y.toFixed(2)) +
    stat("From 52-week high", `<span class="${cls(offHigh)}">${fPct(offHigh)}</span>`) +
    stat("YTD return (price)", ytdBase ? `<span class="${cls(q.price - ytdBase.close)}">${fPct((q.price / ytdBase.close - 1) * 100)}</span>` : "—");

  // 52-week range bar
  if (q.low52 != null && q.high52 != null) {
    const p = Math.max(0, Math.min(100, ((q.price - q.low52) / (q.high52 - q.low52)) * 100));
    $("#range52").innerHTML = `
      <div class="r52-top"><span>52-week low<br><b>${f2(q.low52)}</b><small>${esc(q.low52Date)}</small></span>
        <span class="r52-mid">Current price sits <b>${p.toFixed(0)}%</b> of the way from the 52-week low to the high</span>
        <span class="r">52-week high<br><b>${f2(q.high52)}</b><small>${esc(q.high52Date)}</small></span></div>
      <div class="r52-bar"><div class="r52-fill" style="width:${p}%"></div><div class="r52-dot" style="left:${p}%"></div></div>`;
  }

  // ---------- performance table ----------
  const perf = M.performance || {};
  const periods = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y"];
  const names = { XAR: 'XAR <span class="muted small">equal-weight A&amp;D</span>', ITA: 'ITA <span class="muted small">cap-weight A&amp;D</span>', SPY: 'SPY <span class="muted small">S&amp;P 500</span>' };
  $("#perfTable").innerHTML = `<thead><tr><th>Total return</th>${periods.map((p) => `<th class="num">${p}</th>`).join("")}</tr></thead><tbody>` +
    ["XAR", "ITA", "SPY"].filter((t) => perf[t]).map((t) =>
      `<tr><td class="nowrap"><b>${names[t]}</b></td>${periods.map((p) => `<td class="num ${cls(perf[t][p])}">${fPct(perf[t][p])}</td>`).join("")}</tr>`).join("") +
    `</tbody>`;

  // ---------- news ----------
  const news = M.news || [];
  const ago = (iso) => {
    if (!iso) return "";
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 60) return m + "m ago"; const h = Math.round(m / 60);
    if (h < 48) return h + "h ago"; return Math.round(h / 24) + "d ago";
  };
  $("#newsUpdated").textContent = M.updated ? "Updated " + ago(M.updated) : "";
  const topics = [...new Set(news.map((n) => n.topic))];
  let topic = "All";
  function drawNews() {
    $("#newsFilters").innerHTML = ["All", ...topics].map((t) => `<button class="${t === topic ? "on" : ""}">${esc(t)}</button>`).join("");
    $("#newsFilters").querySelectorAll("button").forEach((b) => (b.onclick = () => { topic = b.textContent; drawNews(); }));
    const list = topic === "All" ? news : news.filter((n) => n.topic === topic);
    $("#newsList").innerHTML = list.length ? list.map((n) => `
      <a class="news-item" href="${esc(n.link)}" target="_blank" rel="noopener">
        <div class="news-title">${esc(n.title)}</div>
        <div class="news-meta">${esc(n.source)} · ${ago(n.published)}</div>
      </a>`).join("") : `<div class="empty">No headlines yet.</div>`;
  }
  drawNews();

  // ---------- charts (built when the tab is first shown, so they get a real width) ----------
  let built = false;
  function buildCharts() {
    if (built) return; built = true;
    const base = {
      autoSize: true,
      layout: { background: { type: "solid", color: "#ffffff" }, textColor: C.text, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 12 },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderVisible: false, minimumWidth: 72 },
      timeScale: { borderVisible: false, rightOffset: 3, minBarSpacing: 0.1 },
      crosshair: { mode: LC.CrosshairMode.Normal },
    };
    const main = LC.createChart($("#priceChart"), { ...base, timeScale: { ...base.timeScale, visible: false } });
    const mc = LC.createChart($("#macdChart"), { ...base, layout: { ...base.layout, attributionLogo: false }, timeScale: { ...base.timeScale, visible: false }, handleScroll: false, handleScale: false });
    const rc = LC.createChart($("#rsiChart"), { ...base, layout: { ...base.layout, attributionLogo: false }, handleScroll: false, handleScale: false });

    const candles = main.addCandlestickSeries({ upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down, priceLineColor: C.navy });
    const area = main.addAreaSeries({ lineColor: C.navy, topColor: "rgba(31,56,100,.25)", bottomColor: "rgba(31,56,100,0)", lineWidth: 2, visible: false });
    const vol = main.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const l50 = main.addLineSeries({ color: C.sma50, lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const l200 = main.addLineSeries({ color: C.sma200, lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });

    const mh = mc.addHistogramSeries({ lastValueVisible: false, priceLineVisible: false });
    const ml = mc.addLineSeries({ color: C.blue, lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false });
    const ms = mc.addLineSeries({ color: C.orange, lineWidth: 1.5, lastValueVisible: false, priceLineVisible: false });

    const rl = rc.addLineSeries({ color: C.purple, lineWidth: 1.5, priceLineVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) });
    rl.createPriceLine({ price: 70, color: C.down, lineStyle: LC.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "70" });
    rl.createPriceLine({ price: 30, color: C.up, lineStyle: LC.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "30" });
    rl.createPriceLine({ price: 50, color: "#c4cad4", lineStyle: LC.LineStyle.Dotted, lineWidth: 1, axisLabelVisible: false, title: "" });

    // Keep the three panes scrolled/zoomed together
    let syncing = false;
    [main, mc, rc].forEach((src) => src.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (!r || syncing) return; syncing = true;
      [main, mc, rc].forEach((c) => { if (c !== src) c.timeScale().setVisibleLogicalRange(r); });
      syncing = false;
    }));

    const state = { range: "1Y", type: "Candles", sma50: true, sma200: true, volume: true };
    let cur = null; // current slice

    const val = (arr, i, bars) => (arr[i] == null ? { time: bars[i].time } : { time: bars[i].time, value: arr[i] });

    function slice() {
      if (state.range === "1D" || state.range === "5D") {
        const src = I; if (!src.bars.length) return null;
        let from = 0;
        if (state.range === "1D") {
          const lastDay = new Date(src.bars[src.bars.length - 1].time * 1000).toISOString().slice(0, 10);
          from = src.bars.findIndex((b) => new Date(b.time * 1000).toISOString().slice(0, 10) === lastDay);
        }
        return { src, from, intraday: true };
      }
      const lastT = daily[daily.length - 1].time, d = new Date(lastT + "T00:00:00Z");
      const back = { "1M": [0, 1], "3M": [0, 3], "6M": [0, 6], "1Y": [1, 0], "5Y": [5, 0] }[state.range];
      let start = "0000-00-00";
      if (state.range === "YTD") start = lastT.slice(0, 4) + "-01-01";
      else if (back) { d.setUTCFullYear(d.getUTCFullYear() - back[0]); d.setUTCMonth(d.getUTCMonth() - back[1]); start = d.toISOString().slice(0, 10); }
      const src = state.range === "5Y" || state.range === "MAX" ? W : D;
      const from = Math.max(0, src.bars.findIndex((b) => b.time >= start));
      return { src, from, intraday: false, weekly: src === W };
    }

    function draw() {
      cur = slice();
      if (!cur) return;
      const { src, from, intraday: intra } = cur;
      const bars = src.bars.slice(from);
      const idx = bars.map((_, k) => k + from);
      const showC = state.type === "Candles";
      candles.applyOptions({ visible: showC }); area.applyOptions({ visible: !showC });
      candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      area.setData(bars.map((b) => ({ time: b.time, value: b.close })));
      vol.applyOptions({ visible: state.volume });
      vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? C.upSoft : C.downSoft })));
      l50.applyOptions({ visible: state.sma50 && !intra }); l200.applyOptions({ visible: state.sma200 && !intra });
      l50.setData(idx.map((i) => val(src.sma50, i, src.bars)));
      l200.setData(idx.map((i) => val(src.sma200, i, src.bars)));
      mh.setData(idx.map((i) => {
        const h = src.macd.hist[i], p = src.macd.hist[i - 1];
        if (h == null) return { time: src.bars[i].time };
        const color = h >= 0 ? (p != null && h < p ? "rgba(26,127,75,.45)" : C.up) : (p != null && h > p ? "rgba(192,57,43,.45)" : C.down);
        return { time: src.bars[i].time, value: h, color };
      }));
      ml.setData(idx.map((i) => val(src.macd.line, i, src.bars)));
      ms.setData(idx.map((i) => val(src.macd.signal, i, src.bars)));
      rl.setData(idx.map((i) => val(src.rsi, i, src.bars)));
      [main, mc, rc].forEach((c) => c.applyOptions({ timeScale: { timeVisible: intra, secondsVisible: false } }));
      main.timeScale().fitContent();
      setLegend(null);
    }

    // Legend (shows the bar under the cursor, or the latest bar)
    function setLegend(i) {
      if (!cur) return;
      const bars = cur.src.bars, k = i == null ? bars.length - 1 : i;
      const b = bars[k]; if (!b) return;
      const prev = bars[k - 1];
      const ch = prev ? (b.close / prev.close - 1) * 100 : null;
      const t = typeof b.time === "number" ? new Date(b.time * 1000).toISOString().slice(0, 16).replace("T", " ") + " ET" : b.time;
      $("#legend").innerHTML = `${cur.weekly ? '<span class="pill">Weekly bars</span> ' : ""}<b>${cur.weekly ? "Week of " : ""}${t}</b> &nbsp; O <b>${f2(b.open)}</b> H <b>${f2(b.high)}</b> L <b>${f2(b.low)}</b> C <b>${f2(b.close)}</b> <span class="${cls(ch)}">${fPct(ch)}</span> &nbsp; Vol <b>${fVol(b.volume)}</b>` +
        (!cur.intraday && state.sma50 ? ` &nbsp; <span style="color:${C.sma50}">SMA50${cur.weekly ? "w" : ""} ${f2(cur.src.sma50[k])}</span>` : "") +
        (!cur.intraday && state.sma200 ? ` &nbsp; <span style="color:${C.sma200}">SMA200${cur.weekly ? "w" : ""} ${f2(cur.src.sma200[k])}</span>` : "");
      const m = cur.src.macd;
      $("#macdLegend").innerHTML = `&nbsp; <span style="color:${C.blue}">MACD ${m.line[k] == null ? "—" : m.line[k].toFixed(2)}</span> <span style="color:${C.orange}">Signal ${m.signal[k] == null ? "—" : m.signal[k].toFixed(2)}</span> <span>Hist ${m.hist[k] == null ? "—" : m.hist[k].toFixed(2)}</span>`;
      $("#rsiLegend").innerHTML = `&nbsp; <span style="color:${C.purple}">${cur.src.rsi[k] == null ? "—" : cur.src.rsi[k].toFixed(1)}</span>`;
    }
    const indexOfTime = (t) => cur.src.bars.findIndex((b) => b.time === t);
    main.subscribeCrosshairMove((p) => {
      if (!p || p.time == null) { mc.clearCrosshairPosition(); rc.clearCrosshairPosition(); setLegend(null); return; }
      const k = indexOfTime(p.time); setLegend(k < 0 ? null : k);
      if (k >= 0) {
        const h = cur.src.macd.hist[k], r = cur.src.rsi[k];
        if (h != null) mc.setCrosshairPosition(h, p.time, mh); else mc.clearCrosshairPosition();
        if (r != null) rc.setCrosshairPosition(r, p.time, rl); else rc.clearCrosshairPosition();
      }
    });

    // Toolbar
    function seg(el, opts, isOn, onClick) {
      const render = () => {
        el.innerHTML = opts.map((o) => `<button class="${isOn(o) ? "on" : ""}">${o}</button>`).join("");
        el.querySelectorAll("button").forEach((b, i) => (b.onclick = () => { onClick(opts[i]); render(); draw(); }));
      };
      render();
    }
    const ranges = (intraday.length ? ["1D", "5D"] : []).concat(["1M", "3M", "6M", "YTD", "1Y", "5Y", "MAX"]);
    seg($("#rangeBtns"), ranges, (o) => o === state.range, (o) => (state.range = o));
    seg($("#typeBtns"), ["Candles", "Line"], (o) => o === state.type, (o) => (state.type = o));
    seg($("#overlayBtns"), ["SMA 50", "SMA 200", "Volume"],
      (o) => (o === "SMA 50" ? state.sma50 : o === "SMA 200" ? state.sma200 : state.volume),
      (o) => { if (o === "SMA 50") state.sma50 = !state.sma50; else if (o === "SMA 200") state.sma200 = !state.sma200; else state.volume = !state.volume; });

    draw();
  }

  function maybeBuild() { if ((location.hash || "#overview") === "#watch") requestAnimationFrame(buildCharts); }
  window.addEventListener("hashchange", maybeBuild);
  maybeBuild();
})();
