const ENDPOINTS = ["/", "/healthz", "/version"];
const JOB_ORDER = ["Test application", "Build and push Docker image", "Deploy to production"];
const state = {
  runs: [],
  jobs: [],
  version: null,
  pipeline: null,
  endpointResults: { "/": [], "/healthz": [], "/version": [] },
  historyFilter: "all",
  selectedJobId: null,
  lastRefreshAt: null,
  refreshing: false,
  autoChecks: false,
  autoCheckTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function text(parent, tag, value, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function durationMs(start, end) {
  if (!start) return 0;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end || new Date().toISOString()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, endMs - startMs);
}

function shortSha(value) {
  return value && value !== "dev" ? value.slice(0, 7) : "—";
}

function fullTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString();
}

function relativeTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function resultKind(item) {
  if (!item) return "unknown";
  if (item.conclusion === "success") return "passed";
  if (["in_progress", "queued", "waiting"].includes(item.status)) return "running";
  if (item.conclusion) return "failed";
  return "unknown";
}

function resultLabel(item) {
  const kind = resultKind(item);
  return kind === "passed" ? "Passed" : kind === "failed" ? "Failed" : kind === "running" ? "Running" : "Unknown";
}

function statusIcon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("status-icon", kind);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.8");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (kind === "passed") {
    path.setAttribute("d", "M3 8.2 6.2 11 13 4.5");
  } else if (kind === "failed") {
    path.setAttribute("d", "m4.2 4.2 7.6 7.6m0-7.6-7.6 7.6");
  } else if (kind === "running") {
    path.setAttribute("d", "M8 3v5l3 2");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", "8");
    circle.setAttribute("cy", "8");
    circle.setAttribute("r", "5.5");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "currentColor");
    circle.setAttribute("stroke-width", "1.5");
    svg.appendChild(circle);
  } else {
    path.setAttribute("d", "M4 8h8");
  }
  svg.appendChild(path);
  return svg;
}

function setButtonLoading(button, loading) {
  if (loading) {
    button.disabled = true;
    button.classList.add("loading");
    button.dataset.label = button.textContent;
    clearNode(button);
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    button.appendChild(spinner);
    button.appendChild(document.createTextNode("Refreshing"));
  } else {
    button.disabled = false;
    button.classList.remove("loading");
    clearNode(button);
    button.textContent = button.dataset.label || "Refresh";
  }
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return body;
}

async function checkEndpoint(path) {
  const started = performance.now();
  try {
    const response = await fetch(path, { cache: "no-store" });
    return { path, status: response.status, latency: Math.round(performance.now() - started), ok: response.ok, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { path, status: null, latency: Math.round(performance.now() - started), ok: false, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Request failed" };
  }
}

async function runEndpointChecks() {
  const button = $("#runChecksButton");
  button.disabled = true;
  button.textContent = "Checking";
  try {
    const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
    results.forEach((result) => {
      state.endpointResults[result.path] = [result, ...state.endpointResults[result.path]].slice(0, 20);
    });
    renderEndpoints();
    renderService(results.find((result) => result.path === "/healthz"));
  } finally {
    button.disabled = false;
    button.textContent = "Run checks";
  }
}

function renderService(result) {
  const value = $("#serviceValue");
  clearNode(value);
  value.className = "status-value";
  if (!result) {
    value.textContent = "Unknown";
    return;
  }
  value.classList.add(result.ok ? "status-passed" : "status-failed");
  value.appendChild(statusIcon(result.ok ? "passed" : "failed"));
  value.appendChild(document.createTextNode(` ${result.ok ? "Healthy" : "Down"} · ${result.latency}ms`));
}

function setVersion(version) {
  state.version = version;
  const button = $("#versionValue");
  clearNode(button);
  const label = version?.version ? `v${version.version}` : "Unknown";
  const sha = shortSha(version?.commit);
  button.textContent = sha === "—" ? label : `${label} · ${sha}`;
  button.dataset.copy = version?.commit && version.commit !== "dev" ? `${version.version || ""} ${version.commit}`.trim() : "";
}

async function copyVersion() {
  const value = $("#versionValue").dataset.copy;
  if (!value || !navigator.clipboard) return;
  const button = $("#versionValue");
  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => { button.textContent = original; }, 900);
  } catch (_error) {
    button.title = "Copy is not available in this browser context";
  }
}

function renderSync() {
  const value = $("#syncValue");
  const runningCommit = state.version?.commit;
  const latest = state.runs[0];
  clearNode(value);
  value.className = "status-value";
  if (!runningCommit || runningCommit === "dev" || !latest?.head_sha) {
    value.textContent = "Unknown";
    return;
  }
  const comparison = state.pipeline?.comparison;
  if (runningCommit === latest.head_sha) {
    value.classList.add("status-passed");
    value.appendChild(statusIcon("passed"));
    value.appendChild(document.createTextNode(" In sync"));
  } else if (comparison?.status === "behind" && comparison.behind_by !== undefined && comparison.behind_by !== null) {
    value.classList.add("status-failed");
    value.appendChild(statusIcon("failed"));
    value.appendChild(document.createTextNode(` Behind by ${comparison.behind_by} commits`));
  } else {
    value.textContent = "Unknown";
  }
}

function renderLastRun() {
  const value = $("#lastRunValue");
  const run = state.runs[0];
  clearNode(value);
  value.className = "status-value";
  if (!run) {
    value.textContent = "Unknown";
    return;
  }
  const kind = resultKind(run);
  value.classList.add(`status-${kind}`);
  value.appendChild(statusIcon(kind));
  value.appendChild(document.createTextNode(` ${resultLabel(run)} · #${run.number} · ${formatDuration(durationMs(run.run_started_at || run.created_at, run.updated_at))}`));
}

function renderPassRate() {
  const completed = state.runs.filter((run) => run.status === "completed");
  const passed = completed.filter((run) => run.conclusion === "success").length;
  $("#passRateValue").textContent = completed.length ? `${Math.round((passed / completed.length) * 100)}%` : "Unknown";
}

function renderPipeline() {
  const graph = $("#pipelineGraph");
  clearNode(graph);
  const latest = state.runs[0];
  $("#latestRunMeta").textContent = latest ? `Run #${latest.number} · ${latest.head_branch || "Unknown branch"} · ${shortSha(latest.head_sha)} · ${relativeTime(latest.run_started_at || latest.created_at)}` : "No workflow runs available.";
  const link = $("#latestRunLink");
  if (latest?.html_url) { link.hidden = false; link.href = latest.html_url; } else link.hidden = true;
  if (!state.jobs.length) {
    text(graph, "div", "No job data is available for the latest run.", "empty-state");
    renderTimeline();
    return;
  }
  const jobs = [...state.jobs].sort((a, b) => JOB_ORDER.indexOf(a.name) - JOB_ORDER.indexOf(b.name));
  if (!state.selectedJobId || !jobs.some((job) => job.id === state.selectedJobId)) state.selectedJobId = jobs[0].id;
  jobs.forEach((job, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pipeline-node";
    button.setAttribute("aria-selected", String(job.id === state.selectedJobId));
    button.addEventListener("click", () => { state.selectedJobId = job.id; renderPipeline(); });
    button.appendChild(statusIcon(resultKind(job)));
    const name = document.createElement("span");
    name.className = "node-name";
    name.textContent = job.name || "Unknown";
    button.appendChild(name);
    const duration = document.createElement("span");
    duration.className = "node-duration";
    duration.textContent = formatDuration(durationMs(job.started_at, job.completed_at));
    button.appendChild(duration);
    graph.appendChild(button);
    if (index < jobs.length - 1) {
      const connector = document.createElement("div");
      connector.className = "pipeline-connector";
      connector.setAttribute("aria-hidden", "true");
      graph.appendChild(connector);
    }
  });
  renderTimeline();
}

function renderTimeline() {
  const container = $("#stepTimeline");
  clearNode(container);
  const job = state.jobs.find((item) => item.id === state.selectedJobId);
  if (!job) {
    text(container, "div", "No job is selected.", "empty-state");
    $("#selectedJobMeta").textContent = "Select a pipeline job.";
    return;
  }
  const jobStart = new Date(job.started_at).getTime();
  const jobEnd = new Date(job.completed_at || new Date().toISOString()).getTime();
  const jobDuration = Math.max(1, jobEnd - jobStart);
  $("#selectedJobMeta").textContent = `${job.name || "Unknown"} · ${resultLabel(job)} · ${formatDuration(jobDuration)}`;
  if (!job.steps?.length) {
    text(container, "div", "No step data is available for this job.", "empty-state");
    return;
  }
  const durations = job.steps.map((step) => durationMs(step.started_at, step.completed_at));
  const slowest = Math.max(...durations, 0);
  job.steps.forEach((step, index) => {
    const row = document.createElement("div");
    row.className = "timeline-row";
    const label = document.createElement("div");
    label.className = "step-label";
    label.appendChild(statusIcon(resultKind(step)));
    text(label, "span", step.name || "Unknown");
    row.appendChild(label);
    const track = document.createElement("div");
    track.className = "timeline-track";
    const stepStart = step.started_at ? new Date(step.started_at).getTime() : jobStart;
    const startOffset = Math.max(0, Math.min(jobDuration, stepStart - jobStart));
    const width = Math.max(2, Math.min(100, (durations[index] / jobDuration) * 100));
    const left = Math.max(0, Math.min(100 - width, (startOffset / jobDuration) * 100));
    const bar = document.createElement("div");
    const kind = resultKind(step);
    bar.className = `timeline-bar ${kind}${durations[index] === slowest && slowest > 0 ? " slowest" : ""}`;
    bar.style.left = `${left}%`;
    bar.style.width = `${width}%`;
    track.appendChild(bar);
    row.appendChild(track);
    text(row, "span", formatDuration(durations[index]), "step-duration");
    container.appendChild(row);
  });
}

function updateHistoryCounts() {
  $("#allCount").textContent = state.runs.length;
  $("#passedCount").textContent = state.runs.filter((run) => run.conclusion === "success").length;
  $("#failedCount").textContent = state.runs.filter((run) => run.status === "completed" && run.conclusion !== "success").length;
}

function renderHistory() {
  const filtered = state.runs.filter((run) => state.historyFilter === "all" || (state.historyFilter === "passed" ? run.conclusion === "success" : run.status === "completed" && run.conclusion !== "success"));
  updateHistoryCounts();
  $("#historyMeta").textContent = `${state.runs.length} runs shown from the latest 12 runs.`;
  const body = $("#historyBody");
  clearNode(body);
  $("#historyEmpty").hidden = filtered.length > 0;
  filtered.forEach((run) => {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    const runCell = document.createElement("td");
    const runLink = document.createElement("a");
    runLink.href = run.html_url || "#";
    runLink.target = "_blank";
    runLink.rel = "noreferrer";
    runLink.textContent = `#${run.number}`;
    runCell.appendChild(runLink);
    row.appendChild(runCell);
    const commitCell = document.createElement("td");
    commitCell.className = "commit-column";
    const commitLink = document.createElement("a");
    commitLink.className = "mono";
    commitLink.href = run.commit_url || `https://github.com/abhinavs1703/ci-cd-testing-deployment-pipeline/commit/${run.head_sha}`;
    commitLink.target = "_blank";
    commitLink.rel = "noreferrer";
    commitLink.textContent = shortSha(run.head_sha);
    commitCell.appendChild(commitLink);
    row.appendChild(commitCell);
    text(row, "td", run.head_branch || "Unknown");
    text(row, "td", run.actor || "Unknown", "actor-column");
    const resultCell = document.createElement("td");
    resultCell.className = `result status-${resultKind(run)}`;
    resultCell.appendChild(statusIcon(resultKind(run)));
    resultCell.appendChild(document.createTextNode(` ${resultLabel(run)}`));
    row.appendChild(resultCell);
    text(row, "td", formatDuration(durationMs(run.run_started_at || run.created_at, run.updated_at)), "mono");
    const started = document.createElement("td");
    started.className = "mono";
    started.textContent = relativeTime(run.run_started_at || run.created_at);
    started.title = fullTimestamp(run.run_started_at || run.created_at);
    row.appendChild(started);
    body.appendChild(row);
  });
  renderChart(filtered);
}

function svgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function renderChart(runs) {
  const svg = $("#durationChart");
  Array.from(svg.children).filter((child) => !["title", "desc"].includes(child.tagName)).forEach((child) => child.remove());
  if (!runs.length) return;
  const width = 900;
  const height = 220;
  const pad = { top: 18, right: 18, bottom: 38, left: 42 };
  const chartHeight = height - pad.top - pad.bottom;
  const chartWidth = width - pad.left - pad.right;
  const max = Math.max(...runs.map((run) => durationMs(run.run_started_at || run.created_at, run.updated_at)), 1000);
  const gap = 8;
  const barWidth = Math.max(12, (chartWidth - gap * (runs.length - 1)) / runs.length);
  [0, 0.5, 1].forEach((fraction) => {
    const y = pad.top + chartHeight * (1 - fraction);
    svg.appendChild(svgElement("line", { x1: pad.left, x2: width - pad.right, y1: y, y2: y, class: "chart-grid" }));
  });
  runs.forEach((run, index) => {
    const value = durationMs(run.run_started_at || run.created_at, run.updated_at);
    const barHeight = Math.max(2, (value / max) * chartHeight);
    const x = pad.left + index * (barWidth + gap);
    const y = pad.top + chartHeight - barHeight;
    const rect = svgElement("rect", { x, y, width: barWidth, height: barHeight, class: `chart-bar ${resultKind(run)}` });
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `Run #${run.number}: ${formatDuration(value)} · ${resultLabel(run)}`;
    rect.appendChild(title);
    svg.appendChild(rect);
    const label = svgElement("text", { x: x + barWidth / 2, y: height - 18, "text-anchor": "middle", class: "chart-label" });
    label.textContent = `#${run.number}`;
    svg.appendChild(label);
  });
}

function renderEndpoints() {
  const body = $("#endpointBody");
  clearNode(body);
  let latestChecked = null;
  ENDPOINTS.forEach((path) => {
    const history = state.endpointResults[path];
    const latest = history[0];
    if (latest && (!latestChecked || latest.checkedAt > latestChecked)) latestChecked = latest.checkedAt;
    const row = document.createElement("tr");
    text(row, "td", path, "mono");
    text(row, "td", "GET", "mono");
    const status = document.createElement("td");
    if (latest) {
      status.className = `status-${latest.ok ? "passed" : "failed"}`;
      status.appendChild(statusIcon(latest.ok ? "passed" : "failed"));
      status.appendChild(document.createTextNode(` ${latest.status ? `HTTP ${latest.status}` : "Request failed"}`));
    } else status.textContent = "—";
    row.appendChild(status);
    text(row, "td", latest ? `${latest.latency}ms` : "—", "mono");
    const sparkCell = document.createElement("td");
    sparkCell.appendChild(renderSparkline(history));
    row.appendChild(sparkCell);
    const summary = history.map((item) => item.latency);
    if (summary.length) {
      const min = Math.min(...summary);
      const avg = Math.round(summary.reduce((total, value) => total + value, 0) / summary.length);
      const max = Math.max(...summary);
      text(row, "td", `${min}ms / ${avg}ms / ${max}ms`, "latency-summary");
    } else text(row, "td", "—", "latency-summary");
    body.appendChild(row);
  });
  $("#endpointMeta").textContent = latestChecked ? `Last checked ${relativeTime(latestChecked)}.` : "No checks run yet.";
}

function renderSparkline(history) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("sparkline");
  svg.setAttribute("viewBox", "0 0 140 28");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${history.length} response-time measurements`);
  if (!history.length) return svg;
  const values = history.map((item) => item.latency).reverse();
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 70 : (index / (values.length - 1)) * 136 + 2;
    const y = 24 - ((value - min) / range) * 20;
    return `${x},${y}`;
  }).join(" ");
  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  svg.appendChild(polyline);
  return svg;
}

function showPipelineError(error) {
  const banner = $("#dataBanner");
  if (!error) {
    banner.hidden = true;
    banner.textContent = "";
    return;
  }
  banner.hidden = false;
  banner.textContent = `GitHub data is stale or unavailable: ${error}`;
}

async function refreshDashboard() {
  if (state.refreshing) return;
  state.refreshing = true;
  const button = $("#refreshButton");
  setButtonLoading(button, true);
  try {
    const [versionResult, pipelineResult] = await Promise.allSettled([fetchJson("/version"), fetchJson("/api/pipeline")]);
    if (versionResult.status === "fulfilled") setVersion(versionResult.value);
    if (pipelineResult.status === "fulfilled") {
      state.pipeline = pipelineResult.value;
      state.runs = Array.isArray(pipelineResult.value.runs) ? pipelineResult.value.runs : [];
      state.jobs = Array.isArray(pipelineResult.value.jobs) ? pipelineResult.value.jobs : [];
      renderSync();
      renderLastRun();
      renderPassRate();
      renderPipeline();
      renderHistory();
      showPipelineError(pipelineResult.value.error);
    } else {
      showPipelineError(pipelineResult.reason?.message || "Unable to load GitHub data.");
    }
    await runEndpointChecks();
    state.lastRefreshAt = Date.now();
    updateUpdatedText();
  } catch (error) {
    showPipelineError(error instanceof Error ? error.message : "Unable to refresh dashboard.");
  } finally {
    setButtonLoading(button, false);
    state.refreshing = false;
  }
}

function updateUpdatedText() {
  $("#updated").textContent = state.lastRefreshAt ? `Updated ${relativeTime(state.lastRefreshAt)}` : "Updated —";
}

function setEnvironment() {
  const isProduction = window.location.hostname.endsWith(".onrender.com");
  $("#environment").textContent = isProduction ? "Production" : "Local";
}

function setAutoChecks(enabled) {
  state.autoChecks = enabled;
  const button = $("#autoCheckButton");
  button.setAttribute("aria-pressed", String(enabled));
  button.textContent = enabled ? "Auto-check every 10s: on" : "Auto-check every 10s";
  if (state.autoCheckTimer) window.clearInterval(state.autoCheckTimer);
  state.autoCheckTimer = enabled ? window.setInterval(runEndpointChecks, 10000) : null;
}

$$(".filter-button").forEach((button) => button.addEventListener("click", () => {
  state.historyFilter = button.dataset.filter;
  $$(".filter-button").forEach((item) => {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
  renderHistory();
}));

$("#refreshButton").addEventListener("click", refreshDashboard);
$("#versionValue").addEventListener("click", copyVersion);
$("#runChecksButton").addEventListener("click", runEndpointChecks);
$("#autoCheckButton").addEventListener("click", () => setAutoChecks(!state.autoChecks));

setEnvironment();
renderEndpoints();
refreshDashboard();
window.setInterval(updateUpdatedText, 1000);
window.setInterval(refreshDashboard, 60000);
