import { io, Socket } from "socket.io-client";

export const cmd_movition_ctrl = "cmd_movition_ctrl";
export const speed_rate = 1;
export const slow_speed = 0.5;
export const max_speed = 1;

export interface MovementCommand {
  T: string;
  L: number;
  R: number;
}

let heartbeat_left = 0;
let heartbeat_right = 0;
let socketJson: Socket | null = null;
let activeSocketUrl: string | null = null;

const buildSocketUrl = (baseUrl?: string | null) => {
  if (baseUrl && baseUrl.trim()) {
    try {
      const parsed = new URL(baseUrl.startsWith("http") ? baseUrl : `http://${baseUrl}`);
      parsed.pathname = "/json";
      parsed.search = "";
      return parsed.toString();
    } catch (error) {
      console.warn("Failed to derive json socket URL from baseUrl", baseUrl, error);
    }
  }

  if (typeof location !== "undefined" && location.host) {
    return `http://${location.host}/json`;
  }

  return null;
};

const ensureSocket = (baseUrl?: string | null) => {
  const url = buildSocketUrl(baseUrl);
  if (!url) {
    console.warn("Unable to determine json socket URL");
    return null;
  }

  if (socketJson && activeSocketUrl === url) {
    return socketJson;
  }

  if (socketJson) {
    try {
      socketJson.disconnect();
    } catch (error) {
      console.warn("Failed to disconnect existing json socket", error);
    }
  }

  socketJson = io(url, { transports: ["websocket"], autoConnect: true });
  activeSocketUrl = url;
  return socketJson;
};

export const cmdJsonCmd = (jsonData: MovementCommand, baseUrl?: string | null) => {
  console.log(jsonData);
  const socket = ensureSocket(baseUrl);
  if (!socket) {
    return;
  }

  if (jsonData.T === cmd_movition_ctrl) {
    heartbeat_left = jsonData.L;
    heartbeat_right = jsonData.R;
  }

  const payload =
    jsonData.T === cmd_movition_ctrl
      ? {
          ...jsonData,
          L: heartbeat_left * speed_rate,
          R: heartbeat_right * speed_rate,
        }
      : jsonData;

  socket.emit("json", payload);
};
