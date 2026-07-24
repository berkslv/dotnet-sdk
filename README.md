# Benchmarks

This branch hosts the GitHub Pages dashboard for the continuous BenchmarkDotNet
results of the [open-feature/dotnet-sdk](https://github.com/open-feature/dotnet-sdk)
repository.

- `data.json` is written/updated automatically by the
  [`benchmark` workflow](../../actions/workflows/benchmark.yml) via the
  [`martincostello/benchmarkdotnet-results-publisher`](https://github.com/martincostello/benchmarkdotnet-results-publisher)
  action. Do not edit it manually.
- `index.html`, `app.js`, and `styles.css` implement a small static dashboard
  that renders historical trends from `data.json`.

Do not push arbitrary changes to this branch outside of the dashboard assets;
it is managed by CI.
