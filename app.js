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
  const suiteWord = suites.length === 1 ? "suite" : "suites";
  statusEl.textContent = `Showing ${suites.length} benchmark ${suiteWord}. Last updated ${lastUpdated.toUTCString()}.`;

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

  const latestEntry = entries[entries.length - 1];
  const latestBenches = latestEntry.benches || [];

  // Collect the set of benchmark method names present across historical entries,
  // stripping shared prefixes for shorter, less repetitive legend/labels.
  const rawNames = new Set();
  for (const entry of entries) {
    const benches = entry.benches || [];
    for (const b of benches) {
      rawNames.add(b.name || "unknown");
    }
  }
  const commonPrefix = findCommonPrefix(Array.from(rawNames), suite.name);
  const methodNameOf = (fullName) => shortName(fullName, suite.name, commonPrefix);

  const methodNames = Array.from(rawNames).map(methodNameOf);
  const unit = firstUnit(entries) || "ns";
  const isSingleRun = entries.length === 1;

  const card = document.createElement("div");
  card.className = "chart-card";

  const title = document.createElement("h2");
  title.textContent = suite.name || "Benchmarks";
  card.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "chart-grid";
  card.appendChild(grid);

  const timeWrap = document.createElement("div");
  timeWrap.className = "chart-canvas-wrap";
  const timeCanvas = document.createElement("canvas");
  timeWrap.appendChild(timeCanvas);
  grid.appendChild(timeWrap);

  const memoryWrap = document.createElement("div");
  memoryWrap.className = "chart-canvas-wrap";
  const memoryCanvas = document.createElement("canvas");
  memoryWrap.appendChild(memoryCanvas);
  grid.appendChild(memoryWrap);

  card.appendChild(buildSummaryTable(latestBenches, methodNameOf, unit));
  container.appendChild(card);

  if (isSingleRun) {
    renderBarChart(timeCanvas, {
      title: "Mean execution time",
      yLabel: `Mean time (${unit})`,
      labels: methodNames,
      values: rawNamesToValues(rawNames, latestBenches, methodNameOf, "value"),
    });
    renderBarChart(memoryCanvas, {
      title: "Allocated memory",
      yLabel: "Bytes allocated",
      labels: methodNames,
      values: rawNamesToValues(rawNames, latestBenches, methodNameOf, "bytesAllocated"),
    });
  } else {
    const labels = entries.map((entry) => formatLabel(entry));

    const timeDatasets = methodNames.map((methodName, index) => {
      const data = entries.map((entry) => {
        const benches = entry.benches || [];
        const match = benches.find((b) => methodNameOf(b.name) === methodName);
        return match && typeof match.value === "number" ? match.value : null;
      });
      return lineDataset(methodName, data, index);
    });

    const memoryDatasets = methodNames.map((methodName, index) => {
      const data = entries.map((entry) => {
        const benches = entry.benches || [];
        const match = benches.find((b) => methodNameOf(b.name) === methodName);
        return match && typeof match.bytesAllocated === "number" ? match.bytesAllocated : null;
      });
      return lineDataset(methodName, data, index);
    });

    renderLineChart(timeCanvas, {
      title: "Mean execution time",
      yLabel: `Mean time (${unit})`,
      labels,
      datasets: timeDatasets,
    });
    renderLineChart(memoryCanvas, {
      title: "Allocated memory",
      yLabel: "Bytes allocated",
      labels,
      datasets: memoryDatasets,
    });
  }
}

function rawNamesToValues(rawNames, latestBenches, methodNameOf, field) {
  return Array.from(rawNames).map((fullName) => {
    const match = latestBenches.find((b) => b.name === fullName);
    return match && typeof match[field] === "number" ? match[field] : 0;
  });
}

function buildSummaryTable(latestBenches, methodNameOf, unit) {
  const wrap = document.createElement("div");
  wrap.className = "summary-table-wrap";

  const table = document.createElement("table");
  table.className = "summary-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Method</th><th>Mean (${unit})</th><th>Allocated (bytes)</th></tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const bench of latestBenches) {
    const tr = document.createElement("tr");
    const name = methodNameOf(bench.name);
    const mean = typeof bench.value === "number" ? formatNumber(bench.value) : "—";
    const allocated = typeof bench.bytesAllocated === "number" ? formatNumber(bench.bytesAllocated) : "—";
    tr.innerHTML = `<td>${escapeHtml(name)}</td><td>${mean}</td><td>${allocated}</td>`;
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function lineDataset(label, data, index) {
  return {
    label,
    data,
    borderWidth: 2,
    tension: 0.25,
    spanGaps: true,
    pointRadius: 3,
    pointHoverRadius: 5,
    borderColor: colorForIndex(index),
    backgroundColor: colorForIndex(index),
  };
}

function renderLineChart(canvas, { title, yLabel, labels, datasets }) {
  // eslint-disable-next-line no-undef
  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        title: { display: true, text: title, font: { size: 13 } },
        legend: {
          position: "bottom",
          labels: { boxWidth: 12, boxHeight: 12, font: { size: 10.5 }, padding: 8 },
        },
      },
      scales: {
        y: {
          title: { display: true, text: yLabel },
          beginAtZero: true,
        },
      },
    },
  });
}

function renderBarChart(canvas, { title, yLabel, labels, values }) {
  const colors = labels.map((_, index) => colorForIndex(index));
  // eslint-disable-next-line no-undef
  return new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: title, font: { size: 13 } },
        legend: { display: false },
      },
      scales: {
        x: {
          title: { display: true, text: yLabel },
          beginAtZero: true,
        },
        y: {
          ticks: { font: { size: 10.5 } },
        },
      },
    },
  });
}

// Finds a shared textual prefix (up to the last "_") across benchmark method
// names within a suite, e.g. "OpenFeatureClient_Get", so it can be stripped
// from labels to reduce repetition.
function findCommonPrefix(fullNames, suiteName) {
  const stripped = fullNames.map((n) => stripSuitePrefix(n, suiteName));
  if (stripped.length < 2) {
    return "";
  }

  let prefix = stripped[0];
  for (const name of stripped.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) {
      i++;
    }
    prefix = prefix.substring(0, i);
    if (prefix.length === 0) {
      break;
    }
  }

  // Only trim back to the last underscore so we don't cut a word in half.
  const lastUnderscore = prefix.lastIndexOf("_");
  return lastUnderscore > 0 ? prefix.substring(0, lastUnderscore + 1) : "";
}

function stripSuitePrefix(fullName, suiteName) {
  if (!fullName) {
    return "unknown";
  }
  if (suiteName && fullName.startsWith(`${suiteName}.`)) {
    return fullName.substring(suiteName.length + 1);
  }
  return fullName;
}

function shortName(fullName, suiteName, commonPrefix) {
  const stripped = stripSuitePrefix(fullName, suiteName);
  if (commonPrefix && stripped.startsWith(commonPrefix)) {
    return stripped.substring(commonPrefix.length);
  }
  return stripped;
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

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
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
  "#e11d48",
  "#0284c7",
  "#ca8a04",
  "#4f46e5",
];

function colorForIndex(index) {
  return PALETTE[index % PALETTE.length];
}

main();
