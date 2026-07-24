// Renders the historical BenchmarkDotNet results produced by the
// martincostello/benchmarkdotnet-results-publisher GitHub Action (./data.json)
// as a set of trend charts, one per benchmark suite/method.

const DATA_URL = "./data.json";

async function main() {
  const statusEl = document.getElementById("status");
  const chartsEl = document.getElementById("charts");

  let payload;
  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    payload = await response.json();
  } catch (err) {
    statusEl.textContent =
      "No benchmark results found yet. Results will appear here after the first benchmark workflow run completes.";
    console.error("Failed to load benchmark data", err);
    return;
  }

  const suites = normalizeSuites(payload);

  if (suites.length === 0) {
    statusEl.textContent = "Benchmark data was loaded, but no results were found.";
    return;
  }

  statusEl.textContent = `Showing ${suites.length} benchmark suite(s). Last updated ${new Date().toUTCString()}.`;

  for (const suite of suites) {
    renderSuite(chartsEl, suite);
  }
}

// The results publisher groups entries by "suite" (name) with an array of
// historical entries, each entry containing a commit/date and a list of
// benchmark results. This function normalizes a few possible shapes so the
// dashboard keeps working across publisher versions.
function normalizeSuites(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.suites)) {
    return payload.suites;
  }

  if (payload && typeof payload === "object") {
    return Object.entries(payload).map(([name, entries]) => ({ name, entries }));
  }

  return [];
}

function renderSuite(container, suite) {
  const entries = suite.entries || suite.results || [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  // Collect the set of benchmark method names present across historical entries.
  const methodNames = new Set();
  for (const entry of entries) {
    const benchmarks = entry.benchmarks || entry.results || [];
    for (const b of benchmarks) {
      methodNames.add(b.name || b.method || "unknown");
    }
  }

  const labels = entries.map((entry) => formatLabel(entry));

  const datasets = Array.from(methodNames).map((methodName, index) => {
    const data = entries.map((entry) => {
      const benchmarks = entry.benchmarks || entry.results || [];
      const match = benchmarks.find((b) => (b.name || b.method) === methodName);
      return match ? toNanoseconds(match) : null;
    });

    return {
      label: methodName,
      data,
      borderWidth: 2,
      tension: 0.2,
      spanGaps: true,
      borderColor: colorForIndex(index),
      backgroundColor: colorForIndex(index),
    };
  });

  const card = document.createElement("div");
  card.className = "chart-card";

  const title = document.createElement("h2");
  title.textContent = suite.name || suite.suite || "Benchmarks";
  card.appendChild(title);

  const canvas = document.createElement("canvas");
  card.appendChild(canvas);
  container.appendChild(card);

  // eslint-disable-next-line no-undef
  new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        y: {
          title: { display: true, text: "Mean time (ns)" },
          beginAtZero: true,
        },
      },
    },
  });
}

function formatLabel(entry) {
  const commit = entry.commit || entry.sha || "";
  const shortSha = commit ? commit.substring(0, 7) : "";
  const date = entry.date || entry.timestamp;
  if (date) {
    return `${new Date(date).toLocaleDateString()}${shortSha ? " (" + shortSha + ")" : ""}`;
  }
  return shortSha || String(entry.id || "");
}

function toNanoseconds(benchmark) {
  const value = benchmark.mean ?? benchmark.value ?? benchmark.median;
  return typeof value === "number" ? value : null;
}

const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
];

function colorForIndex(index) {
  return PALETTE[index % PALETTE.length];
}

main();
