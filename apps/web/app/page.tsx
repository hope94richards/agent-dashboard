"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { columns, labels } from "./data";
import { connectOpenClaw } from "./opclaw-ws";
import demoData from "./demo-data.json";

function Avatar({ status }: { status: "idle" | "thinking" | "working" | "error" | "unknown" | "reading" | "replied" }) {
  const state = status === "unknown" ? "idle" : status === "thinking" ? "working" : status === "error" ? "idle" : status;
  return (
    <div className={`avatar avatar-${state}`}>
      <div className="avatar-ring" />
      <div className="avatar-face">🤖</div>
      <div className="avatar-shine" />
    </div>
  );
}

export default function Home() {
  const [project, setProject] = useState("All");
  const [gatewayUrl, setGatewayUrl] = useState("http://127.0.0.1:18789");
  const [token, setToken] = useState("");
  const [sessionKey, setSessionKey] = useState("agent:main:main");
  const [tasks, setTasks] = useState<{ id: string; title: string; project: string; status: string; date?: string | null; priority?: number | null; description?: string | null; updated_at?: string | null }[]>([]);
  const [deliverables, setDeliverables] = useState<{ id: string; title: string; type?: string | null; date?: string | null; updated_at?: string | null }[]>([]);
  const [schedules, setSchedules] = useState<{ id: string; title: string; project?: string | null; run_at?: string | null }[]>([]);
  const [selectedTask, setSelectedTask] = useState<null | { id: string; title: string; project: string; status: string; date?: string | null; priority?: number | null; description?: string | null; updated_at?: string | null }>(null);
  const [logTab, setLogTab] = useState<"actions" | "system" | "status">("actions");
  const [showDebugTabs, setShowDebugTabs] = useState(false);
  const [actionLog, setActionLog] = useState<{ time: string; text: string }[]>([]);
  const [systemLog, setSystemLog] = useState<{ time: string; text: string }[]>([]);
  const [statusLog, setStatusLog] = useState<{ time: string; text: string }[]>([]);
  const [actionLimit, setActionLimit] = useState(50);
  const [systemLimit, setSystemLimit] = useState(50);
  const [statusLimit, setStatusLimit] = useState(50);
  const lastEventRef = useRef<{ text: string; ts: number } | null>(null);
  const lastEventEpochRef = useRef<number | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [agentStatus, setAgentStatus] = useState<"idle" | "thinking" | "working" | "error" | "unknown" | "reading" | "replied">("unknown");
  const lastActivityRef = useRef<number>(0);
  const lastInboundRef = useRef<number>(0);
  const runActiveRef = useRef<boolean>(false);
  const lastStatusRef = useRef<{ status: string; at: number } | null>(null);
  const inboundTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const awaitingReplyRef = useRef<boolean>(false);
  const [pairingRequired, setPairingRequired] = useState<null | { requestId?: string }>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [lastEventName, setLastEventName] = useState<string | null>(null);
  const [lastWsEventAt, setLastWsEventAt] = useState<string | null>(null);
  const demoBackupRef = useRef<null | {
    tasks: typeof tasks;
    deliverables: typeof deliverables;
    schedules: typeof schedules;
    actionLog: typeof actionLog;
    systemLog: typeof systemLog;
    statusLog: typeof statusLog;
    connected: boolean;
    agentStatus: typeof agentStatus;
    lastWsEventAt: string | null;
    lastError: string | null;
    pairingRequired: null | { requestId?: string };
  }>(null);
  const lastEventNameRef = useRef<string | null>(null);
  const disconnectRef = useRef<null | (() => void)>(null);
  const STORAGE_KEY = "opclaw.connect.v1";

  const tasksByColumn = useMemo(() => {
    return columns.reduce((acc, col) => {
      const filtered = tasks.filter(
        (t) => t.status === col && (project === "All" || t.project === project)
      );
      filtered.sort((a, b) => {
        const aPriority = a.priority ?? 9999;
        const bPriority = b.priority ?? 9999;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
      });
      acc[col] = filtered;
      return acc;
    }, {} as Record<(typeof columns)[number], typeof tasks>);
  }, [project, tasks]);

  const projectOptions = useMemo(() => {
    const set = new Set<string>();
    tasks.forEach((t) => {
      if (t.project) set.add(t.project);
    });
    return ["All", ...Array.from(set).sort()];
  }, [tasks]);

  const skeletonTasks = [0, 1];
  const skeletonDeliverables = [0, 1, 2, 3, 4];
  const showSkeletons = !connected;
  const showDemoToggle = demoMode || tasks.length === 0;
  const API_BASE = typeof window !== "undefined" ? `${window.location.pathname.replace(/\/$/, "")}/api` : "/agent/api";

  function formatActionEvent(evt: any) {
    const type = evt.type || "event";
    const payload = evt.payload ? (typeof evt.payload === "string" ? JSON.parse(evt.payload) : evt.payload) : null;
    const title = payload?.title || payload?.body || payload?.name || "";
    const actor = evt.actor || payload?.actor;
    const prefix = actor ? `${actor} • ` : "";
    switch (type) {
      case "task.created":
        return `${prefix}Created task${title ? `: ${title}` : ""}`;
      case "task.updated":
        return `${prefix}Updated task${title ? `: ${title}` : ""}`;
      case "task.deleted":
        return `${prefix}Deleted task${title ? `: ${title}` : ""}`;
      case "deliverable.created":
        return `${prefix}Created deliverable${title ? `: ${title}` : ""}`;
      case "deliverable.updated":
        return `${prefix}Updated deliverable${title ? `: ${title}` : ""}`;
      case "deliverable.deleted":
        return `${prefix}Deleted deliverable${title ? `: ${title}` : ""}`;
      case "note.created":
        return `${prefix}${title || "Note added"}`;
      case "note.updated":
        return `${prefix}Updated note${title ? `: ${title}` : ""}`;
      case "note.deleted":
        return `${prefix}Deleted note${title ? `: ${title}` : ""}`;
      default:
        return `${prefix}${type}`;
    }
  }

  function markActivity(next: "reading" | "thinking" | "working" | "replied", ttlMs = 6000) {
    const now = Date.now();
    const last = lastStatusRef.current;
    if (last && last.status === next && now - last.at < 1500) {
      return;
    }
    lastStatusRef.current = { status: next, at: now };
    lastActivityRef.current = now;
    setAgentStatus(next);
    const source = lastEventNameRef.current ? ` (${lastEventNameRef.current})` : "";
    setStatusLog((prev) => [{ time: new Date().toLocaleTimeString(), text: `${next}${source}` }, ...prev].slice(0, 50));
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => {
      const idleFor = Date.now() - lastActivityRef.current;
      if (!runActiveRef.current && idleFor >= ttlMs) {
        setAgentStatus("idle");
        const source = lastEventNameRef.current ? ` (${lastEventNameRef.current})` : "";
        setStatusLog((prev) => [{ time: new Date().toLocaleTimeString(), text: `idle${source}` }, ...prev].slice(0, 50));
      }
    }, ttlMs);
  }

  function isInboundEvent(evt: any, name: string) {
    const n = (name || "").toLowerCase();
    if (/(message|inbound|dm|telegram|whatsapp|signal|imessage)/.test(n)) return true;
    const d = evt?.data || evt?.payload || {};
    const dStr = JSON.stringify(d || {}).toLowerCase();
    return /(message|inbound|dm|telegram|whatsapp|signal|imessage)/.test(dStr);
  }

  function clearInboundTimeouts() {
    inboundTimeoutsRef.current.forEach((t) => clearTimeout(t));
    inboundTimeoutsRef.current = [];
  }

  function markInbound() {
    const now = Date.now();
    lastInboundRef.current = now;
    runActiveRef.current = true;
    awaitingReplyRef.current = true;
    clearInboundTimeouts();
    markActivity("reading", 3000);
    inboundTimeoutsRef.current.push(setTimeout(() => markActivity("working", 8000), 3000));
  }

  function fmtDate(value?: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value.toString();
    return d.toLocaleString();
  }

  function fmtPriority(value?: number | null) {
    if (value === null || value === undefined) return "p?";
    return `p${value}`;
  }

  function fmtRelative(value?: string | null) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = d.getTime() - Date.now();
    const abs = Math.abs(diffMs);
    const mins = Math.round(abs / 60000);
    if (mins < 1) return diffMs >= 0 ? "in moments" : "just now";
    if (mins < 60) return diffMs >= 0 ? `in ${mins}m` : `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return diffMs >= 0 ? `in ${hours}h` : `${hours}h ago`;
    const days = Math.round(hours / 24);
    return diffMs >= 0 ? `in ${days}d` : `${days}d ago`;
  }

  function applyDemoData() {
    const data = demoData;
    setTasks(data.tasks);
    setDeliverables(data.deliverables);
    setSchedules(data.schedules);
    setActionLog(data.actionLog);
    setSystemLog(data.systemLog);
    setStatusLog(data.statusLog);
    setConnected(Boolean(data.connected));
    setAgentStatus(data.agentStatus as typeof agentStatus);
    setLastWsEventAt(data.lastWsEventAt || null);
    setLastError(null);
    setPairingRequired(null);
    lastEventNameRef.current = data.lastEventName || null;
    setLastEventName(data.lastEventName || null);
  }

  function toggleDemoMode() {
    if (!demoMode) {
      if (!demoBackupRef.current) {
        demoBackupRef.current = {
          tasks,
          deliverables,
          schedules,
          actionLog,
          systemLog,
          statusLog,
          connected,
          agentStatus,
          lastWsEventAt,
          lastError,
          pairingRequired,
        };
      }
      setDemoMode(true);
      applyDemoData();
      setShowConnect(false);
      return;
    }

    const backup = demoBackupRef.current;
    setDemoMode(false);
    if (backup) {
      setTasks(backup.tasks);
      setDeliverables(backup.deliverables);
      setSchedules(backup.schedules);
      setActionLog(backup.actionLog);
      setSystemLog(backup.systemLog);
      setStatusLog(backup.statusLog);
      setConnected(backup.connected);
      setAgentStatus(backup.agentStatus);
      setLastWsEventAt(backup.lastWsEventAt);
      setLastError(backup.lastError);
      setPairingRequired(backup.pairingRequired);
    } else {
      setTasks([]);
      setDeliverables([]);
      setSchedules([]);
      setActionLog([]);
      setSystemLog([]);
      setStatusLog([]);
      setConnected(false);
      setAgentStatus("unknown");
      setLastWsEventAt(null);
      setLastError(null);
      setPairingRequired(null);
    }
  }

  async function refreshData() {
    try {
      const [tRes, dRes, eRes, schedRes] = await Promise.all([
        fetch(`${API_BASE}/tasks`),
        fetch(`${API_BASE}/deliverables`),
        fetch(`${API_BASE}/events?limit=100`),
        fetch(`${API_BASE}/schedules`)
      ]);
      const [t, d, e, sched] = await Promise.all([
        tRes.json(),
        dRes.json(),
        eRes.json(),
        schedRes.json()
      ]);
      setTasks(t);
      setDeliverables(d);
      setSchedules(sched || []);
      setActionLog(
        (e || []).map((evt: any) => ({
          time: new Date(evt.ts).toLocaleTimeString(),
          text: formatActionEvent(evt)
        }))
      );
      // status overrides removed (auto-status only)
      if (e?.[0]?.ts) {
        const newest = new Date(e[0].ts).getTime();
        if (!lastEventEpochRef.current || newest > lastEventEpochRef.current) {
          lastEventEpochRef.current = newest;
          markActivity("working", 4000);
        }
      }
    } catch (err: any) {
      setLastError(err?.message || "Failed to load data");
    }
  }

  // Notes UI removed; use external messaging to communicate with agent.

  useEffect(() => {
    if (!connected || demoMode) return;
    refreshData();
    const t = setInterval(refreshData, 1000);
    return () => clearInterval(t);
  }, [connected, demoMode]);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.gatewayUrl) setGatewayUrl(saved.gatewayUrl);
      if (saved.token) setToken(saved.token);
      if (saved.sessionKey) setSessionKey(saved.sessionKey);
      if (saved.autoConnect) connect(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!pairingRequired || connected) return;
    const t = setInterval(() => connect(), 4000);
    return () => clearInterval(t);
  }, [pairingRequired, connected]);

  function connect(overrides?: { gatewayUrl?: string; token?: string; sessionKey?: string }) {
    const cfg = {
      gatewayUrl,
      token,
      sessionKey,
      ...(overrides || {})
    };
    if (overrides?.gatewayUrl) setGatewayUrl(overrides.gatewayUrl);
    if (overrides?.token) setToken(overrides.token);
    if (overrides?.sessionKey) setSessionKey(overrides.sessionKey);

    if (disconnectRef.current) disconnectRef.current();
    disconnectRef.current = connectOpenClaw(
      { gatewayUrl: cfg.gatewayUrl, token: cfg.token, sessionKey: cfg.sessionKey },
      (evt) => {
        if (evt?.type === "event") {
          const ts = new Date().toLocaleTimeString();
          setLastWsEventAt(ts);
          const text = `${evt.event}`;
          setLastEventName(text);
          lastEventNameRef.current = text;
          const now = Date.now();
          const last = lastEventRef.current;
          if (!last || last.text !== text || now - last.ts > 2000) {
            lastEventRef.current = { text, ts: now };
            setSystemLog((prev) => [{ time: ts, text }, ...prev].slice(0, 200));
          }
          if (text === "presence") {
            const state = evt?.data?.state || evt?.data?.presence?.state;
            if (state === "idle" || state === "thinking" || state === "working" || state === "error") {
              setAgentStatus(state);
            }
          } else if (!["health", "tick"].includes(text)) {
            if (text === "agent") {
              // agent output stream (typing)
              runActiveRef.current = true;
              if (!awaitingReplyRef.current && lastInboundRef.current === 0) {
                markInbound();
              }
              return;
            } else if (text === "chat") {
              const state = evt?.payload?.state || evt?.data?.state;
              if (state === "final") {
                clearInboundTimeouts();
                runActiveRef.current = false;
                lastInboundRef.current = 0;
                awaitingReplyRef.current = false;
                markActivity("replied", 4000);
              }
            } else {
              // ignore other events for status
            }
          }
        }
        if (evt?.type === "res" && evt?.ok === false) {
          const code = evt?.error?.code;
          const msg = evt?.error?.message || code || "UNKNOWN";
          if (code === "NOT_PAIRED") {
            setPairingRequired({ requestId: evt?.details?.requestId });
          }
          setLastError(msg);
          setConnected(false);
          setActionLog((prev) => [
            { time: new Date().toLocaleTimeString(), text: `Error: ${msg}` },
            ...prev,
          ]);
        }
        if (evt?.type === "res" && evt?.ok === true && evt?.payload?.type === "hello-ok") {
          const snapshot = evt?.payload?.snapshot;
          const presence = snapshot?.presence?.[0]?.state || snapshot?.presence?.state;
          if (presence === "idle" || presence === "thinking" || presence === "working" || presence === "error") {
            setAgentStatus(presence);
          }
        }
      },
      (status) => {
        const isConnected = status === "connected";
        setConnected(isConnected);
        if (isConnected) {
          setPairingRequired(null);
          setLastError(null);
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              gatewayUrl: cfg.gatewayUrl,
              token: cfg.token,
              sessionKey: cfg.sessionKey,
              autoConnect: true
            })
          );
        }
      },
      (err) => {
        setLastError(err);
        setConnected(false);
        setActionLog((prev) => [
          { time: new Date().toLocaleTimeString(), text: `Error: ${err}` },
          ...prev,
        ]);
      }
    );
    setShowConnect(false);
  }

  return (
    <div className="grid grid-cols-[260px_1fr_340px] min-h-screen">
      <aside className="bg-[#111317] p-6 border-r border-[#222]">
        <div className="mx-auto mb-4 flex justify-center">
          <Avatar status={agentStatus} />
        </div>
        <div className="flex items-center justify-center gap-2 text-muted">
          <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-400" : "bg-amber-400"} shadow-[0_0_8px_rgba(122,92,255,.6)]`} />
          {connected ? "Connected" : "Disconnected"}
        </div>
        <div className="text-center text-xs text-muted mt-2">
          {!connected && "Not connected"}
          {connected && agentStatus === "reading" && "Reading your message"}
          {connected && agentStatus === "replied" && "Replied to you"}
          {connected && agentStatus === "thinking" && "Thinking"}
          {connected && agentStatus === "working" && "Working"}
          {connected && agentStatus === "idle" && "Ready for tasks"}
          {connected && agentStatus === "error" && "Error"}
          {connected && agentStatus === "unknown" && "Ready"}
        </div>
      </aside>

      <main className="p-5 bg-[radial-gradient(1200px_600px_at_20%_-10%,#1b1f27_0%,#0f1115_60%)]">
        <div className="flex items-center justify-between mb-4 gap-4 sticky top-0 z-10 bg-[#0f1115]/80 backdrop-blur border-b border-[#1f2430] py-3">
          <div>
            <h2 className="text-xl font-semibold">Agent Dashboard</h2>
            <div className="text-xs text-muted">
              {connected ? "Connected" : "Disconnected"} • Last event: {lastWsEventAt || "—"}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="min-h-[28px]">
              {pairingRequired && (
                <div className="text-xs text-yellow-200 bg-yellow-900/40 border border-yellow-700 rounded-md px-2 py-1 inline-flex items-center gap-2">
                  Pairing required. Approve this device in OpenClaw.
                  {pairingRequired.requestId && (
                    <span className="text-yellow-300">Request: {pairingRequired.requestId}</span>
                  )}
                </div>
              )}
              {lastError && !pairingRequired && (
                <div className="text-xs text-red-200 bg-red-900/40 border border-red-700 rounded-md px-2 py-1 inline-flex items-center gap-2">
                  {lastError}
                </div>
              )}
            </div>
            <button
              className="border border-[#2a2f38] text-slate-300 text-sm rounded-md px-3 py-1"
              onClick={() => setShowConnect(true)}
            >
              Connect OpenClaw
            </button>
            <label className="text-xs text-muted">Project</label>
            <select
              className="bg-[#121419] border border-[#222] rounded-md px-2 py-1 text-sm"
              value={project}
              onChange={(e) => setProject(e.target.value)}
            >
              {projectOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Top row: To Do / Blocked / In Progress */}
        <section className="grid grid-cols-3 gap-3 mb-4">
          {(["todo", "blocked", "in_progress"] as const).map((col) => (
            <div key={col} className="bg-panel rounded-xl p-3 shadow-card">
              <h3 className="text-xs text-muted mb-2 flex items-center justify-between">
                <span
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm font-semibold text-white ${
                    col === "todo"
                      ? "bg-gradient-to-r from-[#1b2a45] to-[#122036] border-blue-700/40"
                      : col === "blocked"
                      ? "bg-gradient-to-r from-[#3a2a14] to-[#2a1c0c] border-yellow-700/40"
                      : "bg-gradient-to-r from-[#3a2814] to-[#23160c] border-orange-700/40"
                  }`}
                >
                  {col === "todo" && "🧾"}
                  {col === "blocked" && "🚧"}
                  {col === "in_progress" && "⚡"} {labels[col]}
                </span>
                <span className="text-[10px] text-muted/70">{tasksByColumn[col].length}</span>
              </h3>
              <div className="relative">
                <div className="space-y-2 min-h-[520px] max-h-[520px] overflow-y-auto pr-1 demo-scroll">
                  {tasksByColumn[col].map((t) => (
                    <div
                      key={t.id}
                      className={`relative overflow-hidden rounded-lg p-2 border border-[#222] cursor-pointer hover:border-[#3a404d] ${
                        col === "todo"
                          ? "bg-[#17304a]"
                          : col === "blocked"
                          ? "bg-[#352a14]"
                          : "bg-[#352514]"
                      }`}
                      onClick={() => setSelectedTask(t)}
                    >
                      <div
                        className={`absolute left-0 top-0 h-[2px] w-full ${
                          col === "todo"
                            ? "bg-blue-500/80"
                            : col === "blocked"
                            ? "bg-yellow-500/80"
                            : "bg-orange-400/80"
                        }`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm">{t.title}</div>
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded-full border border-[#2a2f38] bg-[#141922] text-slate-300">
                          {fmtPriority(t.priority)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                        {t.project && (
                          <span className="px-2 py-0.5 rounded-full bg-[#1a1f27] border border-[#222] text-muted text-center leading-tight inline-flex items-center justify-center min-h-[18px]">
                            {t.project}
                          </span>
                        )}
                        {t.date && <span>Due {t.date}</span>}
                        {t.updated_at && <span>Updated {fmtDate(t.updated_at)}</span>}
                      </div>
                    </div>
                  ))}

                  {tasksByColumn[col].length === 0 &&
                    (showSkeletons ? (
                      skeletonTasks.map((i) => (
                        <div
                          key={`sk-${col}-${i}`}
                          className={`bg-panel2 rounded-lg p-2 border border-[#222] animate-pulse ${
                            col === "todo"
                              ? "border-l-4 border-l-blue-500"
                              : col === "blocked"
                              ? "border-l-4 border-l-yellow-500"
                              : "border-l-4 border-l-orange-400"
                          }`}
                        >
                          <div className="h-3 w-3/4 bg-[#1a1f27] rounded mb-2" />
                          <div className="h-2 w-1/2 bg-[#1a1f27] rounded" />
                        </div>
                      ))
                    ) : (
                      <div className="bg-panel2 rounded-lg p-3 border border-[#222] text-xs text-muted">
                        No items yet.
                      </div>
                    ))}
                </div>
                {tasksByColumn[col].length > 10 && (
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0f1115] to-transparent" />
                )}
              </div>
            </div>
          ))}
        </section>

        {/* Bottom row: Done / Archived */}
        <section className="grid grid-cols-2 gap-3 mb-4">
          {(["done", "archived"] as const).map((col) => (
            <div key={col} className="bg-panel rounded-xl p-3 shadow-card">
              <h3 className="text-xs text-muted mb-2 flex items-center justify-between">
                <span
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-sm font-semibold text-white ${
                    col === "done"
                      ? "bg-gradient-to-r from-[#183224] to-[#112117] border-green-700/40"
                      : "bg-gradient-to-r from-[#1f2127] to-[#17181c] border-[#333]"
                  }`}
                >
                  {col === "done" && "✅"}
                  {col === "archived" && "🗂"} {labels[col]}
                </span>
                <span className="text-[10px] text-muted/70">{tasksByColumn[col].length}</span>
              </h3>
              <div className="relative">
                <div className="space-y-2 min-h-[520px] max-h-[520px] overflow-y-auto pr-1 demo-scroll">
                  {tasksByColumn[col].map((t) => (
                    <div
                      key={t.id}
                      className={`relative overflow-hidden rounded-lg p-2 border border-[#222] cursor-pointer hover:border-[#3a404d] ${
                        col === "done"
                          ? "bg-[#153021]"
                          : "bg-[#21232a] opacity-70"
                      }`}
                      onClick={() => setSelectedTask(t)}
                    >
                      <div
                        className={`absolute left-0 top-0 h-[2px] w-full ${
                          col === "done"
                            ? "bg-green-500/80"
                            : "bg-[#666]"
                        }`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm">{t.title}</div>
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded-full border border-[#2a2f38] bg-[#141922] text-slate-300">
                          {fmtPriority(t.priority)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                        {t.project && (
                          <span className="px-2 py-0.5 rounded-full bg-[#1a1f27] border border-[#222] text-muted text-center leading-tight inline-flex items-center justify-center min-h-[18px]">
                            {t.project}
                          </span>
                        )}
                        {t.date && <span>Due {t.date}</span>}
                        {t.updated_at && <span>Updated {fmtDate(t.updated_at)}</span>}
                      </div>
                    </div>
                  ))}

                  {tasksByColumn[col].length === 0 &&
                    (showSkeletons ? (
                      skeletonTasks.map((i) => (
                        <div
                          key={`sk-${col}-${i}`}
                          className={`bg-panel2 rounded-lg p-2 border border-[#222] animate-pulse ${
                            col === "done"
                              ? "border-l-4 border-l-green-500"
                              : "border-l-4 border-l-[#666] opacity-70"
                          }`}
                        >
                          <div className="h-3 w-3/4 bg-[#1a1f27] rounded mb-2" />
                          <div className="h-2 w-1/2 bg-[#1a1f27] rounded" />
                        </div>
                      ))
                    ) : (
                      <div className="bg-panel2 rounded-lg p-3 border border-[#222] text-xs text-muted">
                        No items yet.
                      </div>
                    ))}
                </div>
                {tasksByColumn[col].length > 10 && (
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#0f1115] to-transparent" />
                )}
              </div>
            </div>
          ))}
        </section>

        {/* Deliverables moved into main content grid */}

        <section className="grid grid-cols-1 gap-3 items-stretch">
          <div className="grid grid-rows-[auto_1fr] gap-3">
            <section className="bg-panel rounded-xl p-3 shadow-card mb-0">
              <h3 className="text-sm">📦 Deliverables</h3>
              <div className="grid grid-cols-2 gap-2 my-3">
                {deliverables.length > 0 ? (
                  deliverables.map((d) => (
                    <div key={d.id} className="bg-[#141922] rounded-xl p-3 shadow-card border border-[#252c3a]">
                      <div className="text-sm">{d.title}</div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                        {d.type && (
                          <span className="px-2 py-0.5 rounded-full bg-[#1a1f27] border border-[#222] text-muted">
                            {d.type}
                          </span>
                        )}
                        {d.date && <span>Due {d.date}</span>}
                        {d.updated_at && <span>Updated {fmtDate(d.updated_at)}</span>}
                      </div>
                    </div>
                  ))
                ) : showSkeletons ? (
                  skeletonDeliverables.map((i) => (
                    <div key={`d-${i}`} className="bg-panel2 rounded-xl p-3 shadow-card animate-pulse">
                      <div className="h-3 w-3/4 bg-[#1a1f27] rounded mb-2" />
                      <div className="h-2 w-1/2 bg-[#1a1f27] rounded" />
                    </div>
                  ))
                ) : (
                  <div className="col-span-3 bg-panel2 rounded-xl p-3 shadow-card text-xs text-muted">
                    No deliverables yet.
                  </div>
                )}
              </div>
            </section>

            {/* Notes panel removed */}

            <section className="bg-panel rounded-xl p-3 shadow-card">
              <h3 className="text-sm">⏱ Upcoming Work</h3>
              <div className="mt-3 space-y-2">
                {schedules.length === 0 && (
                  <div className="text-xs text-muted">No scheduled work yet.</div>
                )}
                {schedules.map((s) => (
                  <div key={s.id} className="bg-[#141922] rounded-lg p-2 border border-[#252c3a]">
                    <div className="text-sm flex items-center justify-between gap-2">
                      <span>{s.title}</span>
                      {s.run_at && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1a1f27] border border-[#222] text-emerald-300">
                          {fmtRelative(s.run_at)}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted mt-1">
                      {s.project && <span className="mr-2">{s.project}</span>}
                      {s.run_at && <span>{fmtDate(s.run_at)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

        </section>

        {demoMode && (
          <div className="fixed bottom-16 left-4 z-40 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100 shadow-lg">
            Demo mode enabled — showing fixture data.
          </div>
        )}
        {showDemoToggle && (
          <button
            className={`fixed bottom-4 left-4 z-40 rounded-full px-4 py-2 text-xs font-semibold border transition-all ${
              demoMode
                ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
                : "bg-[#141922] text-slate-300 border-[#2a2f38] hover:border-[#3a404d]"
            }`}
            onClick={toggleDemoMode}
          >
            Demo Mode
          </button>
        )}
      </main>

      <aside className="bg-[#0e1117] border-l border-[#1f2430] p-3 shadow-card sticky top-0 h-screen flex flex-col">
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-[#1f2430]">
          <h3 className="text-sm">Activity</h3>
          <div className="inline-flex items-center gap-1 bg-[#121419] border border-[#222] rounded-md p-1 text-xs">
            {showDebugTabs && (
              <>
                <button
                  className={`px-2 py-0.5 rounded ${logTab === "actions" ? "bg-[#1b1f27]" : ""}`}
                  onClick={() => setLogTab("actions")}
                >
                  Actions
                </button>
                <button
                  className={`px-2 py-0.5 rounded ${logTab === "system" ? "bg-[#1b1f27]" : ""}`}
                  onClick={() => setLogTab("system")}
                >
                  System
                </button>
                <button
                  className={`px-2 py-0.5 rounded flex items-center gap-1 ${logTab === "status" ? "bg-[#1b1f27]" : ""}`}
                  onClick={() => setLogTab("status")}
                >
                  <span>Status</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    live
                  </span>
                </button>
              </>
            )}
            <button
              className={`px-2 py-0.5 rounded text-muted hover:text-slate-200 ${showDebugTabs ? "" : "px-3"}`}
              title="Toggle tabs"
              onClick={() => {
                setShowDebugTabs((v) => {
                  const next = !v;
                  if (!next) setLogTab("actions");
                  return next;
                });
              }}
            >
              ⚙️
            </button>
          </div>
        </div>

        {logTab === "actions" && (
          <div className="flex flex-col flex-1 min-h-0">
            {actionLog.length === 0 &&
              (showSkeletons ? (
                <div className="mt-2 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={`al-${i}`} className="h-3 bg-[#1a1f27] rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted">No actions yet.</div>
              ))}
            <div
              className="mt-2 flex-1 min-h-0 overflow-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
                  setActionLimit((v) => Math.min(v + 50, actionLog.length));
                }
              }}
            >
              <div className="text-[11px] text-muted/60 py-1">Showing {Math.min(actionLimit, actionLog.length)} of {actionLog.length}</div>
              {actionLog.slice(0, actionLimit).map((l, idx) => (
                <div key={`${l.time}-${l.text}-${idx}`} className="text-xs text-muted border-b border-[#1f2430] py-2">
                  <span className="font-mono text-[11px] text-slate-400">{l.time}</span>
                  <span className="mx-2 text-slate-600">•</span>
                  <span>{l.text}</span>
                </div>
              ))}
              {actionLimit < actionLog.length && (
                <div className="text-[11px] text-muted py-2">Scroll to load more…</div>
              )}
            </div>
          </div>
        )}

        {logTab === "system" && (
          <div className="flex flex-col flex-1 min-h-0">
            {systemLog.length === 0 && (
              <div className="mt-2 text-xs text-muted">No system events yet.</div>
            )}
            <div
              className="mt-2 flex-1 min-h-0 overflow-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
                  setSystemLimit((v) => Math.min(v + 50, systemLog.length));
                }
              }}
            >
              <div className="text-[11px] text-muted/60 py-1">Showing {Math.min(systemLimit, systemLog.length)} of {systemLog.length}</div>
              {systemLog.slice(0, systemLimit).map((l, idx) => (
                <div key={`${l.time}-${l.text}-${idx}`} className="text-xs text-muted border-b border-[#1f2430] py-2">
                  <span className="font-mono text-[11px] text-slate-400">{l.time}</span>
                  <span className="mx-2 text-slate-600">•</span>
                  <span>{l.text}</span>
                </div>
              ))}
              {systemLimit < systemLog.length && (
                <div className="text-[11px] text-muted py-2">Scroll to load more…</div>
              )}
            </div>
          </div>
        )}

        {logTab === "status" && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="text-[11px] text-muted">Last update: {statusLog[0]?.time || "—"}</div>
            {statusLog.length === 0 && (
              <div className="mt-2 text-xs text-muted">No status events yet.</div>
            )}
            <div
              className="mt-2 flex-1 min-h-0 overflow-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
                  setStatusLimit((v) => Math.min(v + 50, statusLog.length));
                }
              }}
            >
              <div className="text-[11px] text-muted/60 py-1">Showing {Math.min(statusLimit, statusLog.length)} of {statusLog.length}</div>
              {statusLog.slice(0, statusLimit).map((l, idx) => (
                <div key={`${l.time}-${l.text}-${idx}`} className="text-xs text-muted border-b border-[#1f2430] py-2">
                  <span className="font-mono text-[11px] text-slate-400">{l.time}</span>
                  <span className="mx-2 text-slate-600">•</span>
                  <span>{l.text}</span>
                </div>
              ))}
              {statusLimit < statusLog.length && (
                <div className="text-[11px] text-muted py-2">Scroll to load more…</div>
              )}
            </div>
          </div>
        )}
      </aside>

      {selectedTask && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setSelectedTask(null)}>
          <div className="w-[760px] max-w-[92vw] bg-panel3 rounded-xl p-5 border border-[#222] shadow-[0_20px_60px_rgba(0,0,0,.45)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted">Task</div>
                <h3 className="text-lg font-semibold mt-1">{selectedTask.title}</h3>
              </div>
              <button className="border border-[#2a2f38] text-slate-300 text-sm rounded-md px-3 py-1" onClick={() => setSelectedTask(null)}>Close</button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="px-2 py-0.5 rounded-full bg-[#141922] border border-[#222] text-slate-300 uppercase">
                {fmtPriority(selectedTask.priority)}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#141922] border border-[#222] text-slate-300">
                {labels[selectedTask.status as keyof typeof labels] || selectedTask.status}
              </span>
              {selectedTask.project && (
                <span className="px-2 py-0.5 rounded-full bg-[#141922] border border-[#222] text-slate-300">
                  {selectedTask.project}
                </span>
              )}
            </div>
            <div className="mt-4">
              <div className="text-xs text-muted mb-1">Description</div>
              <div className="text-sm text-slate-200 whitespace-pre-wrap bg-[#12161f] border border-[#232833] rounded-lg p-3 min-h-[120px]">
                {selectedTask.description || "No description yet."}
              </div>
            </div>
            <div className="mt-4 text-xs text-muted">
              {selectedTask.date && <div>Due {selectedTask.date}</div>}
              {selectedTask.updated_at && <div>Updated {fmtDate(selectedTask.updated_at)}</div>}
            </div>
          </div>
        </div>
      )}

      {showConnect && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowConnect(false)}>
          <div className="w-[900px] max-w-[92vw] bg-panel3 rounded-xl p-4 border border-[#222] shadow-[0_20px_60px_rgba(0,0,0,.45)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm">Connect to OpenClaw</h3>
              <button className="border border-[#2a2f38] text-slate-300 text-sm rounded-md px-3 py-1" onClick={() => setShowConnect(false)}>Close</button>
            </div>
            <div className="grid grid-cols-[2fr_2fr_2fr_1fr] gap-3 items-end">
              <div>
                <div className="text-xs text-muted">Gateway URL</div>
                <input className="w-full bg-[#121419] border border-[#222] rounded-md px-2 py-1 text-sm" value={gatewayUrl} onChange={(e)=>setGatewayUrl(e.target.value)} />
              </div>
              <div>
                <div className="text-xs text-muted">Token</div>
                <input className="w-full bg-[#121419] border border-[#222] rounded-md px-2 py-1 text-sm" value={token} onChange={(e)=>setToken(e.target.value)} placeholder="Paste gateway token" />
              </div>
              <div>
                <div className="text-xs text-muted">Session Key</div>
                <input className="w-full bg-[#121419] border border-[#222] rounded-md px-2 py-1 text-sm" value={sessionKey} onChange={(e)=>setSessionKey(e.target.value)} />
              </div>
              <div className="flex justify-end">
                <button className="bg-accent rounded-md px-3 py-1 text-sm" onClick={connect}>Connect</button>
              </div>
            </div>
            <div className="text-xs text-muted mt-3">
              If you see <strong>NOT_PAIRED</strong>, approve the device in OpenClaw:
              <span className="block">openclaw devices list --json</span>
              <span className="block">openclaw devices approve &lt;requestId&gt;</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
