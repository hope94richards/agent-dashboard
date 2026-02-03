import nacl from "tweetnacl";

export type OpenClawConfig = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
};

type DeviceIdentity = {
  deviceId: string;
  publicKey: string; // base64url (raw 32 bytes)
  secretKey: string; // base64url (raw 64 bytes)
};

const DEVICE_IDENTITY_KEY = "opclaw.deviceIdentity.v1";
const DEVICE_TOKEN_KEY = "opclaw.deviceToken.v1";

function toWs(url: string) {
  if (url.startsWith("ws://") || url.startsWith("wss://")) return url;
  if (url.startsWith("https://")) return url.replace("https://", "wss://");
  if (url.startsWith("http://")) return url.replace("http://", "ws://");
  return `ws://${url}`;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = localStorage.getItem(DEVICE_IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.deviceId && parsed?.publicKey && parsed?.secretKey) {
        return parsed;
      }
    }
  } catch {
    // fall through
  }

  const keypair = nacl.sign.keyPair();
  const publicKey = keypair.publicKey;
  const secretKey = keypair.secretKey;
  const deviceId = await sha256Hex(publicKey);
  const identity: DeviceIdentity = {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    secretKey: base64UrlEncode(secretKey)
  };
  localStorage.setItem(DEVICE_IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

function buildDeviceAuthPayload(params: {
  version?: "v1" | "v2";
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string;
  nonce?: string;
}) {
  const version = params.version ?? (params.nonce ? "v2" : "v1");
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token
  ];
  if (version === "v2") base.push(params.nonce ?? "");
  return base.join("|");
}

function signDevicePayload(secretKeyBase64Url: string, payload: string) {
  const secretKey = base64UrlDecode(secretKeyBase64Url);
  const msg = new TextEncoder().encode(payload);
  const signature = nacl.sign.detached(msg, secretKey);
  return base64UrlEncode(signature);
}

function loadDeviceToken() {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function storeDeviceToken(token: string) {
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function connectOpenClaw(
  cfg: OpenClawConfig,
  onEvent: (evt: any) => void,
  onStatus: (status: "connected" | "disconnected") => void,
  onError: (err: string) => void
) {
  const wsUrl = toWs(cfg.gatewayUrl);
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    onStatus("connected");
  };

  ws.onmessage = async (msg) => {
    try {
      const frame = JSON.parse(msg.data);
      if (frame?.type === "event" && frame?.event === "connect.challenge") {
        const nonce = frame?.payload?.nonce;
        const signedAtMs = Date.now();
        const clientId = "openclaw-control-ui";
        const clientMode = "webchat";
        const role = "operator";
        const scopes = [
          "operator.read",
          "operator.write",
          "operator.admin",
          "operator.approvals",
          "operator.pairing"
        ];

        const identity = await loadOrCreateDeviceIdentity();
        const authToken = loadDeviceToken() ?? cfg.token;
        const payload = buildDeviceAuthPayload({
          version: nonce ? "v2" : "v1",
          deviceId: identity.deviceId,
          clientId,
          clientMode,
          role,
          scopes,
          signedAtMs,
          token: authToken,
          nonce
        });

        const signature = signDevicePayload(identity.secretKey, payload);
        const device = {
          id: identity.deviceId,
          publicKey: identity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce
        };

        const req = {
          type: "req",
          id: crypto.randomUUID(),
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: clientId,
              version: "0.1.0",
              platform: navigator.platform || "web",
              mode: clientMode
            },
            role,
            scopes,
            caps: [],
            commands: [],
            permissions: {},
            auth: {
              token: authToken
            },
            device,
            locale: navigator.language || "en-US",
            userAgent: navigator.userAgent
          }
        };
        ws.send(JSON.stringify(req));
        return;
      }

      if (frame?.type === "res" && frame?.ok && frame?.payload?.auth?.deviceToken) {
        storeDeviceToken(frame.payload.auth.deviceToken);
      }

      onEvent(frame);
    } catch (e: any) {
      onError(e?.message || "invalid frame");
    }
  };

  ws.onclose = () => {
    onStatus("disconnected");
  };

  ws.onerror = () => {
    onError("websocket error");
  };

  return () => ws.close();
}
