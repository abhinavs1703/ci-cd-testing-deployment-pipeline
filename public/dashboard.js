const fmtTime = (value) => value ? new Date(value).toLocaleString([], {dateStyle:"medium",timeStyle:"short"}) : "—";
const shortSha = (value) => value ? value.slice(0, 7) : "—";

function setStatus(el, text, type) {
  el.textContent = text;
  el.classList.remove("ok-text","fail-text");
  if (type === "ok") el.classList.add("ok-text");
  if (type === "fail") el.classList.add("fail-text");
}

function stage(stage, state, label) {
  const el = document.querySelector('[data-stage="' + stage + '"]');
  if (!el) return;
  el.classList.remove("ok","fail","running");
  el.classList.add(state);
  el.querySelector(".stage-status").textContent = label;
}

async function refreshDashboard() {
  const refresh = document.getElementById("refreshBtn");
  refresh.disabled = true;
  refresh.textContent = "Refreshing…";

  try {
    const [health, version, pipeline] = await Promise.all([
      fetch("/healthz", {cache:"no-store"}).then(r => r.ok ? r.json() : Promise.reject(new Error("health"))),
      fetch("/version", {cache:"no-store"}).then(r => r.ok ? r.json() : Promise.reject(new Error("version"))),
      fetch("/api/pipeline", {cache:"no-store"}).then(r => r.json())
    ]);

    setStatus(document.getElementById("deployStatus"), "Healthy", "ok");
    document.getElementById("deployDetail").textContent = "Production /healthz returned OK";
    document.getElementById("healthBadge").textContent = "Healthy";
    document.getElementById("healthBadge").className = "status-badge";
    document.getElementById("healthState").textContent = "200 OK ↗";
    document.getElementById("healthState").className = "ok-text";
    document.getElementById("rootState").textContent = "Live ↗";
    document.getElementById("rootState").className = "ok-text";
    document.getElementById("versionState").textContent = "Live ↗";
    document.getElementById("versionState").className = "ok-text";

    document.getElementById("appVersion").textContent = "v" + version.version;
    document.getElementById("commitSha").textContent = "Commit " + shortSha(version.commit);

    renderPipeline(pipeline);
  } catch (error) {
    setStatus(document.getElementById("deployStatus"), "Attention", "fail");
    document.getElementById("deployDetail").textContent = "One or more status checks failed";
    document.getElementById("healthBadge").textContent = "Unavailable";
    document.getElementById("healthBadge").className = "status-badge";
    document.getElementById("healthState").textContent = "Check failed";
    document.getElementById("healthState").className = "fail-text";
  } finally {
    document.getElementById("updatedAt").textContent = "Last refreshed " + new Date().toLocaleTimeString();
    refresh.disabled = false;
    refresh.textContent = "Refresh";
  }
}

function renderPipeline(data) {
  const run = data.run;
  if (!run) {
    document.getElementById("pipelineStatus").textContent = "Unavailable";
    document.getElementById("pipelineTime").textContent = "GitHub API unavailable";
    document.getElementById("runBadge").textContent = "Unavailable";
    document.getElementById("activity").innerHTML = '<div class="activity-row"><div class="activity-dot"></div><div class="activity-copy"><strong>Pipeline data unavailable</strong><span>Production health is still checked independently.</span></div></div>';
    return;
  }

  const conclusion = run.conclusion;
  const status = run.status;
  const overall = conclusion === "success" ? "Passed" : status === "in_progress" || status === "queued" ? "Running" : "Failed";
  const overallType = conclusion === "success" ? "ok" : overall === "Running" ? "run" : "fail";

  document.getElementById("pipelineStatus").textContent = overall;
  document.getElementById("pipelineStatus").className = overall === "Passed" ? "ok-text" : overall === "Failed" ? "fail-text" : "";
  document.getElementById("pipelineTime").textContent = fmtTime(run.updated_at || run.created_at);
  document.getElementById("runBadge").textContent = overall;
  document.getElementById("runBadge").className = "status-badge " + (overallType === "ok" ? "" : overallType === "fail" ? "fail-text" : "");

  document.getElementById("runTitle").textContent = run.display_title || "Pipeline activity";
  const runLink = document.getElementById("runLink");
  runLink.href = run.html_url || "https://github.com/abhinavs1703/ci-cd-testing-deployment-pipeline/actions";

  const jobs = data.jobs || [];
  const findJob = (name) => jobs.find(j => j.name.toLowerCase().includes(name));
  const test = findJob("test application");
  const build = findJob("build and push");
  const deploy = findJob("deploy to production");

  const stateFor = (job) => {
    if (!job) return ["running","pending"];
    if (job.conclusion === "success") return ["ok","Passed"];
    if (job.conclusion === "failure" || job.conclusion === "cancelled") return ["fail","Failed"];
    return ["running","Running"];
  };

  const [testState,testLabel] = stateFor(test);
  const [buildState,buildLabel] = stateFor(build);
  const [deployState,deployLabel] = stateFor(deploy);
  stage("test",testState,testLabel);
  stage("build",buildState,buildLabel);
  stage("deploy",deployState,deployLabel);
  stage("verify",deployState,deployLabel === "Passed" ? "Verified" : deployLabel);

  const activity = jobs.length ? jobs.map(job => {
    const [kind,label] = stateFor(job);
    return '<div class="activity-row"><div class="activity-dot ' + (kind === "ok" ? "ok" : kind === "fail" ? "fail" : "run") + '"></div><div class="activity-copy"><strong>' + escapeHtml(job.name) + '</strong><span>' + escapeHtml(label) + '</span></div><span class="activity-time">' + fmtTime(job.completed_at || job.started_at) + '</span></div>';
  }).join("") : '<div class="activity-row"><div class="activity-dot"></div><div class="activity-copy"><strong>No job details returned</strong><span>Open the Actions run for the full execution graph.</span></div></div>';

  document.getElementById("activity").innerHTML = activity;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[char]));
}

document.getElementById("refreshBtn").addEventListener("click", refreshDashboard);
refreshDashboard();
setInterval(refreshDashboard, 30000);