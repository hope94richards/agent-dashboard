export const data = {
  projects: ["All", "Alurts", "Cordial", "Erros", "Ops"],
  tasks: [
    { id: "t1", title: "Define provider-agnostic data model", project: "Alurts", status: "todo", date: "Feb 2, 2026", priority: 0, description: "Draft the canonical schema that all providers map into, including session-based snapshots and change rules." },
    { id: "t2", title: "Draft Databento ingestion spec", project: "Alurts", status: "in_progress", date: "Feb 2, 2026", priority: 1, description: "Write the adapter contract and map Databento feeds to the canonical schema." },
    { id: "t3", title: "Scaffold alert engine service", project: "Alurts", status: "done", date: "Feb 2, 2026", priority: 2, description: "Create the skeleton service with config loading, rule evaluation, and delivery stub." },
    { id: "t4", title: "Design push notification plan", project: "Alurts", status: "todo", date: "Feb 2, 2026", priority: 2, description: "Outline the push delivery strategy, retries, and channel fallbacks." },
    { id: "t5", title: "Build dashboard UI shell", project: "Ops", status: "in_progress", date: "Feb 2, 2026", priority: 1, description: "Complete the base dashboard UI styling and layout." },
    { id: "t6", title: "Archive old SMS alert flow", project: "Alurts", status: "archived", date: "Feb 1, 2026", priority: 5, description: "Deprecate the legacy SMS flow and remove unused configs." }
  ],
  deliverables: [
    { title: "Alurts Architecture Doc", date: "Feb 2, 2026", type: "Doc" },
    { title: "Alert Engine Spec", date: "Feb 3, 2026", type: "Spec" },
    { title: "MVP Roadmap", date: "Feb 4, 2026", type: "Plan" }
  ],
  actionLog: [
    { time: "5:05 PM", text: "Initialized agent-dashboard repo" },
    { time: "5:10 PM", text: "Added project tags + filters" },
    { time: "5:12 PM", text: "Started UI scaffold" }
  ]
};

export const columns = ["todo", "blocked", "in_progress", "done", "archived"] as const;
export const labels: Record<(typeof columns)[number], string> = {
  todo: "To Do",
  blocked: "Blocked",
  in_progress: "In Progress",
  done: "Done",
  archived: "Archived"
};
