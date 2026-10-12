// Used by dashboard.html and candidate.html (see data-page on <body>).
const page = document.body.dataset.page;
$("#sideBtn").onclick = () => {
  $("#side").classList.toggle(innerWidth < 768 ? "open" : "expanded");
};
const f = { q: "", status: "all", sev: "all" };
let liveCandidates = [],
  livePaused = false,
  selectedSessionId = new URLSearchParams(location.search).get("session"),
  selectedPanelSignature = null,
  watchPeer = null,
  watchRemoteStream = null,
  watchSessionId = null,
  watchRequestId = null,
  watchAnswerApplied = null;
let refreshCandidateDetails = null;
function reviewLabel(status) {
  return status === "Dismissed as false positive" ? "Dismissed" : status;
}
function profileScores(
  progress,
  score,
  size = 48,
  progressLabel = "Exam progress",
) {
  const progressValue = Math.max(
    0,
    Math.min(100, Math.round(Number(progress) || 0)),
  );
  const compact = size < 48;
  return `<div class="profile-scores"><div class="profile-score">${ring(progressValue, size, progressLabel, progressValue === 100 ? "ok" : progressValue === 0 ? "off" : "brand")}<span>${compact ? "Progress" : escapeHTML(progressLabel)}</span></div><div class="profile-score">${ring(score, size, "Estimated monitoring score")}<span>${compact ? "Monitor" : "Monitor score"}</span></div></div>`;
}
function readLiveCandidates() {
  liveCandidates = getLiveCandidates();
}
function renderStats() {
  const act = liveCandidates.filter(
      (c) =>
        c.connected &&
        !["Completed", "Disqualified", "Left"].includes(c.sessionStatus),
    ).length,
    running = liveCandidates.filter(
      (c) => c.connected && c.sessionStatus === "In exam",
    ).length,
    openAlertCount = liveCandidates.reduce(
      (n, c) =>
        n +
        (c.events || []).filter((event) => event.reviewStatus === "Open")
          .length,
      0,
    );
  const s = [
    ["Connected now", act],
    ["Taking an exam", running],
    ["Open alerts", openAlertCount],
    ["Demo records", candidates.length],
    [
      "Internet OK",
      liveCandidates.filter((c) => c.connected && c.conn === "Connected")
        .length,
    ],
  ];
  $("#stats").innerHTML = s
    .map(
      ([l, v]) =>
        `<div class="card"><p class="mut text-sm">${l}</p><p class="text-3xl font-bold">${v}</p></div>`,
    )
    .join("");
}
function renderLiveGrid() {
  $("#liveGrid").innerHTML = liveCandidates.length
    ? liveCandidates
        .map((c) => {
          const activity = ["Completed", "Disqualified"].includes(c.status)
            ? badge("off", escapeHTML(c.status))
            : c.status === "Left"
              ? badge("bad", "Left")
              : c.connected
                ? badge("ok", "Active")
                : badge("bad", "Inactive");
          const status =
            c.status === "Completed"
              ? badge("off", "Exam ended")
              : c.status === "Disqualified"
                ? badge("bad", "Disqualified")
                : c.status === "Left"
                  ? badge("warn", "Left before completion")
                  : c.events.some(
                        (event) =>
                          event.severity === "HIGH" &&
                          event.reviewStatus === "Open",
                      )
                    ? badge("warn", "Review needed")
                    : c.status === "Readiness"
                      ? badge("ok", "Setup check")
                      : badge("ok", "Monitoring");
          const network =
            c.conn === "Connected"
              ? badge("ok", "Internet OK")
              : c.conn === "Checking"
                ? badge("warn", "Checking")
                : badge("bad", "No internet");
          return `<button type="button" class="session-row ${c.sessionId === selectedSessionId ? "selected" : ""}" data-select-session="${escapeHTML(c.sessionId)}" aria-pressed="${c.sessionId === selectedSessionId}">
<span class="session-card-content"><span class="session-name"><strong>${escapeHTML(c.name)}</strong><time class="mono mut text-xs">${new Date(c.updatedAt).toLocaleTimeString()}</time></span>
<span class="session-labels">${activity}${status}${network}${badge(c.events.filter((e) => e.reviewStatus === "Open").length ? "warn" : "off", `${c.events.filter((e) => e.reviewStatus === "Open").length} open alerts`)}</span>
<span class="session-summary"><strong>${escapeHTML(c.exam)}</strong><span>${Number(c.question) || 0}/${Number(c.total) || 0}</span></span></span>
${profileScores(c.total ? (100 * (Number(c.answered) || 0)) / Number(c.total) : 0, monitoringScore(c.events), 42)}</button>`;
        })
        .join("")
    : '<div class="card text-center"><p class="font-bold">No candidates yet</p><p class="mut mt-1">Open the exam and this page in two tabs in the same browser.</p></div>';
}
function renderGrid() {
  const list = candidates.filter(
    (c) =>
      `${c.name} ${c.status} ${c.conn} ${c.id}`.toLowerCase().includes(f.q) &&
      (f.status === "all" || c.status === f.status),
  );
  $("#grid").innerHTML = list.length
    ? list
        .map(
          (
            c,
          ) => `<article class="card"><div class="cam mb-3" style="aspect-ratio:16/7"><div class="camfb">${c.cam ? "Camera preview (simulated)" : "No camera signal"}</div></div>
<div class="flex justify-between items-start gap-2"><div><h3 class="font-bold text-lg">${escapeHTML(c.name)}</h3>${badge(...ST[c.status])}</div>${profileScores((100 * c.q) / c.total, c.score, 42, "Question position")}</div>
<p class="mut text-xs mt-2">Sample monitoring score; not live AI.</p>
<p class="mut text-sm mt-2">Sample question ${c.q}/${c.total} · Sample connection: ${c.conn}</p><a class="btn btn-p w-full mt-3" href="candidate.html?id=${c.id}" aria-label="View sample record for ${escapeHTML(c.name)}">View sample record</a></article>`,
        )
        .join("")
    : '<div class="card sm:col-span-2 text-center"><p class="font-bold">No candidates match</p><p class="mut">Try a different name or clear the status filter.</p></div>';
}
function renderSignals(c) {
  const events = eventList(c)
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.reviewStatus === "Open");
  return `<section class="alerts-section mt-6" aria-labelledby="signals-heading"><div class="alerts-heading"><div><h2 id="signals-heading" class="text-xl font-bold">Alerts</h2><p class="mut text-sm">Check before acting. Alerts can be wrong.</p></div><div class="alerts-key" aria-label="Alert actions"><span><b class="review-icon">✓</b> Reviewed</span><span><b class="dismiss-icon">×</b> Dismissed</span></div></div>
${events.length ? `<div class="alerts-grid">${events.map(({ event, index }) => `<article class="signal-card signal-${event.severity.toLowerCase()}"><div class="signal-meta">${sevBadge(event.severity)} ${badge("warn", "Open")}<time class="mono mut">${escapeHTML(event.at)}</time></div><p class="signal-title">${escapeHTML(event.label)}</p><form class="signal-review" data-review-form data-review-session="${escapeHTML(c.sessionId)}" data-event-index="${index}"><label class="signal-note-label" for="note-${escapeHTML(c.sessionId)}-${escapeHTML(event.id)}">Note <span>(required)</span></label><textarea class="input signal-note" id="note-${escapeHTML(c.sessionId)}-${escapeHTML(event.id)}" data-event-note="${escapeHTML(event.id)}" rows="1" maxlength="240" required placeholder="Add a short note">${escapeHTML(event.note)}</textarea><div class="signal-actions"><button class="signal-action action-reviewed" type="submit" data-review-status="Reviewed" aria-label="Mark reviewed" title="Mark reviewed"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="signal-action action-dismiss" type="submit" data-review-status="Dismissed as false positive" aria-label="Dismiss alert" title="Dismiss alert"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></button></div></form></article>`).join("")}</div>` : '<p class="card mut">No open alerts.</p>'}</section>`;
}
function renderHelpRequest(c) {
  const help = c.helpRequest;
  if (!help || !help.message)
    return '<div class="help-request mt-5"><h2 class="font-bold">Help</h2><p class="mut text-sm mt-1">No help request.</p></div>';
  return `<div class="help-request mt-5"><div class="flex justify-between gap-2"><h2 class="font-bold">Candidate needs help</h2>${badge(help.status === "Answered" ? "ok" : "warn", escapeHTML(help.status === "Answered" ? "Seen" : "New"))}</div><p class="mt-2">${escapeHTML(help.message)}</p><p class="mono mut text-xs mt-1">${escapeHTML(help.at || "")}</p>${help.status !== "Answered" ? `<button class="btn btn-p mt-3" type="button" data-ack-help="${escapeHTML(c.sessionId)}">Mark as seen</button>` : '<p class="mut text-sm mt-2">The candidate can see that you have read this.</p>'}</div>`;
}
function renderWatchPanel(c) {
  const watch = c.videoWatch || {},
    active =
      watchSessionId === c.sessionId &&
      watchRequestId === watch.id &&
      watchPeer;
  const connected = active && watchPeer.connectionState === "connected";
  const allowed = c.videoShareConsent === true;
  const canWatch = allowed && c.sessionStatus === "In exam" && c.camera;
  const status = connected
    ? "Live video from this browser"
    : !allowed
      ? "Candidate has not allowed live video"
      : !canWatch
        ? "Available when the exam and camera are on"
        : watch.state === "Requested"
          ? "Connecting to the candidate…"
          : "Camera status is available; video is not being shown";
  const action = connected
    ? "Stop watching"
    : canWatch
      ? "Watch live"
      : "Not available yet";
  return `<section class="watch-panel mt-5" aria-label="Live candidate video"><div class="watch-header"><div><h2 class="font-bold">Candidate video</h2><p class="mut text-sm" data-watch-status>${escapeHTML(status)}</p></div><span class="watch-indicator ${connected ? "watching" : ""}" aria-hidden="true"></span></div><div class="watch-video-wrap"><video id="watchVideo" autoplay muted playsinline aria-label="Candidate live camera video" hidden></video><p class="watch-placeholder">${allowed ? "Video is off until you start watching." : "The candidate must allow video sharing first."}</p></div><button class="btn ${connected ? "" : "btn-p"} mt-3" type="button" data-watch-session="${escapeHTML(c.sessionId)}" ${!connected && !canWatch ? "disabled" : ""}>${action}</button><p class="mut text-xs mt-2">Only available with the candidate’s consent, in another tab on this browser. Video is not saved or sent to a server.</p></section>`;
}
function attachWatchVideo() {
  const video = $("#watchVideo");
  if (!video || !watchRemoteStream) return;
  video.srcObject = watchRemoteStream;
  video.hidden = false;
  const placeholder = video.parentElement.querySelector(".watch-placeholder");
  if (placeholder) placeholder.hidden = true;
  video
    .play()
    .catch((error) =>
      toast(`Live video playback could not start: ${error.message}`, "bad"),
    );
}
function stopWatching(sessionId = watchSessionId) {
  const id = watchRequestId,
    peer = watchPeer;
  if (peer) peer.close();
  if (watchRemoteStream)
    watchRemoteStream.getTracks().forEach((track) => track.stop());
  watchPeer = null;
  watchRemoteStream = null;
  watchSessionId = null;
  watchRequestId = null;
  watchAnswerApplied = null;
  const session = sessionId && liveSessions.read()[sessionId],
    watch = session?.videoWatch;
  if (watch && id && watch.id === id && watch.state !== "Stopped") {
    liveSessions.update(sessionId, {
      videoWatch: { ...watch, state: "Stopped", answer: null },
    });
  }
}
function waitForIceGatheringComplete(peer) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timeout = setTimeout(finish, 5000);
    peer.addEventListener("icegatheringstatechange", check);
  });
}
async function startWatching(sessionId) {
  const session = liveSessions.read()[sessionId];
  if (!session?.videoShareConsent) {
    toast("The candidate has not allowed live video.", "warn");
    return;
  }
  if (session.status !== "In exam") {
    toast("Live video is available while the exam is in progress.", "warn");
    return;
  }
  stopWatching();
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const peer = new RTCPeerConnection({ iceServers: [] });
    watchPeer = peer;
    watchSessionId = sessionId;
    watchRequestId = id;
    watchRemoteStream = new MediaStream();
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.ontrack = (event) => {
      watchRemoteStream = event.streams[0] || new MediaStream([event.track]);
      attachWatchVideo();
    };
    peer.addEventListener("connectionstatechange", () => {
      if (watchPeer !== peer) return;
      if (peer.connectionState === "connected") {
        const latest = liveSessions.read()[sessionId],
          watch = latest?.videoWatch;
        if (watch?.id === id)
          liveSessions.update(sessionId, {
            videoWatch: { ...watch, state: "Watching" },
          });
        refreshExaminerView();
      } else if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        if (peer.connectionState === "failed")
          toast(
            "The live video connection failed. Check that both tabs are open in this browser.",
            "bad",
          );
        if (watchPeer === peer) {
          watchPeer = null;
          watchRemoteStream = null;
          watchSessionId = null;
          watchRequestId = null;
          watchAnswerApplied = null;
          refreshExaminerView();
        }
      }
    });
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await waitForIceGatheringComplete(peer);
    if (watchPeer !== peer) return;
    const result = liveSessions.update(sessionId, {
      videoWatch: {
        id,
        state: "Requested",
        offer: peer.localDescription.toJSON(),
        answer: null,
      },
    });
    if (!result)
      throw new Error("The video request could not be shared in this browser.");
    refreshExaminerView();
  } catch (error) {
    if (watchPeer) stopWatching(sessionId);
    toast(`Live video could not start: ${error.message}`, "bad");
  }
}
function refreshExaminerView() {
  if (page === "dashboard") refresh();
  else if (page === "candidate") refreshCandidateDetails?.();
}
function processWatchAnswer(sessions) {
  if (!watchPeer || !watchSessionId || !watchRequestId) return;
  const session = sessions[watchSessionId],
    watch = session?.videoWatch;
  if (
    !session ||
    !session.videoShareConsent ||
    session.status !== "In exam" ||
    watch?.state === "Stopped"
  ) {
    stopWatching(watchSessionId);
    return;
  }
  if (
    !watch ||
    watch.id !== watchRequestId ||
    !watch.answer ||
    watchAnswerApplied === watch.id
  )
    return;
  watchAnswerApplied = watch.id;
  watchPeer.setRemoteDescription(watch.answer).catch((error) => {
    toast(
      `The candidate video response could not be opened: ${error.message}`,
      "bad",
    );
    stopWatching(watchSessionId);
  });
}
function renderSelectedPanel() {
  const panel = $("#selectedPanel");
  if (!panel) return;
  const c = liveCandidates.find(
    (candidate) => candidate.sessionId === selectedSessionId,
  );
  if (!c) {
    if (selectedPanelSignature !== null) {
      panel.innerHTML =
        '<p class="font-bold">Choose a candidate</p><p class="mut text-sm mt-2">Their exam details and alerts will appear here.</p>';
      selectedPanelSignature = null;
    }
    return;
  }
  const signature = JSON.stringify({
    id: c.sessionId,
    connected: c.connected,
    status: c.status,
    sessionStatus: c.sessionStatus,
    conn: c.conn,
    question: c.question,
    total: c.total,
    answered: c.answered,
    camera: c.camera,
    ai: c.ai,
    faceCount: c.faceCount,
    events: c.events,
    helpRequest: c.helpRequest,
    videoShareConsent: c.videoShareConsent,
    videoWatch: c.videoWatch,
    cameraRequest: c.cameraRequest,
    timeGrantedSeconds: c.timeGrantedSeconds,
  });
  if (signature === selectedPanelSignature) return;
  selectedPanelSignature = signature;
  const draftNotes = new Map(
    $$("[data-event-note]", panel).map((field) => [
      field.dataset.eventNote,
      field.value,
    ]),
  );
  const focusId = panel.contains(document.activeElement)
    ? document.activeElement.dataset.eventNote
    : null;
  const selection = focusId
    ? {
        start: document.activeElement.selectionStart,
        end: document.activeElement.selectionEnd,
      }
    : null;
  const network =
    c.conn === "Connected"
      ? badge("ok", "Connected")
      : c.conn === "Checking"
        ? badge("warn", "Checking")
        : badge("bad", "No internet");
  const canManage = !["Completed", "Disqualified"].includes(c.sessionStatus),
    inExam =
      c.sessionStatus === "In exam" && c.connected && c.status !== "Left";
  const requestState = c.cameraRequest?.state;
  const cameraRequestStatus =
    requestState === "Pending"
      ? "Waiting for the candidate to respond."
      : requestState === "Accepted"
        ? "Candidate allowed video sharing."
        : requestState === "Declined"
          ? "Candidate declined the camera request."
          : requestState === "Stopped"
            ? "Candidate stopped sharing video."
            : "No camera request sent.";
  panel.innerHTML = `<header class="selected-heading"><div><p class="eyebrow">EXAM DETAILS</p><h2 class="text-2xl font-bold">${escapeHTML(c.name)}</h2><p class="mut text-sm">${escapeHTML(c.exam)} · ${escapeHTML(c.sessionStatus || "Status unavailable")}</p></div><a class="btn" href="candidate.html?session=${encodeURIComponent(c.sessionId)}">More details</a></header>
<div class="profile-summary"><h3 class="font-bold">Candidate scores</h3>${profileScores(c.total ? (100 * (Number(c.answered) || 0)) / Number(c.total) : 0, monitoringScore(c.events), 56)}<p class="mut text-xs">Monitor score starts at 100: LOW -3, MEDIUM -10, HIGH -25. Dismissed false positives do not count. It is not a grade or proof of misconduct.</p></div>
<div class="session-facts mt-4"><p><span>Browser</span>${c.status === "Left" ? badge("warn", "Left") : c.connected ? badge("ok", "Connected") : badge("bad", "No update")}</p><p><span>Internet</span>${network}</p><p><span>Question</span><strong>${Number(c.question) || 0} of ${Number(c.total) || 0}</strong></p><p><span>Camera</span><strong>${c.camera ? (c.videoShareConsent ? "On · sharing allowed" : "On · private") : "Off"}</strong></p><p><span>Face check</span><strong>${c.ai ? "Running" : "Off"}</strong></p><p><span>Faces seen</span><strong>${Number.isInteger(c.faceCount) ? c.faceCount : "—"}</strong></p></div>
<section class="examiner-actions mt-5" aria-label="Examiner actions"><h2 class="font-bold">Examiner actions</h2><p class="mut text-sm mt-1">Time extension is 25 seconds. Camera access always needs the candidate’s response.</p><div class="flex flex-wrap gap-2 mt-3"><button class="btn" type="button" data-session-action="request-camera" data-session-id="${escapeHTML(c.sessionId)}" ${!inExam ? "disabled" : ""}>Ask candidate to open camera</button><button class="btn" type="button" data-session-action="add-time" data-session-id="${escapeHTML(c.sessionId)}" ${!inExam ? "disabled" : ""}>Add 25 seconds</button><button class="btn" type="button" data-session-action="disqualify" data-session-id="${escapeHTML(c.sessionId)}" ${!canManage ? "disabled" : ""}>Disqualify candidate</button></div><p class="mut text-sm mt-2">${escapeHTML(cameraRequestStatus)}${Number(c.timeGrantedSeconds) > 0 ? ` ${Number(c.timeGrantedSeconds)} seconds added so far.` : ""}</p></section>
${renderWatchPanel(c)}${renderHelpRequest(c)}${renderSignals(c)}<p class="mut text-xs mt-5">Session updates are shared only between tabs open in this browser and site.</p>`;
  attachWatchVideo();
  draftNotes.forEach((value, id) => {
    const field = $$("[data-event-note]", panel).find(
      (note) => note.dataset.eventNote === id,
    );
    if (field) field.value = value;
  });
  if (focusId) {
    const field = $$("[data-event-note]", panel).find(
      (note) => note.dataset.eventNote === focusId,
    );
    if (field) {
      field.focus();
      field.setSelectionRange(selection.start, selection.end);
    }
  }
}
function refresh() {
  readLiveCandidates();
  if (!liveCandidates.some((c) => c.sessionId === selectedSessionId))
    selectedSessionId = liveCandidates[0]?.sessionId || null;
  renderStats();
  renderLiveGrid();
  renderGrid();
  renderSelectedPanel();
}
function exportReport() {
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const rows = [
    [
      "Record type",
      "Candidate",
      "Status",
      "Question progress",
      "Internet or sample connection",
      "Camera",
      "Sample score",
      "Recorded signals",
    ],
  ];
  liveCandidates.forEach((c) =>
    rows.push([
      "Live session",
      c.name,
      c.status,
      `${c.question}/${c.total}`,
      c.conn,
      c.camera
        ? c.videoShareConsent
          ? "On, sharing allowed"
          : "On, private"
        : "Off",
      "",
      (c.events || []).length,
    ]),
  );
  candidates.forEach((c) =>
    rows.push([
      "Sample",
      c.name,
      c.status,
      `${c.q}/${c.total}`,
      c.conn,
      c.cam ? "Simulated on" : "No signal",
      `${c.score}%`,
      c.events.length,
    ]),
  );
  rows.push([]);
  rows.push([
    "Candidate",
    "Time",
    "Potential alert",
    "Severity",
    "Review status",
    "Review note",
  ]);
  liveCandidates.forEach((c) =>
    (c.events || []).forEach((event) =>
      rows.push([
        c.name,
        event.at,
        event.label,
        event.severity,
        event.reviewStatus,
        event.note,
      ]),
    ),
  );
  candidates.forEach((c) =>
    c.events
      .filter((e) => e[1] !== "Normal activity")
      .forEach(([time, label, severity]) =>
        rows.push([c.name, time, label, severity, "Sample event", ""]),
      ),
  );
  const csv =
    "\uFEFF" + rows.map((row) => row.map(quote).join(",")).join("\r\n");
  const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    ),
    link = document.createElement("a");
  link.href = url;
  link.download = `verity-exam-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Monitoring report downloaded.", "ok");
}
if (page === "dashboard") {
  $("#grid").innerHTML = '<div class="skel"></div><div class="skel"></div>';
  $("#liveGrid").innerHTML = '<div class="skel"></div>';
  $("#stats").innerHTML =
    '<div class="skel col-span-full" role="status" aria-label="Loading candidates…"></div>';
  $("#selectedPanel").innerHTML = '<div class="skel"></div>';
  setTimeout(refresh, 100);
  $("#search").oninput = (e) => {
    f.q = e.target.value.toLowerCase();
    renderGrid();
  };
  $("#statusF").onchange = (e) => {
    f.status = e.target.value;
    renderGrid();
  };
  $("#export").onclick = exportReport;
  $("#pause").onclick = (e) => {
    livePaused = !livePaused;
    e.target.setAttribute("aria-pressed", livePaused);
    e.target.textContent = livePaused
      ? "Resume live updates"
      : "Pause live updates";
    if (!livePaused) refresh();
  };
  let handledCameraRequestId = null;
  liveSessions.subscribe((sessions) => {
    if (!livePaused) refresh();
    processWatchAnswer(sessions);
    const request = sessions[selectedSessionId]?.cameraRequest;
    if (
      request?.state === "Accepted" &&
      request.id !== handledCameraRequestId &&
      sessions[selectedSessionId]?.videoShareConsent
    ) {
      handledCameraRequestId = request.id;
      void startWatching(selectedSessionId);
    }
  });
  setInterval(() => {
    if (!livePaused) refresh();
  }, 3000);
  $("#liveGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-select-session]");
    if (!button) return;
    if (button.dataset.selectSession !== selectedSessionId) stopWatching();
    selectedSessionId = button.dataset.selectSession;
    refresh();
  });
  $("#selectedPanel").addEventListener("submit", saveSignalReview);
  $("#createTestForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = $("#testName").value.trim(),
      minutes = Number($("#testDuration").value),
      message = $("#createdTest");
    if (!name || !Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      message.textContent =
        "Enter a test name and a duration from 1 to 240 minutes.";
      message.className = "err mt-3";
      return;
    }
    const test = examCatalog.create(name, minutes);
    if (!test) {
      message.textContent =
        "The test could not be created. Check browser storage and try again.";
      message.className = "err mt-3";
      return;
    }
    message.innerHTML = `Created <strong>${escapeHTML(test.name)}</strong> · ${minutes} minutes. Share test ID <code>${escapeHTML(test.id)}</code> with candidates.`;
    message.className = "mut text-sm mt-3";
    $("#testName").value = "";
  });
  $("#selectedPanel").addEventListener("click", (event) => {
    acknowledgeHelp(event);
    const action = event.target.closest("[data-session-action]");
    if (action) {
      performSessionAction(
        action.dataset.sessionId,
        action.dataset.sessionAction,
      );
      return;
    }
    const button = event.target.closest("[data-watch-session]");
    if (button) {
      if (watchPeer && watchSessionId === button.dataset.watchSession)
        stopWatching();
      else void startWatching(button.dataset.watchSession);
      refresh();
    }
  });
}
function performSessionAction(sessionId, action) {
  const session = liveSessions.read()[sessionId];
  if (!session) {
    toast("This candidate session is no longer available.", "warn");
    return;
  }
  if (action === "request-camera") {
    if (
      session.status !== "In exam" ||
      Date.now() - session.updatedAt >= 20000
    ) {
      toast(
        "Camera requests are available while the candidate is connected to an exam.",
        "warn",
      );
      return;
    }
    const cameraRequest = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      state: "Pending",
      requestedAt: now(),
    };
    if (!liveSessions.update(sessionId, { cameraRequest })) {
      toast("The camera request could not be sent.", "bad");
      return;
    }
    toast("Camera request sent to the candidate.", "ok");
    return;
  }
  if (action === "add-time") {
    if (
      session.status !== "In exam" ||
      Date.now() - session.updatedAt >= 20000
    ) {
      toast(
        "Time can be added while the candidate is connected to an exam.",
        "warn",
      );
      return;
    }
    const timeGrantedSeconds =
      (Number.isInteger(session.timeGrantedSeconds)
        ? session.timeGrantedSeconds
        : 0) + 25;
    if (!liveSessions.update(sessionId, { timeGrantedSeconds })) {
      toast("The time extension could not be shared.", "bad");
      return;
    }
    toast("Added 25 seconds to the candidate timer.", "ok");
    return;
  }
  if (action === "disqualify") {
    if (["Completed", "Disqualified"].includes(session.status)) {
      toast("This candidate can no longer be disqualified.", "warn");
      return;
    }
    if (!confirm(`Disqualify ${session.name} from this exam?`)) return;
    if (
      !liveSessions.update(sessionId, {
        status: "Disqualified",
        disqualifiedAt: Date.now(),
        disqualificationReason: "Examiner decision",
      })
    ) {
      toast("The candidate could not be disqualified.", "bad");
      return;
    }
    toast(`${session.name} was disqualified.`, "warn");
  }
}
function saveSignalReview(event) {
  const form = event.target.closest("[data-review-form]");
  if (!form) return;
  event.preventDefault();
  const button = event.submitter,
    status = button?.dataset.reviewStatus;
  if (!["Reviewed", "Dismissed as false positive"].includes(status)) {
    toast("Choose a review action before saving.", "bad");
    return;
  }
  const sessionId = form.dataset.reviewSession,
    index = Number(form.dataset.eventIndex),
    session = liveSessions.read()[sessionId];
  if (!session || !Number.isInteger(index) || index < 0) {
    toast(
      "This signal is no longer available. Refresh the session and try again.",
      "bad",
    );
    return;
  }
  const events = eventList(session),
    target = events[index];
  if (!target) {
    toast(
      "This signal is no longer available. Refresh the session and try again.",
      "bad",
    );
    return;
  }
  const note = $("[data-event-note]", form).value.trim();
  if (!note) {
    $("[data-event-note]", form).focus();
    toast("Add a short note before saving.", "warn");
    return;
  }
  target.reviewStatus = status;
  target.note = note;
  if (!liveSessions.update(sessionId, { events })) {
    toast("The review could not be saved in this browser.", "bad");
    return;
  }
  toast("Signal review saved.", "ok");
}
function acknowledgeHelp(event) {
  const button = event.target.closest("[data-ack-help]");
  if (!button) return;
  const sessionId = button.dataset.ackHelp,
    session = liveSessions.read()[sessionId],
    help = session?.helpRequest;
  if (!help || !help.message) {
    toast("This help request is no longer available.", "warn");
    return;
  }
  if (
    !liveSessions.update(sessionId, {
      helpRequest: {
        ...help,
        status: "Answered",
        response: "Your examiner has seen your request.",
      },
    })
  ) {
    toast("The response could not be shared in this browser.", "bad");
    return;
  }
  toast("Marked as seen.", "ok");
}
if (
  page === "candidate" &&
  new URLSearchParams(location.search).has("session")
) {
  const sessionId = new URLSearchParams(location.search).get("session");
  document.addEventListener("submit", saveSignalReview);
  document.addEventListener("click", acknowledgeHelp);
  let liveDetailSignature = null;
  function renderLiveDetail() {
    const c = liveSessions.read()[sessionId];
    if (!c) {
      $("#detail").innerHTML =
        '<div class="card"><p class="font-bold">Live session not found in this browser.</p><a class="btn btn-p mt-3" href="dashboard.html">Back to examiner dashboard</a></div>';
      return;
    }
    $("#title").textContent = c.name;
    document.title = c.name + " – Live examiner session";
    const draftNotes = new Map(
      $$("[data-event-note]", $("#detail")).map((field) => [
        field.dataset.eventNote,
        field.value,
      ]),
    );
    const focusId = $("#detail").contains(document.activeElement)
      ? document.activeElement.dataset.eventNote
      : null;
    const selection = focusId
      ? {
          start: document.activeElement.selectionStart,
          end: document.activeElement.selectionEnd,
        }
      : null;
    const fresh = Date.now() - (c.updatedAt || 0) < 20000,
      sessionState = ["Completed", "Disqualified", "Left"].includes(c.status)
        ? c.status
        : !fresh && c.status === "In exam"
          ? "Left"
          : fresh
            ? c.status
            : "No recent update",
      events = eventList(c);
    const signature = JSON.stringify({
      name: c.name,
      exam: c.exam,
      sessionState,
      connection: c.connection,
      camera: c.camera,
      ai: c.ai,
      faceCount: c.faceCount,
      question: c.question,
      total: c.total,
      answered: c.answered,
      events,
      helpRequest: c.helpRequest,
      videoShareConsent: c.videoShareConsent,
      videoWatch: c.videoWatch,
    });
    if (signature === liveDetailSignature) return;
    liveDetailSignature = signature;
    $("#detail").innerHTML =
      `<div class="grid lg:grid-cols-3 gap-6"><div class="space-y-4">
${renderWatchPanel(c)}
<div class="card"><h2 class="font-bold mb-2">Exam details</h2><dl class="space-y-2 text-sm">
<div class="flex justify-between gap-2"><dt class="mut">Candidate</dt><dd class="font-bold">${escapeHTML(c.name)}</dd></div>
<div class="flex justify-between gap-2"><dt class="mut">Exam</dt><dd>${escapeHTML(c.exam)}</dd></div>
<div class="flex justify-between gap-2"><dt class="mut">Session</dt><dd>${escapeHTML(sessionState)}</dd></div>
<div class="flex justify-between gap-2"><dt class="mut">Internet</dt><dd>${escapeHTML(c.connection || "Checking")}</dd></div>
<div class="flex justify-between gap-2"><dt class="mut">Camera</dt><dd>${c.camera ? (c.videoShareConsent ? "On · sharing allowed" : "On · private") : "Off"}</dd></div>
<div class="flex justify-between gap-2"><dt class="mut">Face check</dt><dd>${c.ai ? "Running" : "Off"}</dd></div>
<div class="flex justify-between gap-2"><dt class="mut">Faces seen</dt><dd>${Number.isInteger(c.faceCount) ? c.faceCount : "—"}</dd></div>
<div class="flex justify-between gap-2"><dt class="mut">Question</dt><dd>${Number(c.question) || 0}/${Number(c.total) || 0}</dd></div></dl></div>
<div class="card"><h2 class="font-bold">Candidate scores</h2>${profileScores(c.total ? (100 * (Number(c.answered) || 0)) / Number(c.total) : 0, monitoringScore(events), 52)}<p class="mut text-xs mt-2">Monitor score: 100 start; LOW -3, MEDIUM -10, HIGH -25. Dismissed false positives do not count. Not a grade or proof of misconduct.</p></div></div>
<section class="card lg:col-span-2" aria-labelledby="h-t"><h2 id="h-t" class="text-xl font-bold">Exam updates</h2>
<p class="mut text-sm mb-4">These alerts are suggestions to check. They are not proof that a rule was broken.</p>
${events.length ? timelineHTML(events) : '<p class="mut">No alerts yet.</p>'}
<p class="mut text-xs mt-4">This demo shares details between tabs in this browser only. Live video needs the candidate’s consent and is not sent to a server.</p></section></div>`;
    $("#detail").insertAdjacentHTML(
      "beforeend",
      `${renderHelpRequest(c)}${renderSignals(c)}`,
    );
    attachWatchVideo();
    draftNotes.forEach((value, id) => {
      const field = $$("[data-event-note]", $("#detail")).find(
        (note) => note.dataset.eventNote === id,
      );
      if (field) field.value = value;
    });
    if (focusId) {
      const field = $$("[data-event-note]", $("#detail")).find(
        (note) => note.dataset.eventNote === focusId,
      );
      if (field) {
        field.focus();
        field.setSelectionRange(selection.start, selection.end);
      }
    }
  }
  refreshCandidateDetails = renderLiveDetail;
  renderLiveDetail();
  liveSessions.subscribe((sessions) => {
    renderLiveDetail();
    processWatchAnswer(sessions);
  });
  setInterval(renderLiveDetail, 3000);
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-watch-session]");
    if (!button) return;
    if (watchPeer && watchSessionId === button.dataset.watchSession)
      stopWatching();
    else void startWatching(button.dataset.watchSession);
    renderLiveDetail();
  });
} else if (
  page === "candidate" &&
  new URLSearchParams(location.search).has("id")
) {
  const c = candidates.find(
    (x) => x.id == new URLSearchParams(location.search).get("id"),
  );
  setTimeout(() => {
    if (!c) {
      $("#detail").innerHTML =
        '<div class="card text-center"><p class="font-bold">Candidate not found</p><a class="btn btn-p mt-3" href="dashboard.html">Back to dashboard</a></div>';
      return;
    }
    $("#title").textContent = `${c.name} · Sample record`;
    document.title = c.name + " – Sample record";
    $("#detail").innerHTML =
      `<div class="grid lg:grid-cols-3 gap-6"><div class="space-y-4"><div class="cam"><div class="camfb">${c.cam ? "Camera preview (simulated)" : "No camera signal"}</div></div>
<div class="card"><h2 class="font-bold">Candidate scores</h2>${profileScores((100 * c.q) / c.total, c.score, 52, "Question position")}<p class="mut text-xs mt-2">Both scores are sample values. The monitoring score is not generated by live AI.</p></div>
<div class="card"><h2 class="font-bold mb-2">Candidate</h2><dl class="space-y-1 text-sm"><div class="flex justify-between"><dt class="mut">Status</dt><dd>${badge(...ST[c.status])}</dd></div><div class="flex justify-between"><dt class="mut">Current question</dt><dd class="font-bold">${c.q}/${c.total}</dd></div>
<div class="flex justify-between"><dt class="mut">Camera</dt><dd>${c.cam ? badge("warn", "Simulated") : badge("off", "No signal")}</dd></div>
<div class="flex justify-between"><dt class="mut">Microphone</dt><dd>${badge("off", "Not used")}</dd></div>
<div class="flex justify-between"><dt class="mut">Connection</dt><dd>${badge("off", `Sample: ${c.conn}`)}</dd></div></dl></div>
<div class="card"><strong>Sample record</strong><p class="mut text-sm mt-1">This record is illustrative. No candidate is connected, and no examiner action is sent.</p></div></div>
<section class="card lg:col-span-2" aria-labelledby="h-t"><h2 id="h-t" class="text-xl font-bold">Sample activity timeline</h2><p class="mut text-sm mb-4">Illustrative events only. They were not detected during a real exam.</p>${timelineHTML(c.events)}</section></div>`;
  }, 700);
} else if (page === "candidate") {
  $("#detail").innerHTML =
    '<div class="card"><h2 class="font-bold">Choose a candidate record</h2><p class="mut mt-2">Open a live session or sample record from the examiner dashboard.</p><a class="btn btn-p mt-3" href="dashboard.html">Open examiner dashboard</a></div>';
}
