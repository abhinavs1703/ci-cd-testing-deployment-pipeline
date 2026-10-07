const ENDPOINTS = [
  { path: "/", label: "GET /" },
  { path: "/healthz", label: "GET /healthz" },
  { path: "/version", label: "GET /version" },
];

const state = { runs: [], jobs: [], endpointResults: {}, historyFilter: "all", selectedJobId: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function setButtonLoading(button, loadingText, loading) {
  if (loading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || button.textContent;
  }
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function durationMs(start, end) {
  if (!start) return 0;
  return Math.max(0, new Date(end || new Date().toISOString()).getTime() - new Date(start).getTime());
}

function formatDuration(milliseconds) {
  if (!milliseconds) return "—";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function shortSha(value) {
  return value ? value.slice(0, 7) : "—";
}

function resultKind(item) {
  if (item && item.conclusion === "success") return "passed";
  if (item && (item.status === "in_progress" || item.status === "queued" || item.status === "waiting")) return "running";
  if (item && item.conclusion) return "failed";
  return "running";
}

function resultLabel(item) {
  const kind = resultKind(item);
  return kind === "passed" ? "Passed" : kind === "failed" ? "Failed" : "Running";
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function appendText(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return body;
}

async function checkEndpoint(endpoint) {
  const started = performance.now();
  try {
    const response = await fetch(endpoint.path, { cache: "no-store" });
    return { path: endpoint.path, status: response.status, latency: Math.round(performance.now() - started), ok: response.ok, checkedAt: new Date().toISOString() };
  } catch (_error) {
    return { path: endpoint.path, status: null, latency: Math.round(performance.now() - started), ok: false, checkedAt: new Date().toISOString() };
  }
}

function saveEndpointResult(result) {
  const history = [result, ...(state.endpointResults[result.path] || [])].slice(0, 10);
  state.endpointResults[result.path] = history;
}

async function runEndpointChecks() {
  const button = $("#runChecksButton");
  setButtonLoading(button, "Checking…", true);
  try {
    const results = await Promise.all(ENDPOINTS.map(checkEndpoint));
    results.forEach(saveEndpointResult);
    renderEndpointChecks();
    updateHealthSummary(results.find((result) => result.path === "/healthz"));
  } finally {
    setButtonLoading(button, "Checking…", false);
  }
}

function updateHealthSummary(result) {
  const summary = $("#healthSummary");
  const detail = $("#healthSummaryDetail");
  summary.className = "";
  if (!result) { summary.textContent = "Unknown"; detail.textContent = "No health result"; return; }
  if (result.ok) {
    summary.textContent = "Passed";
    summary.classList.add("status-passed");
    detail.textContent = `HTTP ${result.status} in ${result.latency}ms`;
  } else {
    summary.textContent = "Failed";
    summary.classList.add("status-failed");
    detail.textContent = result.status ? `HTTP ${result.status} in ${result.latency}ms` : "Request failed";
  }
}

function renderEndpointChecks() {
  const body = $("#endpointBody");
  clearNode(body);
  ENDPOINTS.forEach((endpoint) => {
    const latest = state.endpointResults[endpoint.path]?.[0];
    const row = document.createElement("tr");
    const endpointCell = document.createElement("td");
    const link = document.createElement("a");
    link.href = endpoint.path; link.target = "_blank"; link.rel = "noreferrer"; link.textContent = endpoint.label;
    endpointCell.appendChild(link); row.appendChild(endpointCell);
    const statusCell = document.createElement("td");
    const status = document.createElement("span"); status.className = "endpoint-status";
    if (latest) { status.textContent = latest.status ? `HTTP ${latest.status}` : "Request failed"; status.classList.add(latest.ok ? "status-passed" : "status-failed"); }
    else status.textContent = "Not checked";
    statusCell.appendChild(status); row.appendChild(statusCell);
    appendText(row, "td", latest ? `${latest.latency}ms` : "—");
    const historyCell = document.createElement("td");
    const history = document.createElement("span"); history.className = "history-dots";
    (state.endpointResults[endpoint.path] || []).slice(0, 10).reverse().forEach((item) => {
      const dot = document.createElement("span");
      dot.className = `history-dot ${item.ok ? "passed" : "failed"}`;
      dot.title = `${item.status ? `HTTP ${item.status}` : "Request failed"} · ${formatDate(item.checkedAt)}`;
      dot.setAttribute("aria-label", dot.title); history.appendChild(dot);
    });
    if (!history.childElementCount) history.textContent = "—";
    historyCell.appendChild(history); row.appendChild(historyCell); body.appendChild(row);
  });
}

function renderSummary(versionData) {
  $("#commitSummary").textContent = shortSha(versionData.commit);
  $("#versionSummary").textContent = `v${versionData.version}`;
  const latest = state.runs[0];
  const detail = $("#commitSummaryDetail");
  detail.className = "";
  if (!latest || !versionData.commit || versionData.commit === "dev") {
    detail.textContent = "No main-branch comparison available"; return;
  }
  if (versionData.commit === latest.head_sha) {
    detail.textContent = "Matches latest push to main"; detail.classList.add("status-passed");
  } else {
    detail.textContent = `Latest main is ${shortSha(latest.head_sha)}`; detail.classList.add("status-failed");
  }
}

function renderRunSummary() {
  const latest = state.runs[0];
  if (!latest) {
    $("#lastRunSummary").textContent = "No runs";
    $("#lastRunSummaryDetail").textContent = "GitHub returned no workflow runs";
    $("#successRateSummary").textContent = "—";
    $("#successRateDetail").textContent = "No run data";
    return;
  }
  const kind = resultKind(latest);
  const lastRun = $("#lastRunSummary");
  lastRun.textContent = `#${latest.number} ${resultLabel(latest)}`;
  lastRun.className = `status-${kind}`;
  $("#lastRunSummaryDetail").textContent = `${formatDuration(durationMs(latest.run_started_at || latest.created_at, latest.updated_at))} · ${formatDate(latest.run_started_at || latest.created_at)}`;
  const completedRuns = state.runs.filter((run) => run.conclusion);
  const passed = completedRuns.filter((run) => run.conclusion === "success").length;
  const rate = completedRuns.length ? Math.round((passed / completedRuns.length) * 100) : 0;
  const success = $("#successRateSummary");
  success.textContent = `${rate}%`;
  success.className = rate === 100 ? "status-passed" : rate < 80 ? "status-failed" : "status-running";
  $("#successRateDetail").textContent = `${passed} passed of ${completedRuns.length} completed`;
}

function findJobForStage(index) {
  const names = ["test application", "build and push docker image", "deploy to production"];
  return state.jobs.find((job) => job.name.toLowerCase().includes(names[index])) || state.jobs[index] || null;
}

function renderStages() {
  const container = $("#stageList"); clearNode(container);
  const names = ["Test application", "Build and push Docker image", "Deploy to production"];
  if (!state.runs.length) { appendText(container, "p", "No workflow runs are available.", "empty-state"); return; }
  names.forEach((name, index) => {
    const job = findJobForStage(index);
    const button = document.createElement("button");
    button.type = "button"; button.className = "stage-button"; button.setAttribute("aria-selected", String(job && job.id === state.selectedJobId));
    const dot = document.createElement("span"); dot.className = `status-dot ${resultKind(job)}`; dot.setAttribute("aria-hidden", "true"); button.appendChild(dot);
    const content = document.createElement("span"); content.className = "stage-content";
    appendText(content, "span", job?.name || name, "stage-name");
    appendText(content, "span", job ? formatDuration(durationMs(job.started_at, job.completed_at)) : "No job data", "stage-meta");
    button.appendChild(content);
    appendText(button, "span", resultLabel(job), `stage-result status-${resultKind(job)}`);
    button.addEventListener("click", () => { if (job) { state.selectedJobId = job.id; renderStages(); } });
    container.appendChild(button);
  });
  if (!state.selectedJobId) { const first = findJobForStage(0); if (first) state.selectedJobId = first.id; }
  $$(".stage-button").forEach((button, index) => button.setAttribute("aria-selected", String(findJobForStage(index)?.id === state.selectedJobId)));
  renderSelectedJob();
}

function renderSelectedJob() {
  const job = state.jobs.find((item) => item.id === state.selectedJobId);
  const title = $("#selectedJobTitle"); const duration = $("#selectedJobDuration"); const list = $("#stepList");
  clearNode(list);
  if (!job) { title.textContent = "Select a stage"; duration.textContent = "—"; appendText(list, "p", "No job steps are available.", "empty-state"); return; }
  title.textContent = job.name; duration.textContent = formatDuration(durationMs(job.started_at, job.completed_at));
  if (!job.steps.length) { appendText(list, "p", "This job returned no steps. It may still be running or GitHub did not return step details.", "empty-state"); return; }
  const durations = job.steps.map((step) => durationMs(step.started_at, step.completed_at));
  const maxDuration = Math.max(...durations, 1);
  job.steps.forEach((step, index) => {
    const kind = resultKind(step);
    const row = document.createElement("div"); row.className = "step-row";
    const dot = document.createElement("span"); dot.className = `status-dot ${kind}`; dot.setAttribute("aria-hidden", "true"); row.appendChild(dot);
    appendText(row, "span", step.name || `Step ${index + 1}`, "step-name");
    const track = document.createElement("div"); track.className = "duration-track"; track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("div"); bar.className = `duration-bar ${kind}`; bar.style.width = `${Math.max(2, Math.round((durations[index] / maxDuration) * 100))}%`;
    track.appendChild(bar); row.appendChild(track);
    appendText(row, "span", formatDuration(durations[index]), "step-duration"); list.appendChild(row);
  });
}

function renderHistory() {
  const filtered = state.runs.filter((run) => state.historyFilter === "all" || resultKind(run) === state.historyFilter);
  const body = $("#historyBody"); clearNode(body); $("#historyEmpty").hidden = filtered.length !== 0;
  filtered.forEach((run) => {
    const row = document.createElement("tr");
    const runCell = document.createElement("td"); const link = document.createElement("a");
    link.href = run.html_url || "https://github.com/abhinavs1703/ci-cd-testing-deployment-pipeline/actions"; link.target="_blank"; link.rel="noreferrer"; link.textContent=`#${run.number}`;
    runCell.appendChild(link); row.appendChild(runCell);
    appendText(row, "td", shortSha(run.head_sha), "commit"); appendText(row, "td", run.head_branch || "main");
    const resultCell = document.createElement("td"); appendText(resultCell, "span", resultLabel(run), `result ${resultKind(run)}`); row.appendChild(resultCell);
    appendText(row, "td", formatDuration(durationMs(run.run_started_at || run.created_at, run.updated_at)));
    appendText(row, "td", formatDate(run.run_started_at || run.created_at)); body.appendChild(row);
  });
  renderDurationChart(filtered);
}

function svgElement(name, attributes) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function renderDurationChart(runs) {
  const svg = $("#durationChart");
  Array.from(svg.children).filter((child) => !["title","desc"].includes(child.tagName)).forEach((child) => child.remove());
  if (!runs.length) return;
  const width=900,height=220,padding={top:18,right:18,bottom:38,left:42},chartHeight=height-padding.top-padding.bottom,chartWidth=width-padding.left-padding.right;
  const maxDuration=Math.max(...runs.map((run)=>durationMs(run.run_started_at||run.created_at,run.updated_at)),1000),gap=8;
  const barWidth=Math.max(12,(chartWidth-gap*(runs.length-1))/runs.length);
  [0,.5,1].forEach((fraction)=>{ const y=padding.top+chartHeight*(1-fraction); svg.appendChild(svgElement("line",{x1:padding.left,x2:width-padding.right,y1:y,y2:y,class:"chart-grid"})); });
  runs.forEach((run,index)=>{
    const value=durationMs(run.run_started_at||run.created_at,run.updated_at),barHeight=Math.max(2,(value/maxDuration)*chartHeight),x=padding.left+index*(barWidth+gap),y=padding.top+chartHeight-barHeight;
    const rect=svgElement("rect",{x,y,width:barWidth,height:barHeight,rx:2,class:`chart-bar ${resultKind(run)}`});
    rect.setAttribute("aria-label",`Run ${run.number}: ${formatDuration(value)}, ${resultLabel(run)}`); svg.appendChild(rect);
    const label=svgElement("text",{x:x+barWidth/2,y:height-18,"text-anchor":"middle",class:"chart-label"}); label.textContent=`#${run.number}`; svg.appendChild(label);
  });
}

function showPipelineError(error) {
  const banner=$("#dataBanner");
  if (!error) { banner.hidden=true; banner.textContent=""; return; }
  banner.hidden=false; banner.textContent=`GitHub data is stale or unavailable. Showing cached data where available. This can happen when GitHub rate-limits API requests. ${error}`;
}

async function refreshDashboard() {
  const button=$("#refreshButton"); setButtonLoading(button,"Refreshing…",true);
  try {
    const [versionResult,pipelineResult]=await Promise.allSettled([fetchJson("/version"),fetchJson("/api/pipeline")]);
    if (versionResult.status==="fulfilled") renderSummary(versionResult.value);
    if (pipelineResult.status==="fulfilled") {
      state.runs=Array.isArray(pipelineResult.value.runs)?pipelineResult.value.runs:[];
      state.jobs=Array.isArray(pipelineResult.value.jobs)?pipelineResult.value.jobs:[];
      renderRunSummary(); renderStages(); renderHistory(); showPipelineError(pipelineResult.value.error);
      const latest=state.runs[0],runLink=$("#latestRunLink");
      if (latest?.html_url) { runLink.hidden=false; runLink.href=latest.html_url; } else runLink.hidden=true;
    } else showPipelineError(pipelineResult.reason?.message||"The dashboard could not load GitHub data.");
    await runEndpointChecks();
  } catch (error) {
    showPipelineError(error.message||"The dashboard could not refresh.");
  } finally {
    $("#lastUpdated").textContent=`Last updated ${formatDate(new Date().toISOString())}`;
    setButtonLoading(button,"Refreshing…",false);
  }
}

$$(".filter-button").forEach((button)=>button.addEventListener("click",()=>{
  state.historyFilter=button.dataset.filter;
  $$(".filter-button").forEach((item)=>{ const active=item===button; item.classList.toggle("active",active); item.setAttribute("aria-pressed",String(active)); });
  renderHistory();
}));
$("#runChecksButton").addEventListener("click",runEndpointChecks);
ENDPOINTS.forEach((endpoint)=>{ state.endpointResults[endpoint.path]=[]; });
renderEndpointChecks();
refreshDashboard();
setInterval(refreshDashboard,60000);
