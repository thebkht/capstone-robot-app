type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RobotConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WifiCredentials {
  ssid: string;
  password: string;
}

export interface RobotNetworkInfo {
  ip?: string;
  ssid?: string;
  wifiSsid?: string;
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

export interface WifiScanResponse {
  networks: string[];
}

export interface RobotApiOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeout?: number; // Timeout in milliseconds, default 5000
  controlToken?: string | null;
}

export class RobotAPI {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private timeout: number;
  private controlToken: string | null;

  constructor(options: RobotApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeout = options.timeout ?? 5000;
    this.controlToken = options.controlToken ?? null;
  }

  public updateBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public updateControlToken(controlToken: string | null) {
    this.controlToken = controlToken ?? null;
  }

  public get streamUrl() {
    return `${this.baseUrl}/camera/stream`;
  }

  public get snapshotUrl() {
    return `${this.baseUrl}/camera/snapshot`;
  }

  private async request<T>(path: string, method: HttpMethod = 'GET', body?: unknown): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Robot base URL is not configured.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.controlToken) {
        headers['x-control-token'] = this.controlToken;
      }

      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Robot request failed (${response.status}): ${text}`);
      }

      if (response.status === 204) {
        return {} as T;
      }

      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return (await response.json()) as T;
      }

      return (await response.text()) as unknown as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Network request timed out after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  public async ping(): Promise<RobotHealth> {
    return this.request<RobotHealth>('/health');
  }

  public async fetchHealth(): Promise<RobotHealth> {
    return this.request<RobotHealth>('/health');
  }

  public async fetchNetworkInfo(): Promise<RobotNetworkInfo> {
    return this.request<RobotNetworkInfo>('/network-info');
  }

  public async fetchTelemetry(): Promise<RobotTelemetry> {
    return this.request<RobotTelemetry>('/status');
  }

  public async fetchMode(): Promise<RobotModeState> {
    return this.request<RobotModeState>('/mode');
  }

  public async connectWifi(credentials: WifiCredentials): Promise<{ success: boolean }>
  public async connectWifi(credentials: WifiCredentials, options?: { force: boolean }): Promise<{ success: boolean }>
  public async connectWifi(credentials: WifiCredentials, _options?: { force: boolean }) {
    return this.request<{ success: boolean }>('/wifi/connect', 'POST', credentials);
  }

  public async capturePhoto(): Promise<CameraCaptureMetadata> {
    return this.request<CameraCaptureMetadata>('/camera/capture', 'POST');
  }

  public async listWifiNetworks(): Promise<WifiScanResponse> {
    return this.request<WifiScanResponse>('/wifi/networks');
  }

  public async move(payload: { linear: number; angular: number }) {
    return this.request('/control/move', 'POST', payload);
  }

  public async stop() {
    return this.request('/control/stop', 'POST');
  }

  public async moveHead(payload: { pan: number; tilt: number }) {
    return this.request('/control/head', 'POST', payload);
  }
}

export const createRobotApi = (
  baseUrl: string,
  options?: { timeout?: number; controlToken?: string | null; fetchImpl?: typeof fetch }
) =>
  new RobotAPI({
    baseUrl,
    timeout: options?.timeout,
    controlToken: options?.controlToken ?? null,
    fetchImpl: options?.fetchImpl,
  });
