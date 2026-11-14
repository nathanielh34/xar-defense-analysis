"""
XAR news strength index ("card counting" on defense headlines).

1. Collect: Google News searches over weekly date windows (same method for the
   5-year backfill and for ongoing updates, so volume is comparable over time).
   Headlines are stored in data/news/<year>.jsonl.
2. Score: keyword rules in data/scoring_rules.json give each headline +1 / 0 / -1.
   Manual overrides in data/score_overrides.json win over the rules.
3. Index: running total with decay. Each day:
       index = index_yesterday * 0.5^(1/half_life) + today's scores
   so a headline counts fully today, half after `halfLifeDays`, a quarter after twice that...
   Also "tone" = decayed score sum / decayed article count (between -1 and +1),
   which doesn't depend on how many headlines were found.
4. Backtest: monthly regressions of XAR returns on the index.

Usage:
    python scripts/strength_index.py                 # fetch the last ~2 weeks, rebuild
    python scripts/strength_index.py --backfill 2021-06-01 [--hours 4.5]
    python scripts/strength_index.py --rebuild-only  # just rescore + rebuild outputs
"""
import argparse
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
NEWS_DIR = ROOT / "data" / "news"
COVERAGE = NEWS_DIR / "_coverage.json"
RULES = ROOT / "data" / "scoring_rules.json"
OVERRIDES = ROOT / "data" / "score_overrides.json"
OUT_JS = ROOT / "data" / "strength.js"
OUT_CSV = ROOT / "data" / "strength_daily.csv"
MARKET = ROOT / "data" / "market.js"
NY = ZoneInfo("America/New_York")
UA = {"User-Agent": "Mozilla/5.0 (xar-defense-analysis research project; +https://github.com/nathanielh34/xar-defense-analysis)"}
PER_QUERY_CAP = 40      # headlines kept per query per week
RECENT_N = 400          # articles embedded directly in the site

QUERIES = [
    ("Defense stocks", 'defense stocks OR "defense contractor" OR "defense industry" OR "defense ETF"'),
    ("Prime contractors", '"Lockheed Martin" OR "Northrop Grumman" OR "RTX Corp" OR Raytheon OR "General Dynamics" OR L3Harris'),
    ("Budget & policy", '"Pentagon budget" OR "defense spending" OR NDAA OR "defense budget" OR "NATO spending"'),
    ("Conflict", '(war OR invasion OR ceasefire OR airstrike OR "missile strike") military'),
    ("Contracts & arms sales", '"Pentagon contract" OR "defense contract" OR "Army contract" OR "Navy contract" OR "Air Force contract" OR "arms sale" OR "foreign military sale"'),
]


# ----------------------------------------------------------------- collection
def gnews_url(q, after, before):
    full = f"{q} after:{after.isoformat()} before:{before.isoformat()}"
    return "https://news.google.com/rss/search?q=" + urllib.parse.quote(full) + "&hl=en-US&gl=US&ceid=US:en"


def norm_title(t):
    return re.sub(r"[^a-z0-9 ]+", "", t.lower()).strip()


def art_id(title):
    return hashlib.sha1(norm_title(title).encode()).hexdigest()[:10]


def fetch(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                return r.read()
        except Exception as e:
            code = getattr(e, "code", None)
            wait = 30 * (k + 1) if code in (429, 503) else 5 * (k + 1)
            print(f"    fetch error ({e}); retry in {wait}s")
            time.sleep(wait)
    return None


def parse_items(xml_bytes, topic):
    out = []
    root = ET.fromstring(xml_bytes)
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        src_el = it.find("source")
        source = src_el.text.strip() if src_el is not None and src_el.text else ""
        if source and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        try:
            d = parsedate_to_datetime(it.findtext("pubDate")).astimezone(NY).date().isoformat()
        except Exception:
            continue
        if title:
            out.append({"id": art_id(title), "date": d, "title": title, "source": source,
                        "link": (it.findtext("link") or "").strip(), "topic": topic})
        if len(out) >= PER_QUERY_CAP:
            break
    return out


def load_archive():
    arts = {}
    for f in sorted(NEWS_DIR.glob("*.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip():
                a = json.loads(line)
                arts.setdefault(a["id"], a)
    return arts


def save_archive(arts):
    NEWS_DIR.mkdir(parents=True, exist_ok=True)
    by_year = {}
    for a in sorted(arts.values(), key=lambda a: (a["date"], a["id"])):
        by_year.setdefault(a["date"][:4], []).append(a)
    for y, rows in by_year.items():
        (NEWS_DIR / f"{y}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def week_of(d):
    d = date.fromisoformat(d) if isinstance(d, str) else d
    return (d - timedelta(days=d.weekday())).isoformat()


def collect_window(arts, start, end):
    """Fetch all queries for one Monday-to-Monday week and merge into arts.
    Each (week, query) keeps at most PER_QUERY_CAP headlines however often it is
    fetched, so live weeks and backfilled weeks have comparable volume."""
    new = 0
    have = {}
    for a in arts.values():
        k = (week_of(a["date"]), a["topic"])
        have[k] = have.get(k, 0) + 1
    for topic, q in QUERIES:
        xml = fetch(gnews_url(q, start - timedelta(days=1), end))  # Google's after/before are exclusive
        time.sleep(1.2)
        if not xml:
            continue
        try:
            items = parse_items(xml, topic)
        except ET.ParseError:
            continue
        for a in items:
            k = (week_of(a["date"]), topic)
            if start.isoformat() <= a["date"] < end.isoformat() and a["id"] not in arts and have.get(k, 0) < PER_QUERY_CAP:
                arts[a["id"]] = a
                have[k] = have.get(k, 0) + 1
                new += 1
    return new


def week_starts(start, end):
    d = start - timedelta(days=start.weekday())
    while d < end:
        yield d
        d += timedelta(days=7)


def query_version():
    return hashlib.sha1(json.dumps([QUERIES, PER_QUERY_CAP]).encode()).hexdigest()[:8]


def backfill(arts, since, hours):
    cov = json.loads(COVERAGE.read_text()) if COVERAGE.exists() else {}
    if cov.get("_queries") != query_version():
        # Searches changed: collect the history again so every week uses the same searches
        print("Search set changed; starting the backfill from scratch.")
        arts.clear()
        for f in NEWS_DIR.glob("*.jsonl"):
            f.unlink()
        cov = {"_queries": query_version()}
    t0 = time.time()
    today = datetime.now(NY).date()
    for ws in week_starts(since, today - timedelta(days=today.weekday() + 14)):
        key = ws.isoformat()
        if key in cov:
            continue
        if time.time() - t0 > hours * 3600:
            print("Time budget reached; will resume next run.")
            break
        n = collect_window(arts, ws, ws + timedelta(days=7))
        cov[key] = n
        print(f"  week {key}: +{n} headlines")
        if len(cov) % 10 == 0:
            save_archive(arts); COVERAGE.write_text(json.dumps(cov, indent=0))
    recent(arts)  # make sure the latest weeks are present too
    COVERAGE.parent.mkdir(parents=True, exist_ok=True)
    COVERAGE.write_text(json.dumps(cov, indent=0))


def recent(arts):
    today = datetime.now(NY).date()
    this_week = today - timedelta(days=today.weekday())
    n = 0
    for ws in (this_week - timedelta(days=14), this_week - timedelta(days=7), this_week):
        n += collect_window(arts, ws, ws + timedelta(days=7))
    print(f"Recent window: +{n} headlines")
    save_archive(arts)


# ----------------------------------------------------------------- scoring
def load_rules():
    cfg = json.loads(RULES.read_text(encoding="utf-8"))
    rules = [(r["label"], float(r["weight"]), re.compile(r["pattern"], re.I)) for r in cfg["rules"]]
    return cfg, rules


def load_overrides():
    try:
        return json.loads(OVERRIDES.read_text(encoding="utf-8")).get("overrides", {})
    except Exception:
        return {}


def score_all(arts, rules, overrides, cfg=None):
    cfg = cfg or {}
    rel = re.compile(cfg["relevance"], re.I) if cfg.get("relevance") else None
    exc = re.compile(cfg["exclude"], re.I) if cfg.get("exclude") else None
    for a in arts.values():
        a["skip"] = bool((exc and exc.search(a["title"])) or (rel and not rel.search(a["title"])))
        hits = [(lab, w) for lab, w, p in rules if p.search(a["title"])]
        s = sum(w for _, w in hits)
        a["auto"] = 1 if s > 0 else -1 if s < 0 else 0
        a["why"] = [lab for lab, _ in hits]
        o = overrides.get(a["id"])
        a["score"] = int(o["score"]) if o and "score" in o else a["auto"]
        a["over"] = bool(o)
        if o:
            a["skip"] = False  # a manual score always counts
        if a["skip"]:
            a["score"] = 0


# ----------------------------------------------------------------- index
def build_index(arts, half_life):
    if not arts:
        return []
    lam = 0.5 ** (1 / half_life)
    by_day = {}
    for a in arts.values():
        if a.get("skip"):
            continue
        d = by_day.setdefault(a["date"], [0, 0])
        d[0] += a["score"]; d[1] += 1
    day = date.fromisoformat(min(by_day))
    end = datetime.now(NY).date()
    idx = cnt = 0.0
    window = []
    series = []
    while day <= end:
        s, c = by_day.get(day.isoformat(), [0, 0])
        idx = idx * lam + s
        cnt = cnt * lam + c
        window.append(c); window = window[-7:]
        series.append([day.isoformat(), round(idx, 2), round(idx / cnt, 3) if cnt > 0.5 else None, sum(window)])
        day += timedelta(days=1)
    return series


# ----------------------------------------------------------------- backtest
def load_market():
    try:
        m = re.search(r"window\.MARKET\s*=\s*(\{.*\})\s*;", MARKET.read_text(encoding="utf-8"), re.S)
        return json.loads(m.group(1))
    except Exception:
        return None


def ols(x, y):
    import numpy as np
    import statsmodels.api as sm
    x, y = np.asarray(x, float), np.asarray(y, float)
    res = sm.OLS(y, sm.add_constant(x)).fit()
    return {"coef": round(float(res.params[1]), 4), "se": round(float(res.bse[1]), 4), "t": round(float(res.tvalues[1]), 3),
            "p": round(float(res.pvalues[1]), 5), "r2": round(float(res.rsquared), 4), "n": int(res.nobs),
            "corr": round(float(np.corrcoef(x, y)[0, 1]), 3), "alpha": round(float(res.params[0]), 4)}


def backtest(series):
    import pandas as pd
    mk = load_market()
    if not mk or not series:
        return None, []
    s = pd.DataFrame(series, columns=["date", "index", "tone", "count7"]).set_index(pd.to_datetime([r[0] for r in series]))
    xar = pd.Series({pd.Timestamp(r[0]): r[4] for r in mk["daily"]})
    spy = pd.Series({pd.Timestamp(r[0]): r[1] for r in mk.get("spyDaily", [])})
    m = pd.DataFrame({
        "index": s["index"].resample("ME").last(),
        "tone": s["tone"].resample("ME").mean(),
        "count": s["count7"].resample("ME").mean(),
        "xar": xar.resample("ME").last(), "spy": spy.resample("ME").last(),
    })
    now = pd.Timestamp.now()
    m = m[m.index < pd.Timestamp(now.year, now.month, 1)]  # completed months only
    m["dIndex"] = m["index"].diff()
    m["dTone"] = m["tone"].diff()
    m["xarRet"] = m["xar"].pct_change() * 100
    m["spyRet"] = m["spy"].pct_change() * 100
    m["excess"] = m["xarRet"] - m["spyRet"]
    m["xarNext"] = m["xarRet"].shift(-1)
    m["excessNext"] = m["excess"].shift(-1)
    m = m.dropna(subset=["index"])
    tests = []
    spec = [
        ("Same month", "Change in index", "XAR return", "dIndex", "xarRet"),
        ("Same month", "Change in index", "XAR minus S&P 500", "dIndex", "excess"),
        ("Same month", "Change in tone", "XAR minus S&P 500", "dTone", "excess"),
        ("Predict next month", "Index level at month end", "Next month XAR return", "index", "xarNext"),
        ("Predict next month", "Index level at month end", "Next month XAR minus S&P 500", "index", "excessNext"),
        ("Predict next month", "Average tone", "Next month XAR minus S&P 500", "tone", "excessNext"),
    ]
    for kind, xl, yl, xc, yc in spec:
        d = m[[xc, yc]].dropna()
        if len(d) >= 12:
            tests.append({"kind": kind, "x": xl, "y": yl, **ols(d[xc], d[yc])})
    monthly = [[i.strftime("%Y-%m"), *[None if pd.isna(v) else round(float(v), 3) for v in row]]
               for i, row in m[["index", "dIndex", "tone", "count", "xarRet", "spyRet", "excess"]].iterrows()]
    return tests, monthly


# ----------------------------------------------------------------- outputs
def write_outputs(arts, cfg, series, tests, monthly):
    rows = sorted(arts.values(), key=lambda a: (a["date"], a["id"]), reverse=True)
    pack = lambda a: [a["id"], a["date"], a["score"], a["auto"], int(a["over"]), a["title"], a["source"], a["link"], a["topic"], a["why"], int(a.get("skip", False))]
    # Scored archive per year, loaded on demand by the site
    years = sorted({a["date"][:4] for a in rows})
    for y in years:
        yr = [pack(a) for a in rows if a["date"][:4] == y]
        (NEWS_DIR / f"scored_{y}.js").write_text(
            f"// Generated. Scored headlines for {y}.\n(window.SCORED = window.SCORED || {{}})['{y}'] = "
            + json.dumps(yr, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    last = series[-1] if series else [None, 0, None, 0]
    ago30 = series[-31] if len(series) > 30 else (series[0] if series else last)
    cutoff = (datetime.now(NY).date() - timedelta(days=30)).isoformat()
    a30 = [a for a in rows if a["date"] >= cutoff and not a.get("skip")]
    out = {
        "updated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "halfLifeDays": cfg.get("halfLifeDays", 14),
        "queries": [q[0] for q in QUERIES],
        "rules": [{"label": r["label"], "weight": r["weight"]} for r in cfg["rules"]],
        "now": {"date": last[0], "index": last[1], "tone": last[2], "count7": last[3],
                "change30": round(last[1] - ago30[1], 2) if series else None,
                "articles30": len(a30), "pos30": sum(a["score"] > 0 for a in a30), "neg30": sum(a["score"] < 0 for a in a30)},
        "coverage": {"start": series[0][0] if series else None, "articles": sum(not a.get("skip") for a in rows), "ignored": sum(bool(a.get("skip")) for a in rows),
                     "scored": sum(a["score"] != 0 for a in rows), "overrides": sum(a["over"] for a in rows), "years": years},
        "series": series,
        "recent": [pack(a) for a in rows[:RECENT_N]],
        "backtest": tests,
        "monthly": monthly,  # [month, index, dIndex, tone, count7avg, xarRet, spyRet, excess]
    }
    OUT_JS.write_text("// Generated by scripts/strength_index.py. Do not edit by hand.\nwindow.STRENGTH = "
                      + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    OUT_CSV.write_text("date,index,tone,count7\n" + "".join(f"{d},{i},{'' if t is None else t},{c}\n" for d, i, t, c in series), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", help="start date YYYY-MM-DD")
    ap.add_argument("--hours", type=float, default=4.5)
    ap.add_argument("--rebuild-only", action="store_true")
    args = ap.parse_args()

    arts = load_archive()
    if args.backfill:
        backfill(arts, date.fromisoformat(args.backfill), args.hours)
    elif not args.rebuild_only:
        recent(arts)

    cfg, rules = load_rules()
    score_all(arts, rules, load_overrides(), cfg)
    series = build_index(arts, cfg.get("halfLifeDays", 14))
    try:
        tests, monthly = backtest(series)
    except Exception as e:
        print("Backtest failed:", e); tests, monthly = None, []
    write_outputs(arts, cfg, series, tests, monthly)
    print(f"Strength index: {len(arts)} headlines, index now {series[-1][1] if series else '—'}")


if __name__ == "__main__":
    main()
