"""
Driver analyses for the Drivers tab (runs on GitHub with the market-data job).

Driver 1: S&P 500 returns
  - 5-year monthly beta of XAR vs the S&P 500 (SPY), 60 completed months
  - Linear regression  XAR_return = alpha + beta * SPY_return + error
  - Diagnostics, residuals, and correlations at a few horizons

Uses dividend-adjusted (total return) prices. Writes data/drivers_results.js.
Run locally with:  pip install yfinance pandas statsmodels && python scripts/drivers_analysis.py
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.stats.diagnostic import het_breuschpagan
from statsmodels.stats.stattools import durbin_watson, jarque_bera

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "drivers_results.js"


def r(x, d=4):
    return None if x is None or not np.isfinite(x) else round(float(x), d)


def monthly_returns(prices):
    """Prices -> % monthly returns from month-end closes, completed months only."""
    m = prices.resample("ME").last()
    today = pd.Timestamp.now(tz=m.index.tz) if m.index.tz is not None else pd.Timestamp.now()
    if m.index[-1].year == today.year and m.index[-1].month == today.month:
        m = m.iloc[:-1]  # drop the month still in progress
    return m.pct_change().dropna() * 100


def regress(y, x):
    X = sm.add_constant(x.rename("market"))
    res = sm.OLS(y, X).fit()
    ci = res.conf_int(0.05)
    bp = het_breuschpagan(res.resid, X)
    jb = jarque_bera(res.resid)
    coef = {}
    for name, label in [("const", "alpha"), ("market", "beta")]:
        coef[label] = {"est": r(res.params[name]), "se": r(res.bse[name]), "t": r(res.tvalues[name], 3),
                       "p": r(res.pvalues[name], 5), "ciLow": r(ci.loc[name, 0]), "ciHigh": r(ci.loc[name, 1])}
    # Is beta different from 1 (i.e., more/less volatile than the market)?
    t1 = (res.params["market"] - 1) / res.bse["market"]
    from scipy import stats
    p1 = 2 * stats.t.sf(abs(t1), res.df_resid)
    return res, {
        "coef": coef,
        "betaVsOne": {"t": r(t1, 3), "p": r(p1, 5)},
        "n": int(res.nobs), "r2": r(res.rsquared), "adjR2": r(res.rsquared_adj),
        "corr": r(np.corrcoef(x, y)[0, 1]),
        "fStat": r(res.fvalue, 3), "fP": r(res.f_pvalue, 6),
        "residStd": r(np.sqrt(res.mse_resid)),
        "durbinWatson": r(durbin_watson(res.resid), 3),
        "jarqueBeraP": r(jb[1], 5), "skew": r(jb[2], 3), "kurtosis": r(jb[3], 3),
        "breuschPaganP": r(bp[1], 5),
        "xMean": r(x.mean()), "yMean": r(y.mean()), "xStd": r(x.std()), "yStd": r(y.std()),
    }


def sp500_driver():
    import yfinance as yf
    px = yf.download(["XAR", "SPY"], start="2011-09-01", interval="1d", auto_adjust=True, progress=False)["Close"].dropna()

    # --- Main model: 5-year monthly (60 completed months)
    mret = monthly_returns(px).tail(60)
    res, stats_ = regress(mret["XAR"], mret["SPY"])
    points = [[d.strftime("%Y-%m"), r(x, 3), r(y, 3), r(f, 3), r(e, 3)]
              for d, x, y, f, e in zip(mret.index, mret["SPY"], mret["XAR"], res.fittedvalues, res.resid)]

    # --- Rolling 36-month beta (full history) to show how beta changes over time
    all_m = monthly_returns(px)
    cov = all_m["XAR"].rolling(36).cov(all_m["SPY"])
    var = all_m["SPY"].rolling(36).var()
    rolling = [[d.strftime("%Y-%m"), r(b, 3)] for d, b in (cov / var).dropna().items()]

    # --- Correlation / beta at other horizons for comparison
    d = px.pct_change().dropna()
    w = px.resample("W-FRI").last().pct_change().dropna()
    def cb(df, n):
        df = df.tail(n)
        return {"corr": r(df["XAR"].corr(df["SPY"]), 3), "beta": r(df["XAR"].cov(df["SPY"]) / df["SPY"].var(), 3), "n": len(df)}
    horizons = {"1Y daily": cb(d, 252), "3Y weekly": cb(w, 156), "5Y monthly": cb(all_m, 60), "Since 2011 monthly": cb(all_m, len(all_m))}

    return {
        "title": "S&P 500 returns",
        "question": "How much does XAR move with the overall stock market?",
        "method": "OLS regression of XAR monthly total return on SPY (S&P 500 ETF) monthly total return, last 60 completed months.",
        "period": f"{mret.index[0].strftime('%b %Y')} to {mret.index[-1].strftime('%b %Y')}",
        "xLabel": "S&P 500 (SPY) monthly return, %",
        "yLabel": "XAR monthly return, %",
        **stats_,
        "points": points,          # [month, x, y, fitted, residual]
        "rollingBeta": rolling,    # [month, beta]
        "horizons": horizons,
        "status": "Significant" if stats_["coef"]["beta"]["p"] < 0.05 else "Not significant",
        "result": f"5Y monthly beta {stats_['coef']['beta']['est']:.2f}, R² {stats_['r2']:.2f}, "
                  + ("p<0.001" if stats_['coef']['beta']['p'] < 0.001 else f"p={stats_['coef']['beta']['p']:.3f}"),
    }


def main():
    out = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "drivers": {}}
    try:
        out["drivers"]["S&P 500 returns"] = sp500_driver()
        print("S&P 500 driver OK:", out["drivers"]["S&P 500 returns"]["result"])
    except Exception as e:
        print("S&P 500 driver failed:", e)
        if OUT.exists():
            return  # keep the previous results
    OUT.write_text("// Generated by scripts/drivers_analysis.py. Do not edit by hand.\nwindow.DRIVER_ANALYSIS = "
                   + json.dumps(out, separators=(",", ":")) + ";\n", encoding="utf-8")


if __name__ == "__main__":
    main()
