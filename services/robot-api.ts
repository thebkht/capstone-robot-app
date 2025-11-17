import axios, { AxiosError, AxiosInstance, AxiosResponse } from "axios";

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
  timeout?: number;
  controlToken?: string | null;
  sessionId?: string | null;
  axiosInstance?: AxiosInstance;
}

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

interface ErrorResponse {
  message?: string;
  error?: string;
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
          "Content-Type": "application/json",
        },
      });

    // Request interceptor to add auth headers
    this.axiosInstance.interceptors.request.use(
      (config) => {
        if (this.controlToken) {
          config.headers["x-control-token"] = this.controlToken;
        }
        if (this.sessionId) {
          config.headers["session-id"] = this.sessionId;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          console.log("Unauthorized - Control token may be invalid");
        }
        return Promise.reject(error);
      }
    );
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

  private handleResponse<T>(response: AxiosResponse<T>): ApiResponse<T> {
    if (response.status === 204) {
      return {
        data: {} as T,
        status: response.status,
      };
    }
    return {
      data: response.data,
      status: response.status,
    };
  }

  private handleError(error: AxiosError<ErrorResponse>): ApiResponse {
    if (axios.isCancel(error) || error.code === "ECONNABORTED") {
      return {
        error: `Network request timed out after ${this.timeout}ms`,
        status: 0,
      };
    }

    if (error.response) {
      const errorData = error.response.data;
      const errorMessage =
        errorData?.message || errorData?.error || "Request failed";
      return {
        error: errorMessage,
        status: error.response.status,
      };
    } else if (error.request) {
      return {
        error: "Network error - No response from robot",
        status: 0,
      };
    } else {
      return {
        error: error.message || "Unknown error",
        status: 0,
      };
    }
  }

  // Generic HTTP methods
  private async get<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.get<T>(endpoint);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error as AxiosError<ErrorResponse>);
    }
  }

  private async post<T = any>(
    endpoint: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.post<T>(endpoint, data);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error as AxiosError<ErrorResponse>);
    }
  }

  private async put<T = any>(
    endpoint: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.put<T>(endpoint, data);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error as AxiosError<ErrorResponse>);
    }
  }

  private async delete<T = any>(endpoint: string): Promise<ApiResponse<T>> {
    try {
      const response = await this.axiosInstance.delete<T>(endpoint);
      return this.handleResponse(response);
    } catch (error) {
      return this.handleError(error as AxiosError<ErrorResponse>);
    }
  }

  // Public API methods
  public async ping(): Promise<RobotHealth> {
    const response = await this.get<RobotHealth>("/health");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async fetchHealth(): Promise<RobotHealth> {
    const response = await this.get<RobotHealth>("/health");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async fetchNetworkInfo(): Promise<RobotNetworkInfo> {
    const response = await this.get<RobotNetworkInfo>("/wifi/status");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async fetchTelemetry(): Promise<RobotTelemetry> {
    const response = await this.get<RobotTelemetry>("/status");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async fetchMode(): Promise<RobotModeState> {
    const response = await this.get<RobotModeState>("/mode");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async connectWifi(
    credentials: WifiCredentials
  ): Promise<{ success: boolean }> {
    const response = await this.post<{ success: boolean }>(
      "/wifi/connect",
      credentials
    );
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async capturePhoto(): Promise<CameraCaptureMetadata> {
    const response = await this.post<CameraCaptureMetadata>("/camera/capture");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async listWifiNetworks(): Promise<WifiScanResponse> {
    const response = await this.get<WifiScanResponse>("/wifi/networks");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async fetchWifiStatus(): Promise<RobotNetworkInfo> {
    const response = await this.get<RobotNetworkInfo>("/wifi/status");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async scanWifiNetworks(): Promise<WifiScanResponse> {
    const response = await this.get<WifiScanResponse>("/wifi/scan");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async requestClaim(): Promise<ClaimRequestResponse> {
    const response = await this.post<ClaimRequestResponse>("/claim/request");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async confirmClaim(pin: string): Promise<ClaimConfirmResponse> {
    const response = await this.post<ClaimConfirmResponse>("/claim/confirm", {
      pin,
    });
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async move(payload: { linear: number; angular: number }) {
    const response = await this.post("/control/move", payload);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async stop() {
    const response = await this.post("/control/stop");
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async moveHead(payload: { pan: number; tilt: number }) {
    const response = await this.post("/control/head", payload);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  public async controlLights(payload: { pwmA: number; pwmB: number }) {
    const response = await this.post("/control/lights", payload);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
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
    const response = await this.post("/control/nod", payload);
    if (response.error) {
      throw new Error(response.error);
    }
    return response.data!;
  }

  // Utility methods
  public setHeader(key: string, value: string) {
    this.axiosInstance.defaults.headers.common[key] = value;
  }

  public removeHeader(key: string) {
    delete this.axiosInstance.defaults.headers.common[key];
  }

  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }

  // Organized namespace methods (optional, similar to your ApiClient)
  public camera = {
    capture: () => this.capturePhoto(),
    getStreamUrl: () => this.streamUrl,
    getSnapshotUrl: () => this.snapshotUrl,
  };

  public wifi = {
    connect: (credentials: WifiCredentials) => this.connectWifi(credentials),
    listNetworks: () => this.listWifiNetworks(),
    scan: () => this.scanWifiNetworks(),
    getStatus: () => this.fetchWifiStatus(),
  };

  public control = {
    move: (payload: { linear: number; angular: number }) => this.move(payload),
    stop: () => this.stop(),
    moveHead: (payload: { pan: number; tilt: number }) =>
      this.moveHead(payload),
    lights: (payload: { pwmA: number; pwmB: number }) =>
      this.controlLights(payload),
    nod: (payload?: {
      times?: number;
      center_tilt?: number;
      delta?: number;
      pan?: number;
      delay?: number;
    }) => this.nod(payload),
  };
}

export const createRobotApi = (
  baseUrl: string,
  timeout?: number,
  controlToken?: string | null,
  sessionId?: string | null
) => new RobotAPI({ baseUrl, timeout, controlToken, sessionId });
