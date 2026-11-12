# XAR Defense Stock Analysis

A small website for organizing the XAR (SPDR S&P Aerospace & Defense ETF) price-driver project: the plan, candidate drivers, the news strength index, the projection log and findings.

## Viewing it

- **Locally:** double-click `index.html`. It works without a server.
- **Online:** turn on GitHub Pages (Settings → Pages → Deploy from branch → `main` / root). The site will be at `https://<your-username>.github.io/<repo-name>/`.

## Updating it

All content lives in `data/`. Edit a file, save, refresh.

| File | What it holds |
|---|---|
| `data/articles.js` | One entry per scored article (`score`: +1 / 0 / −1). The running index and chart are calculated for you. |
| `data/projections.js` | One entry per projection. Fill in `actual` after the target date; error, direction hit-rate and range hit-rate are calculated for you. |
| `data/drivers.js` | Candidate drivers and their test status (`Not tested`, `Testing`, `Significant`, `Not significant`). |
| `data/findings.js` | Findings journal (`Confirmed`, `Testing`, `Rejected`, `Idea`). |

Each file is a JavaScript list. Copy an existing entry, paste it below, and change the values. Keep the commas between entries.

## Structure

```
index.html        page layout and plan text
assets/style.css  styling
assets/app.js     tables, sorting, filters, index chart, projection stats
data/*.js         your data
```

## Running the analysis

```
pip install -r requirements.txt
python analysis/01_market_factor.py
```

This downloads weekly XAR, S&P 500, VIX and 10-year yield data, runs the market-factor regression, saves `analysis/output/market_factor.md`, and updates `data/results.js` so the site shows the results. Commit and push afterward to publish.

## XAR Watch tab (automatic market data)

`.github/workflows/update-market.yml` runs `scripts/fetch_market.py` on GitHub about every 2 hours on weekdays (and whenever that script changes). It saves XAR prices, benchmark returns and defense headlines to `data/market.js` and commits it, so the site updates on its own.

- To refresh right away: repo **Actions** tab → **Update XAR market data** → **Run workflow**.
- Because this job commits to the repo, run `git pull` before you start editing.
- Charts use TradingView Lightweight Charts (Apache 2.0, see `assets/vendor/`).
