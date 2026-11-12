// Candidate drivers. Update status and result as you test each one.
// status: "Not tested", "Testing", "Significant", "Not significant"
window.DRIVERS = [
  { category: "Market", driver: "S&P 500 returns", measure: "Monthly total return (5Y)", source: "yfinance (SPY)", status: "Not tested", result: "" },
  { category: "Market", driver: "10-year Treasury yield", measure: "Change in yield", source: "FRED (DGS10)", status: "Not tested", result: "" },
  { category: "Market", driver: "Volatility", measure: "VIX level/change", source: "yfinance (^VIX)", status: "Not tested", result: "" },
  { category: "Budget & policy", driver: "Defense budget / NDAA", measure: "Event dates (request, passage, CRs)", source: "Congress.gov, news", status: "Not tested", result: "" },
  { category: "Geopolitics", driver: "Geopolitical Risk Index", measure: "Monthly/daily GPR", source: "Caldara–Iacoviello GPR", status: "Not tested", result: "" },
  { category: "Contracts", driver: "DoD contract awards", measure: "Award $ per week to XAR holdings", source: "defense.gov contracts", status: "Not tested", result: "" },
  { category: "Commercial aerospace", driver: "Air travel & aircraft production", measure: "TSA throughput, delivery numbers", source: "TSA, Boeing/Airbus", status: "Not tested", result: "" },
  { category: "Fundamentals", driver: "Earnings surprises & backlog", measure: "Surprise % for top holdings", source: "Company reports", status: "Not tested", result: "" },
  { category: "News", driver: "Strength Index", measure: "Running article score", source: "This site's article log", status: "Not tested", result: "" }
];
