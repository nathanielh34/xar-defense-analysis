// Projection log. Add one entry each time you make a projection.
// Leave actual as null until the target date passes, then fill it in.
// The site computes the error and the hit rate automatically.
window.PROJECTIONS = [
  // Example entry (delete or replace):
  {
    made: "2026-11-11",
    target: "2026-12-11",
    method: "Monte Carlo (baseline)",
    priceAtMade: null,
    projected: null,
    low: null,      // e.g. 5th percentile
    high: null,     // e.g. 95th percentile
    indexValue: 0,  // strength index on the day made
    actual: null,
    note: "Template row"
  }
];
