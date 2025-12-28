import axios from 'axios';
import http from 'http';
import https from 'https';

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 2000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 2000,
  rejectUnauthorized: false,
});

const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 2000,
  maxRedirects: 0,
});

export interface ServiceStatus {
  name: string;
  url: string;
  status: 'up' | 'down' | 'starting' | 'degraded';
  lastChecked: string;
  error?: string;
}

const services: Record<string, string> = {
  bernard: process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:8850',
  'bernard-api': process.env.BERNARD_API_URL || 'http://127.0.0.1:8800',
  vllm: process.env.VLLM_URL || 'http://127.0.0.1:8860',
  whisper: process.env.WHISPER_URL || 'http://127.0.0.1:8870',
  kokoro: process.env.KOKORO_URL || 'http://127.0.0.1:8880',
  ui: process.env.BERNARD_UI_URL || 'http://127.0.0.1:8810',
};

export async function checkServiceHealth(name: string, url: string): Promise<ServiceStatus> {
  const timestamp = new Date().toISOString();
  try {
    const healthUrl = name === 'whisper' ? `${url}/health` : // Whisper.cpp health
                     name === 'vllm' ? `${url}/health` :    // vLLM health
                     `${url}/health`;                       // Others usually have /health
    
    const response = await axiosInstance.get(healthUrl);
    return {
      name,
      url,
      status: response.status < 500 ? 'up' : 'degraded',
      lastChecked: timestamp,
    };
  } catch (error: any) {
    if (name === 'ui') {
       try {
         await axiosInstance.get(url);
         return { name, url, status: 'up', lastChecked: timestamp };
       // eslint-disable-next-line no-empty
       } catch {
       }
    }

    return {
      name,
      url,
      status: 'down',
      lastChecked: timestamp,
      error: error.message,
    };
  }
}

export async function getAllServicesHealth() {
  const checks = Object.entries(services).map(([name, url]) => checkServiceHealth(name, url));
  return Promise.all(checks);
}
