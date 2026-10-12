// Shared helpers used by every page.
const $ = (s, r = document) => r.querySelector(s),
  $$ = (s, r = document) => [...r.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toLocaleTimeString("en-GB");
const ST = {
  Monitoring: ["ok", "● Monitoring"],
  Alert: ["warn", "▲ Alert"],
  Offline: ["bad", "✕ Offline"],
};
const SEV = {
  LOW: ["off", "● Low"],
  MEDIUM: ["warn", "▲ Medium"],
  HIGH: ["bad", "■ High"],
};
const badge = (t, txt) => `<span class="badge ${t}">${txt}</span>`;
const sevBadge = (s) => badge(...SEV[s]);
const tone = (s) =>
  s >= 90
    ? { c: "ok", label: "Strong sample" }
    : s >= 75
      ? { c: "warn", label: "Review sample" }
      : { c: "bad", label: "Weak sample" };
const examCatalog = (() => {
  const key = "verity-exam-catalog-v1",
    defaultExam = {
      id: "EX-2026",
      name: "Fundamentals of Computing",
      durationSeconds: 30 * 60,
    };
  function read() {
    let stored = [];
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(value))
        stored = value.filter(
          (exam) =>
            exam &&
            typeof exam.id === "string" &&
            typeof exam.name === "string" &&
            Number.isInteger(exam.durationSeconds) &&
            exam.durationSeconds > 0,
        );
    } catch (error) {
      toast(`Tests could not be loaded: ${error.message}`, "bad");
    }
    return [
      defaultExam,
      ...stored.filter((exam) => exam.id.toUpperCase() !== defaultExam.id),
    ];
  }
  function find(id) {
    return (
      read().find(
        (exam) =>
          exam.id.toUpperCase() ===
          String(id || "")
            .trim()
            .toUpperCase(),
      ) || null
    );
  }
  function create(name, minutes) {
    const exams = read(),
      normalizedName = String(name || "").trim(),
      durationSeconds = Math.round(Number(minutes) * 60);
    if (
      !normalizedName ||
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 60 ||
      durationSeconds > 4 * 60 * 60
    )
      return null;
    let id;
    do {
      id = `EX-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    } while (exams.some((exam) => exam.id === id));
    const exam = { id, name: normalizedName, durationSeconds };
    try {
      localStorage.setItem(
        key,
        JSON.stringify([
          ...exams.filter((existing) => existing.id !== defaultExam.id),
          exam,
        ]),
      );
      return exam;
    } catch (error) {
      toast(`Test could not be saved: ${error.message}`, "bad");
      return null;
    }
  }
  return { read, find, create };
})();
function ring(s, size = 72, label = "Sample score", color = tone(s).c) {
  const score = Math.max(0, Math.min(100, Math.round(Number(s) || 0))),
    r = 28,
    c = 2 * Math.PI * r;
  return `<div class="ringw" style="width:${size}px;height:${size}px" role="img" aria-label="${escapeHTML(label)} ${score} percent"><svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--line)" stroke-width="6"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--${color})" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(c * score) / 100} ${c}" transform="rotate(-90 32 32)"/></svg><span class="ringn" style="font-size:${size / 4}px">${score}</span></div>`;
}
function timelineHTML(list) {
  return `<ol class="rail">${list
    .map((event) => {
      const [t, l, s] = Array.isArray(event)
        ? event
        : [event.at, event.label, event.severity];
      return `<li class="s-${SEV[s] ? s : "LOW"}"><time class="mono mut text-sm">${escapeHTML(t)}</time> <span class="font-bold">${escapeHTML(l)}</span> ${SEV[s] ? sevBadge(s) : badge("off", "Unrated")}</li>`;
    })
    .join("")}</ol>`;
}
function toast(msg, t = "ok") {
  let b = $("#toasts");
  if (!b) {
    b = document.createElement("div");
    b.id = "toasts";
    b.setAttribute("role", "status");
    document.body.append(b);
  }
  const e = document.createElement("div");
  e.className = "toast " + t;
  e.textContent = msg;
  b.append(e);
  setTimeout(() => e.remove(), 4500);
}
// Theme + generic toggles
try {
  if (localStorage.getItem("theme") === "dark")
    document.documentElement.classList.add("dark");
} catch {}
function syncThemeButtons() {
  const dark = document.documentElement.classList.contains("dark");
  $$("[data-theme-toggle]").forEach((b) =>
    b.setAttribute("aria-pressed", dark),
  );
}
syncThemeButtons();
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-theme-toggle]");
  if (t) {
    const d = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", d ? "dark" : "light");
    } catch {}
    syncThemeButtons();
  }
  const m = e.target.closest("[data-toggle]");
  if (m) {
    const el = document.getElementById(m.dataset.toggle);
    el.classList.toggle("hidden");
    m.setAttribute("aria-expanded", !el.classList.contains("hidden"));
  }
  if (e.target.closest("#menu a")) {
    $("#menu").classList.add("hidden");
    $('[data-toggle="menu"]')?.setAttribute("aria-expanded", "false");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const menu = $("#menu");
    if (menu && !menu.classList.contains("hidden")) {
      menu.classList.add("hidden");
      $('[data-toggle="menu"]')?.setAttribute("aria-expanded", "false");
    }
  }
});

// Same-origin tabs can share live exam status without uploading candidate video.
const liveSessions = (() => {
  const key = "verity-live-sessions-v1",
    channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(key),
    listeners = new Set();
  function read() {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "{}");
      return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};
    } catch (error) {
      toast(`Live sessions could not be read: ${error.message}`, "bad");
      return {};
    }
  }
  function notify() {
    const sessions = read();
    listeners.forEach((listener) => listener(sessions));
  }
  function update(id, patch) {
    try {
      const sessions = read(),
        old = sessions[id] || {};
      sessions[id] = { ...old, ...patch, sessionId: id, updatedAt: Date.now() };
      const entries = Object.entries(sessions)
        .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
        .slice(0, 100);
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
      channel?.postMessage("updated");
      notify();
      return sessions[id];
    } catch (error) {
      toast(`Live session could not be shared: ${error.message}`, "bad");
      return null;
    }
  }
  function subscribe(listener) {
    listeners.add(listener);
    listener(read());
    const onStorage = (event) => {
      if (event.key === key) listener(read());
    };
    const onMessage = () => listener(read());
    addEventListener("storage", onStorage);
    channel?.addEventListener("message", onMessage);
    return () => {
      listeners.delete(listener);
      removeEventListener("storage", onStorage);
      channel?.removeEventListener("message", onMessage);
    };
  }
  return { read, update, subscribe };
})();
function eventData(event, index) {
  if (Array.isArray(event))
    return {
      id: `legacy-${index}`,
      at: event[0],
      label: event[1],
      severity: event[2],
      reviewStatus: "Open",
      note: "",
    };
  return {
    id: String(event.id || `legacy-${index}`),
    at: String(event.at || ""),
    label: String(event.label || ""),
    severity: SEV[event.severity] ? event.severity : "LOW",
    reviewStatus: ["Open", "Reviewed", "Dismissed as false positive"].includes(
      event.reviewStatus,
    )
      ? event.reviewStatus
      : "Open",
    note: String(event.note || ""),
  };
}
function eventList(session) {
  return (Array.isArray(session.events) ? session.events : []).map(eventData);
}
function monitoringScore(events) {
  const deductions = { LOW: 3, MEDIUM: 10, HIGH: 25 };
  return Math.max(
    0,
    100 -
      events.reduce(
        (total, event) =>
          total +
          (event.reviewStatus === "Dismissed as false positive"
            ? 0
            : deductions[event.severity] || 0),
        0,
      ),
  );
}
function getLiveCandidates() {
  const cutoff = Date.now() - 8 * 60 * 60 * 1000;
  return Object.values(liveSessions.read())
    .filter(
      (candidate) =>
        candidate &&
        typeof candidate.sessionId === "string" &&
        typeof candidate.name === "string" &&
        typeof candidate.updatedAt === "number" &&
        candidate.updatedAt > cutoff,
    )
    .map((candidate) => {
      const events = eventList(candidate),
        connected = Date.now() - candidate.updatedAt < 20000;
      const status = ["Completed", "Disqualified", "Left"].includes(
        candidate.status,
      )
        ? candidate.status
        : !connected && candidate.status === "In exam"
          ? "Left"
          : !connected || candidate.status === "Disconnected"
            ? "Offline"
            : candidate.status === "Readiness"
              ? "Readiness"
              : events.some(
                    (event) =>
                      event.severity === "HIGH" &&
                      event.reviewStatus === "Open",
                  )
                ? "Alert"
                : "Monitoring";
      return {
        ...candidate,
        connected,
        sessionStatus: candidate.status,
        events,
        status,
        conn: candidate.connection || "Checking",
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
