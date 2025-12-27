import { FastifyInstance } from 'fastify';
import axios from 'axios';

export interface ServiceStatus {
  name: string;
  url: string;
  status: 'up' | 'down' | 'starting' | 'degraded';
  lastChecked: string;
  error?: string;
}

const services: Record<string, string> = {
  bernard: process.env.BERNARD_URL || 'http://localhost:3001',
  vllm: process.env.VLLM_URL || 'http://localhost:8001',
  whisper: process.env.WHISPER_URL || 'http://localhost:8002',
  kokoro: process.env.KOKORO_URL || 'http://localhost:8880',
  ui: process.env.UI_URL || 'http://localhost:4200',
};

export async function checkServiceHealth(name: string, url: string): Promise<ServiceStatus> {
  const timestamp = new Date().toISOString();
  try {
    const healthUrl = name === 'bernard' ? `${url}/health` :
                     name === 'vllm' ? `${url}/health` :
                     name === 'whisper' ? `${url}/health` :
                     name === 'kokoro' ? `${url}/health` : url;
    
    const response = await axios.get(healthUrl, { timeout: 2000 });
    return {
      name,
      url,
      status: response.status < 500 ? 'up' : 'error' as any,
      lastChecked: timestamp,
    };
  } catch (error: any) {
    // If it's the UI dev server, it might not have a health endpoint but we can check if it's reachable
    if (name === 'ui') {
       try {
         await axios.get(url, { timeout: 1000 });
         return { name, url, status: 'up', lastChecked: timestamp };
       } catch (e) {}
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

