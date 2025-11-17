import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RobotConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface WifiCredentials {
  ssid: string;
  password: string;
}

export interface RobotNetworkInfo {
  ip?: string;
  ssid?: string;
  wifiSsid?: string;
  network_name?: string;
  connected?: boolean;
  signalStrength?: number;
  availableNetworks?: string[];
  mode?: string;
  [key: string]: unknown;
}

export interface RobotHealth {
  connected?: boolean;
  firmware?: Record<string, unknown>;
  battery?: number;
  uptimeSeconds?: number;
  network?: RobotNetworkInfo;
  [key: string]: unknown;
}

export interface RobotTelemetry {
  battery?: number;
  cpuLoad?: number;
  temperatureC?: number;
  humidity?: number;
  uptimeSeconds?: number;
  network?: RobotNetworkInfo;
  [key: string]: unknown;
}

export interface CameraCaptureMetadata {
  id?: string;
  url?: string;
  snapshotUrl?: string;
  imageUrl?: string;
  path?: string;
  saved?: boolean;
  [key: string]: unknown;
}

export interface RobotModeState {
  mode?: string;
  current?: string;
  status?: string;
  [key: string]: unknown;
}

export interface RobotStatus {
  health?: RobotHealth;
  telemetry?: RobotTelemetry;
  network?: RobotNetworkInfo;
  battery?: number;
  cpuLoad?: number;
  temperatureC?: number;
  humidity?: number;
  uptimeSeconds?: number;
  mode?: string;
  [key: string]: unknown;
}

export interface WifiNetwork {
  ssid: string;
  signal_strength?: number;
  security?: string;
  frequency?: number;
}

export interface WifiScanResponse {
  networks: WifiNetwork[] | string[];
}

export interface ClaimRequestResponse {
  success?: boolean;
  [key: string]: unknown;
}

export interface ClaimConfirmResponse {
  success?: boolean;
  controlToken?: string;
  sessionId?: string;
  session_id?: string;
  session?: string;
  [key: string]: unknown;
}

export interface RobotApiOptions {
  baseUrl: string;
  timeout?: number; // Timeout in milliseconds, default 5000
  controlToken?: string | null; // Optional control token for authenticated requests
  sessionId?: string | null; // Optional session ID for authenticated requests
  axiosInstance?: AxiosInstance;
}

export class RobotAPI {
  private baseUrl: string;
  private axiosInstance: AxiosInstance;
  private timeout: number;
  private controlToken: string | null;
  private sessionId: string | null;

  constructor(options: RobotApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeout = options.timeout ?? 5000;
    this.controlToken = options.controlToken ?? null;
    this.sessionId = options.sessionId ?? null;

    this.axiosInstance =
      options.axiosInstance ??
      axios.create({
        baseURL: this.baseUrl,
        timeout: this.timeout,
        headers: {
          Accept: "application/json",
        },
      });
  }

  public updateBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.axiosInstance.defaults.baseURL = this.baseUrl;
  }

  public setControlToken(token: string | null) {
    this.controlToken = token;
  }

  public getControlToken(): string | null {
    return this.controlToken;
  }

  public setSessionId(sessionId: string | null) {
    this.sessionId = sessionId;
  }

  public getSessionId(): string | null {
    return this.sessionId;
  }

  public get streamUrl() {
    return `${this.baseUrl}/camera/stream`;
  }

  public get snapshotUrl() {
    return `${this.baseUrl}/camera/snapshot`;
  }

  private async request<T>(
    path: string,
    method: HttpMethod = "GET",
    body?: unknown,
    requireAuth: boolean = false
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error("Robot base URL is not configured.");
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Add control token header for protected calls
    if (requireAuth && this.controlToken) {
      headers["x-control-token"] = this.controlToken;
    }

    if (requireAuth && this.sessionId) {
      headers["session-id"] = this.sessionId;
    }

    try {
      const normalizedMethod = method.toUpperCase() as HttpMethod;
      let response;

      if (normalizedMethod === "GET") {
        response = await this.axiosInstance.get<T>(path, {
          headers,
          signal: controller.signal,
        });
      } else if (normalizedMethod === "POST") {
        response = await this.axiosInstance.post<T>(
          path,
          body ?? {},
          {
            headers,
            signal: controller.signal,
          }
        );
      } else {
        const config: AxiosRequestConfig = {
          url: path,
          method: normalizedMethod,
          headers,
          signal: controller.signal,
        };

        if (normalizedMethod !== "GET") {
          config.data = body ?? {};
        }

        response = await this.axiosInstance.request<T>(config);
      }

      clearTimeout(timeoutId);

      if (response.status === 204) {
        return {} as T;
      }

      return response.data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (
        axios.isCancel(error) ||
        (error as AxiosError)?.code === "ERR_CANCELED"
      ) {
        throw new Error(`Network request timed out after ${this.timeout}ms`);
      }

      if (axios.isAxiosError(error) && error.response) {
        const responseData =
          typeof error.response.data === "string"
            ? error.response.data
            : JSON.stringify(error.response.data);
        throw new Error(
          `Robot request failed (${error.response.status}): ${responseData}`
        );
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new Error(String(error));
    }
  }

  public async ping(): Promise<RobotHealth> {
    return this.request<RobotHealth>("/health");
  }

  public async fetchHealth(): Promise<RobotHealth> {
    return this.request<RobotHealth>("/health");
  }

  public async fetchNetworkInfo(): Promise<RobotNetworkInfo> {
    return this.request<RobotNetworkInfo>("/wifi/status");
  }

  public async fetchTelemetry(): Promise<RobotTelemetry> {
    return this.request<RobotTelemetry>("/status");
  }

  public async fetchMode(): Promise<RobotModeState> {
    return this.request<RobotModeState>("/mode");
  }

  public async connectWifi(
    credentials: WifiCredentials
  ): Promise<{ success: boolean }>;
  public async connectWifi(
    credentials: WifiCredentials,
    options?: { force: boolean }
  ): Promise<{ success: boolean }>;
  public async connectWifi(
    credentials: WifiCredentials,
    _options?: { force: boolean }
  ) {
    return this.request<{ success: boolean }>(
      "/wifi/connect",
      "POST",
      credentials
    );
  }

  public async capturePhoto(): Promise<CameraCaptureMetadata> {
    return this.request<CameraCaptureMetadata>("/camera/capture", "POST");
  }

  public async listWifiNetworks(): Promise<WifiScanResponse> {
    return this.request<WifiScanResponse>("/wifi/networks");
  }

  public async fetchWifiStatus(): Promise<RobotNetworkInfo> {
    return this.request<RobotNetworkInfo>("/wifi/status");
  }

  public async scanWifiNetworks(): Promise<WifiScanResponse> {
    return this.request<WifiScanResponse>("/wifi/scan");
  }

  public async requestClaim(): Promise<ClaimRequestResponse> {
    return this.request<ClaimRequestResponse>("/claim/request", "POST", {});
  }

  public async confirmClaim(pin: string): Promise<ClaimConfirmResponse> {
    return this.request<ClaimConfirmResponse>("/claim/confirm", "POST", {
      pin,
    });
  }

  public async move(payload: { linear: number; angular: number }) {
    return this.request("/control/move", "POST", payload, true);
  }

  public async stop() {
    return this.request("/control/stop", "POST", undefined, true);
  }

  public async moveHead(payload: { pan: number; tilt: number }) {
    return this.request("/control/head", "POST", payload, true);
  }

  public async controlLights(payload: { pwmA: number; pwmB: number }) {
    return this.request("/control/lights", "POST", payload, true);
  }

  public async nod(
    payload: {
      times?: number;
      center_tilt?: number;
      delta?: number;
      pan?: number;
      delay?: number;
    } = {}
  ) {
    return this.request("/control/nod", "POST", payload, true);
  }
}

export const createRobotApi = (
  baseUrl: string,
  timeout?: number,
  controlToken?: string | null,
  sessionId?: string | null
) => new RobotAPI({ baseUrl, timeout, controlToken, sessionId });
