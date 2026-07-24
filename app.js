// Renders the historical BenchmarkDotNet results produced by the
// martincostello/benchmarkdotnet-results-publisher GitHub Action (./data.json)
// as a set of trend charts, one per benchmark suite/method.
//
// Expected shape of data.json:
// {
//   "lastUpdated": <epoch ms>,
//   "repoUrl": "https://github.com/<owner>/<repo>",
//   "entries": {
//     "<suite name>": [
//       {
//         "commit": { "sha": "...", "message": "...", "url": "...", "author": {...} },
//         "date": <epoch ms>,
//         "benches": [
//           { "name": "...", "value": <number>, "unit": "ns", "range": "± ...", "bytesAllocated": <number> }
//         ]
//       },
//       ...
//     ]
//   }
// }

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

  const lastUpdated = payload && payload.lastUpdated ? new Date(payload.lastUpdated) : new Date();
  statusEl.textContent = `Showing ${suites.length} benchmark suite(s). Last updated ${lastUpdated.toUTCString()}.`;

  for (const suite of suites) {
    renderSuite(chartsEl, suite);
  }
}

// The publisher writes results as an "entries" object keyed by suite (class) name,
// each value being an array of historical runs. Normalize to an array of
// { name, entries } so rendering code has a single shape to work with.
function normalizeSuites(payload) {
  if (payload && payload.entries && typeof payload.entries === "object" && !Array.isArray(payload.entries)) {
    return Object.entries(payload.entries).map(([name, entries]) => ({ name, entries }));
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    return Object.entries(payload).map(([name, entries]) => ({ name, entries }));
  }

  return [];
}

function renderSuite(container, suite) {
  const entries = suite.entries || [];
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  // Collect the set of benchmark method names present across historical entries,
  // stripping the suite prefix for a shorter legend/label.
  const methodNames = new Set();
  for (const entry of entries) {
    const benches = entry.benches || [];
    for (const b of benches) {
      methodNames.add(shortName(b.name, suite.name));
    }
  }

  const labels = entries.map((entry) => formatLabel(entry));
  const unit = firstUnit(entries) || "ns";

  const timeDatasets = Array.from(methodNames).map((methodName, index) => {
    const data = entries.map((entry) => {
      const benches = entry.benches || [];
      const match = benches.find((b) => shortName(b.name, suite.name) === methodName);
      return match && typeof match.value === "number" ? match.value : null;
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

  const memoryDatasets = Array.from(methodNames).map((methodName, index) => {
    const data = entries.map((entry) => {
      const benches = entry.benches || [];
      const match = benches.find((b) => shortName(b.name, suite.name) === methodName);
      return match && typeof match.bytesAllocated === "number" ? match.bytesAllocated : null;
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
  title.textContent = suite.name || "Benchmarks";
  card.appendChild(title);

  const timeCanvas = document.createElement("canvas");
  card.appendChild(timeCanvas);
  container.appendChild(card);

  // eslint-disable-next-line no-undef
  new Chart(timeCanvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets: timeDatasets },
    options: {
      responsive: true,
      interaction: { mode: "nearest", intersect: false },
      plugins: { title: { display: true, text: "Mean execution time" } },
      scales: {
        y: {
          title: { display: true, text: `Mean time (${unit})` },
          beginAtZero: true,
        },
      },
    },
  });

  const hasMemoryData = memoryDatasets.some((d) => d.data.some((v) => v !== null));
  if (hasMemoryData) {
    const memoryCard = document.createElement("div");
    memoryCard.className = "chart-card";

    const memoryTitle = document.createElement("h2");
    memoryTitle.textContent = `${suite.name || "Benchmarks"} — Allocated memory`;
    memoryCard.appendChild(memoryTitle);

    const memoryCanvas = document.createElement("canvas");
    memoryCard.appendChild(memoryCanvas);
    container.appendChild(memoryCard);

    // eslint-disable-next-line no-undef
    new Chart(memoryCanvas.getContext("2d"), {
      type: "line",
      data: { labels, datasets: memoryDatasets },
      options: {
        responsive: true,
        interaction: { mode: "nearest", intersect: false },
        plugins: { title: { display: true, text: "Allocated memory" } },
        scales: {
          y: {
            title: { display: true, text: "Bytes allocated" },
            beginAtZero: true,
          },
        },
      },
    });
  }
}

function shortName(fullName, suiteName) {
  if (!fullName) {
    return "unknown";
  }
  if (suiteName && fullName.startsWith(`${suiteName}.`)) {
    return fullName.substring(suiteName.length + 1);
  }
  return fullName;
}

function firstUnit(entries) {
  for (const entry of entries) {
    const benches = entry.benches || [];
    for (const b of benches) {
      if (b.unit) {
        return b.unit;
      }
    }
  }
  return null;
}

function formatLabel(entry) {
  const commit = entry.commit || {};
  const sha = commit.sha || "";
  const shortSha = sha ? sha.substring(0, 7) : "";
  const date = entry.date;
  if (date) {
    return `${new Date(date).toLocaleDateString()}${shortSha ? " (" + shortSha + ")" : ""}`;
  }
  return shortSha || "";
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
