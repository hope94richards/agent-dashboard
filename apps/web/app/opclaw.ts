export type OpenClawConfig = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
};

export async function fetchChatHistory(cfg: OpenClawConfig) {
  const url = cfg.gatewayUrl.replace(/\/$/, "") + "/api/chat/history";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({ sessionKey: cfg.sessionKey, limit: 30 }),
  });
  if (!res.ok) throw new Error(`Gateway error: ${res.status}`);
  return res.json();
}
