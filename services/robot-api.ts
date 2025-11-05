type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RobotConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WifiCredentials {
  ssid: string;
  password: string;
}

export interface RobotStatus {
  battery?: number;
  cpuLoad?: number;
  temperatureC?: number;
  humidity?: number;
  uptimeSeconds?: number;
  network?: {
    ip?: string;
    wifiSsid?: string;
    signalStrength?: number;
    availableNetworks?: string[];
  };
  [key: string]: unknown;
}

export interface SnapshotResponse {
  url: string;
}

export interface WifiScanResponse {
  networks: string[];
}

export interface RobotApiOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeout?: number; // Timeout in milliseconds, default 5000
}

export class RobotAPI {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private timeout: number;

  constructor(options: RobotApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeout = options.timeout ?? 5000;
  }

  public updateBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public get streamUrl() {
    return `${this.baseUrl}/camera/stream`;
  }

  private async request<T>(path: string, method: HttpMethod = 'GET', body?: unknown): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Robot base URL is not configured.');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
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

  public async ping(): Promise<RobotStatus> {
    return this.request<RobotStatus>('/status');
  }

  public async connectWifi(credentials: WifiCredentials): Promise<{ success: boolean }>
  public async connectWifi(credentials: WifiCredentials, options?: { force: boolean }): Promise<{ success: boolean }>
  public async connectWifi(credentials: WifiCredentials, _options?: { force: boolean }) {
    return this.request<{ success: boolean }>('/connect', 'POST', credentials);
  }

  public async fetchStatus(): Promise<RobotStatus> {
    return this.request<RobotStatus>('/status');
  }

  public async triggerSnapshot(): Promise<SnapshotResponse> {
    return this.request<SnapshotResponse>('/camera/snapshot', 'POST');
  }

  public async listWifiNetworks(): Promise<WifiScanResponse> {
    return this.request<WifiScanResponse>('/wifi/networks');
  }
}


export const createRobotApi = (baseUrl: string, timeout?: number) => new RobotAPI({ baseUrl, timeout });
