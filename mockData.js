// Sample-only examiner records. They are not connected to live candidate sessions.
const candidates = [
  {
    id: 1,
    name: "Rahul Sharma",
    status: "Monitoring",
    score: 96,
    q: 14,
    total: 30,
    conn: "Stable",
    cam: true,
    events: [
      ["10:31:02", "Face check passed", "LOW"],
      ["10:32:18", "Candidate looked away", "LOW"],
      ["10:35:41", "Normal activity", "LOW"],
      ["10:37:02", "Browser focus changed", "MEDIUM"],
    ],
  },
  {
    id: 2,
    name: "Ananya Singh",
    status: "Alert",
    score: 74,
    q: 9,
    total: 30,
    conn: "Stable",
    cam: true,
    events: [
      ["10:30:44", "Face check passed", "LOW"],
      ["10:33:10", "Multiple faces detected", "HIGH"],
      ["10:34:02", "Connection interruption", "MEDIUM"],
      ["10:36:25", "Candidate looked away", "LOW"],
    ],
  },
  {
    id: 3,
    name: "Arjun Mehta",
    status: "Monitoring",
    score: 91,
    q: 22,
    total: 30,
    conn: "Weak",
    cam: true,
    events: [
      ["10:29:58", "Face check passed", "LOW"],
      ["10:33:47", "Connection interruption", "MEDIUM"],
      ["10:34:20", "Normal activity", "LOW"],
    ],
  },
  {
    id: 4,
    name: "Priya Verma",
    status: "Monitoring",
    score: 99,
    q: 18,
    total: 30,
    conn: "Stable",
    cam: true,
    events: [
      ["10:30:10", "Face check passed", "LOW"],
      ["10:36:00", "Normal activity", "LOW"],
    ],
  },
  {
    id: 5,
    name: "Rohan Gupta",
    status: "Offline",
    score: 62,
    q: 6,
    total: 30,
    conn: "Lost",
    cam: false,
    events: [
      ["10:29:50", "Face check passed", "LOW"],
      ["10:35:12", "Face not detected", "HIGH"],
      ["10:35:40", "Connection interruption", "HIGH"],
    ],
  },
];
const questions = [
  {
    q: "What is the main purpose of this AI Proctoring System?",
    o: [
      "To conduct and monitor online exams",
      "To develop websites",
      "To manage databases",
      "To create presentations",
    ],
  },
  {
    q: "Which device is used to monitor the candidate visually?",
    o: ["Keyboard", "Webcam", "Printer", "Scanner"],
  },
  {
    q: "Does this demo request microphone access?",
    o: [
      "Yes, continuously",
      "Only when a warning appears",
      "No, the demo does not use the microphone",
      "Only when the exam is submitted",
    ],
  },
  {
    q: "What should happen if a candidate switches tabs during an exam?",
    o: [
      "The computer should shut down",
      "The system may log a warning",
      "The exam questions should disappear permanently",
      "The browser should uninstall itself",
    ],
  },
  {
    q: "What is the role of AI in the proctoring system?",
    o: [
      "To replace the operating system",
      "To automatically write exam answers",
      "To help detect potentially suspicious activity",
      "To increase screen brightness",
    ],
  },
  {
    q: "What should the system do if the webcam is unavailable?",
    o: [
      "Ignore the issue completely",
      "Notify the candidate and apply exam rules",
      "Delete the candidate account",
      "Automatically submit the exam",
    ],
  },
  {
    q: "Why is a countdown timer useful during an online exam?",
    o: [
      "It tracks the remaining exam time",
      "It detects internet speed",
      "It identifies the candidate",
      "It controls microphone volume",
    ],
  },
  {
    q: "What is the purpose of an activity log in the system?",
    o: [
      "To store website themes",
      "To increase CPU performance",
      "To track exam-related events and warnings",
      "To save unrelated browsing history",
    ],
  },
  {
    q: "How should the system handle a possible AI-detected violation?",
    o: [
      "Automatically declare the candidate guilty",
      "Ignore every detection",
      "Delete the exam immediately",
      "Flag the event for review",
    ],
  },
  {
    q: "Why is candidate data privacy important?",
    o: [
      "It makes exams longer",
      "It protects sensitive information",
      "It disables authentication",
      "It removes all exam rules",
    ],
  },
];
