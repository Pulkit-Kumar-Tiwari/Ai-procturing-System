const $leader = (selector, root = document) => root.querySelector(selector);
$leader("#sideBtn").onclick = () => {
  $leader("#side").classList.toggle(innerWidth < 768 ? "open" : "expanded");
};
function leaderboardBadge(t, text) {
  return `<span class="badge ${t}">${escapeHTML(text)}</span>`;
}
function candidateStatus(candidate) {
  if (candidate.status === "Completed")
    return leaderboardBadge("off", "Completed");
  if (candidate.status === "Disqualified")
    return leaderboardBadge("bad", "Disqualified");
  if (candidate.status === "Left") return leaderboardBadge("warn", "Left");
  if (candidate.status === "Offline") return leaderboardBadge("bad", "Offline");
  if (candidate.status === "Readiness")
    return leaderboardBadge("off", "Setup check");
  if (candidate.status === "Alert")
    return leaderboardBadge("warn", "Review needed");
  return candidate.connected
    ? leaderboardBadge("ok", "Monitoring")
    : leaderboardBadge("bad", "No update");
}
function leaderboardScore(score) {
  const color = score >= 90 ? "ok" : score >= 75 ? "warn" : "bad";
  return leaderboardBadge(color, `${score}%`);
}
function renderLeaderboard() {
  const candidates = getLiveCandidates()
    .map((candidate) => {
      const total = Math.max(0, Number(candidate.total) || 0),
        answered = Math.max(0, Number(candidate.answered) || 0);
      const progress = total
        ? Math.min(100, Math.round((answered / total) * 100))
        : 0;
      const score = monitoringScore(candidate.events),
        openAlerts = candidate.events.filter(
          (event) => event.reviewStatus === "Open",
        ).length;
      const alertClearance = Math.max(0, 100 - openAlerts * 20),
        rankIndex = Math.round(
          score * 0.3 + progress * 0.4 + alertClearance * 0.3,
        );
      return {
        ...candidate,
        total,
        answered,
        progress,
        score,
        openAlerts,
        rankIndex,
      };
    })
    .sort(
      (a, b) =>
        b.rankIndex - a.rankIndex ||
        b.score - a.score ||
        b.progress - a.progress ||
        a.openAlerts - b.openAlerts ||
        Number(b.connected) - Number(a.connected) ||
        b.updatedAt - a.updatedAt ||
        a.name.localeCompare(b.name),
    );
  const active = candidates.filter(
    (candidate) =>
      candidate.connected &&
      !["Completed", "Disqualified", "Left"].includes(candidate.status),
  ).length;
  const avg = candidates.length
    ? Math.round(
        candidates.reduce((sum, candidate) => sum + candidate.score, 0) /
          candidates.length,
      )
    : 0;
  const alertCount = candidates.reduce(
    (sum, candidate) => sum + candidate.openAlerts,
    0,
  );
  $leader("#leaderboardStats").innerHTML = [
    ["Candidates", candidates.length],
    ["Connected now", active],
    ["Average monitor score", candidates.length ? `${avg}%` : "—"],
    ["Open alerts", alertCount],
  ]
    .map(
      ([label, value]) =>
        `<div class="card"><p class="mut text-sm">${label}</p><p class="text-3xl font-bold">${value}</p></div>`,
    )
    .join("");
  $leader("#lastUpdated").textContent =
    `Updated ${new Date().toLocaleTimeString()}`;
  $leader("#leaderboardBody").innerHTML = candidates.length
    ? candidates
        .map((candidate, index) => {
          const camera = candidate.camera
            ? candidate.videoShareConsent
              ? "On · sharing"
              : "On · private"
            : "Off";
          const faceCheck = candidate.ai
            ? ` · ${Number.isInteger(candidate.faceCount) ? `${candidate.faceCount} face(s)` : "AI on"}`
            : " · AI off";
          const network =
            candidate.conn === "Connected"
              ? leaderboardBadge("ok", "Connected")
              : candidate.conn === "Checking"
                ? leaderboardBadge("warn", "Checking")
                : leaderboardBadge("bad", candidate.conn || "Unknown");
          return `<tr><td class="leaderboard-rank">${index + 1}</td><td>${leaderboardScore(candidate.rankIndex)}</td><th scope="row"><span class="leaderboard-name">${escapeHTML(candidate.name)}</span><span class="leaderboard-exam">${escapeHTML(candidate.exam || "")}</span></th><td>${leaderboardScore(candidate.score)}</td><td><div class="leaderboard-progress"><span>${candidate.answered} / ${candidate.total} answered</span><span class="leaderboard-meter" role="progressbar" aria-label="${escapeHTML(candidate.name)} exam progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${candidate.progress}"><i style="width:${candidate.progress}%"></i></span></div></td><td>${leaderboardBadge(candidate.openAlerts ? "warn" : "off", String(candidate.openAlerts))}</td><td>${escapeHTML(camera)}<span class="leaderboard-sub">${escapeHTML(faceCheck)}</span></td><td>${network}</td><td>${candidateStatus(candidate)}</td><td class="mono mut">${new Date(candidate.updatedAt).toLocaleTimeString()}</td></tr>`;
        })
        .join("")
    : '<tr><td colspan="10" class="leaderboard-empty"><strong>No live candidate sessions yet.</strong><span>Open the candidate exam and this page in tabs in the same browser to populate the rankings.</span><a class="btn btn-p mt-3" href="exam.html">Open candidate exam demo</a></td></tr>';
}
renderLeaderboard();
liveSessions.subscribe(renderLeaderboard);
setInterval(renderLeaderboard, 3000);
