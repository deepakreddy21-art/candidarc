// Estimates only. Vendor list prices verified 2026-09-20; no live billing or provisioning.
const fixed = process.env.FIXED_SHARED_MONTHLY_USD ? Number(process.env.FIXED_SHARED_MONTHLY_USD) : null;
const assumptions = { successRate: 0.9, inputTokensPerAttempt: 10000, outputTokensPerAttempt: 3000,
  researchCacheHitRate: 0.25, searchesPerColdAttempt: 3, retainedMBPerCompleted: 0.5,
  retainedMBPerFailed: 0.1, databaseKBPerAttempt: 120, r2FreeStorageGB: 10, braveCreditUSD: 5 };
const round = x => Math.round(x * 100) / 100;
for (const completed of [1000, 10000]) {
  const attempts = Math.ceil(completed / assumptions.successRate), failures = attempts - completed;
  const searchRequests = Math.ceil(attempts * (1 - assumptions.researchCacheHitRate)) * 3;
  const generationUSD = attempts * (10000 * 0.15 + 3000 * 0.60) / 1e6;
  const searchGrossUSD = searchRequests * 5 / 1000;
  const objectGBGrowth = (completed * 0.5 + failures * 0.1) / 1000;
  const r2Storage = gb => Math.ceil(Math.max(0, gb - 10)) * 0.015;
  console.log(JSON.stringify({ completed, attempts, failures, assumptions, generationUSD: round(generationUSD), searchRequests,
    searchGrossUSD: round(searchGrossUSD), searchAfterUnsharedCreditUSD: round(Math.max(0, searchGrossUSD - 5)),
    objectGBGrowthPerMonth: round(objectGBGrowth), databaseGBGrowthPerMonth: round(attempts * 120 / 1e6),
    // Upper bound using month-end stored bytes, not measured daily-average GB-month.
    r2StorageMonth1UpperUSD: round(r2Storage(objectGBGrowth)), r2StorageMonth12UpperUSD: round(r2Storage(objectGBGrowth * 12)),
    r2OpsAssumption: "10 Class A and 30 Class B ops per attempt; within unshared monthly free allowance for these scenarios",
    variableMonth1USDWithUnsharedCredits: round(generationUSD + Math.max(0, searchGrossUSD - 5) + r2Storage(objectGBGrowth)),
    fixedSharedMonthlyUSD: fixed, computeMetering: "Not priced: measure CPU/memory/rendering, backups and deployment bills",
  }, null, 2));
}
