"""
Fetch XAR market data and defense-sector headlines for the "XAR Watch" tab.

Runs automatically on GitHub (see .github/workflows/update-market.yml) and
writes data/market.js. You can also run it yourself:
    pip install yfinance pandas
    python scripts/fetch_market.py

If any piece fails (a feed is down, Yahoo hiccups), the previous data for
that piece is kept so the site never goes blank.
"""
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "market.js"
TZ = "America/New_York"
UA = {"User-Agent": "Mozilla/5.0 (xar-defense-analysis; +https://github.com/nathanielh34/xar-defense-analysis)"}

NEWS_FEEDS = [
    # (label, url)
    ("XAR & defense ETFs", "https://news.google.com/rss/search?q=" + urllib.parse.quote('"XAR" OR "aerospace and defense ETF" OR "defense ETF" when:14d') + "&hl=en-US&gl=US&ceid=US:en"),
    ("Defense stocks", "https://news.google.com/rss/search?q=" + urllib.parse.quote('defense stocks OR "Lockheed Martin" OR "Northrop Grumman" OR "RTX" OR "General Dynamics" when:7d') + "&hl=en-US&gl=US&ceid=US:en"),
    ("Budget & policy", "https://news.google.com/rss/search?q=" + urllib.parse.quote('Pentagon budget OR NDAA OR "defense spending" when:7d') + "&hl=en-US&gl=US&ceid=US:en"),
    ("Defense News", "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml"),
    ("Breaking Defense", "https://breakingdefense.com/feed/"),
]


# ---------------------------------------------------------------- helpers
def load_previous():
    if not OUT.exists():
        return {}
    m = re.search(r"window\.MARKET\s*=\s*(\{.*\})\s*;", OUT.read_text(encoding="utf-8"), re.S)
    try:
        return json.loads(m.group(1)) if m else {}
    except Exception:
        return {}


def r2(x, d=2):
    return None if x is None or x != x else round(float(x), d)


def pct(a, b):
    return None if not a or not b else round((a / b - 1) * 100, 2)


# ---------------------------------------------------------------- prices
def fetch_prices():
    import yfinance as yf

    daily = yf.Ticker("XAR").history(period="max", interval="1d", auto_adjust=False)
    daily = daily.dropna(subset=["Close"])
    if daily.empty:
        raise RuntimeError("no daily data")

    intraday = yf.Ticker("XAR").history(period="60d", interval="15m", auto_adjust=False).dropna(subset=["Close"])
    spy_d = yf.Ticker("SPY").history(start="2011-09-01", interval="1d", auto_adjust=False).dropna(subset=["Close"])
    spy_i = yf.Ticker("SPY").history(period="60d", interval="15m", auto_adjust=False).dropna(subset=["Close"])
    comp = yf.download(["XAR", "SPY", "ITA"], period="6y", interval="1d", auto_adjust=True, progress=False)["Close"].dropna()

    # Daily bars: "YYYY-MM-DD" times
    d_rows = [[ts.strftime("%Y-%m-%d"), r2(r.Open), r2(r.High), r2(r.Low), r2(r.Close), int(r.Volume)]
              for ts, r in daily.iterrows()]

    # Intraday bars: shift New York wall-clock time to fake-UTC epoch seconds so the chart shows ET
    def fake_utc(index):
        return [int((ts - pd.Timestamp("1970-01-01")).total_seconds()) for ts in index.tz_convert(TZ).tz_localize(None)]

    i_rows = []
    if not intraday.empty:
        for t, (_, r) in zip(fake_utc(intraday.index), intraday.iterrows()):
            i_rows.append([t, r2(r.Open), r2(r.High), r2(r.Low), r2(r.Close), int(r.Volume)])

    # S&P 500 (SPY) closes for the comparison overlay
    spy_daily = [[ts.strftime("%Y-%m-%d"), r2(c)] for ts, c in spy_d["Close"].items()]
    spy_intraday = [[t, r2(c)] for t, c in zip(fake_utc(spy_i.index), spy_i["Close"])] if not spy_i.empty else []

    last = daily.iloc[-1]
    prev = daily.iloc[-2]
    yr = daily.loc[daily.index >= daily.index[-1] - pd.Timedelta(days=365)]
    hi_i, lo_i = yr["High"].idxmax(), yr["Low"].idxmin()

    # Live-ish quote from intraday if today's bar exists there
    price = float(intraday["Close"].iloc[-1]) if not intraday.empty else float(last.Close)
    if not intraday.empty and intraday.index[-1].date() != daily.index[-1].date():
        price = float(last.Close)  # intraday feed is behind; use the daily close
    as_of = (intraday.index[-1] if not intraday.empty else daily.index[-1]).tz_convert(TZ).strftime("%Y-%m-%d %H:%M")

    quote = {
        "price": r2(price),
        "prevClose": r2(prev.Close),
        "change": r2(price - prev.Close),
        "changePct": pct(price, prev.Close),
        "open": r2(last.Open), "dayHigh": r2(last.High), "dayLow": r2(last.Low),
        "volume": int(last.Volume),
        "avgVolume3m": int(daily["Volume"].tail(63).mean()),
        "high52": r2(yr["High"].max()), "high52Date": hi_i.strftime("%Y-%m-%d"),
        "low52": r2(yr["Low"].min()), "low52Date": lo_i.strftime("%Y-%m-%d"),
        "asOf": as_of,
    }

    # Performance table (total return, adjusted closes)
    perf = {}
    end = comp.index[-1]
    windows = {"1M": pd.DateOffset(months=1), "3M": pd.DateOffset(months=3), "6M": pd.DateOffset(months=6),
               "YTD": None, "1Y": pd.DateOffset(years=1), "3Y": pd.DateOffset(years=3), "5Y": pd.DateOffset(years=5)}
    for t in ["XAR", "SPY", "ITA"]:
        s = comp[t]
        row = {}
        for k, off in windows.items():
            start = pd.Timestamp(year=end.year, month=1, day=1, tz=end.tz) - pd.Timedelta(days=1) if off is None else end - off
            base = s[s.index <= start]
            row[k] = pct(s.iloc[-1], base.iloc[-1]) if len(base) else None
        perf[t] = row

    # 1-year beta of XAR vs SPY (daily returns)
    rets = comp[["XAR", "SPY"]].pct_change().dropna()
    rets = rets[rets.index >= end - pd.DateOffset(years=1)]
    beta = r2(rets["XAR"].cov(rets["SPY"]) / rets["SPY"].var())

    return {"daily": d_rows, "intraday": i_rows, "spyDaily": spy_daily, "spyIntraday": spy_intraday, "quote": quote, "performance": perf, "beta1y": beta}


# ---------------------------------------------------------------- news
def fetch_feed(label, url, limit=15):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as resp:
        root = ET.fromstring(resp.read())
    items = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        src_el = it.find("source")
        source = src_el.text.strip() if src_el is not None and src_el.text else label
        # Google News titles end with " - Source"; drop the duplicate
        if src_el is not None and title.endswith(" - " + source):
            title = title[: -len(" - " + source)]
        try:
            published = parsedate_to_datetime(it.findtext("pubDate")).astimezone(timezone.utc).isoformat()
        except Exception:
            published = None
        if title and link:
            items.append({"title": title, "link": link, "source": source, "published": published, "topic": label})
        if len(items) >= limit:
            break
    return items


def fetch_news():
    items, seen = [], set()
    for label, url in NEWS_FEEDS:
        try:
            for n in fetch_feed(label, url):
                key = re.sub(r"\W+", "", n["title"].lower())[:80]
                if key not in seen:
                    seen.add(key)
                    items.append(n)
        except Exception as e:
            print(f"  news feed failed ({label}): {e}")
    items.sort(key=lambda n: n["published"] or "", reverse=True)
    if not items:
        raise RuntimeError("no news fetched")
    return items[:40]


# ---------------------------------------------------------------- main
def main():
    data = load_previous()
    try:
        data.update(fetch_prices())
        print(f"Prices OK: {len(data['daily'])} daily bars, {len(data['intraday'])} intraday bars")
    except Exception as e:
        print(f"Price fetch failed, keeping previous: {e}")
    try:
        data["news"] = fetch_news()
        print(f"News OK: {len(data['news'])} headlines")
    except Exception as e:
        print(f"News fetch failed, keeping previous: {e}")
    data["updated"] = datetime.now(timezone.utc).isoformat(timespec="minutes")
    OUT.write_text("// Generated by scripts/fetch_market.py. Do not edit by hand.\nwindow.MARKET = "
                   + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    main()
