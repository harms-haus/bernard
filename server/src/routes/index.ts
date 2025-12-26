import { FastifyInstance } from 'fastify';
import { getAllServicesHealth } from '../lib/health.js';

export async function registerIndexRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const health = await getAllServicesHealth();
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bernard System Status</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #e0e0e0; max-width: 800px; margin: 0 auto; padding: 20px; background: #1a1a1a; }
        h1 { color: #ffffff; border-bottom: 2px solid #61dafb; padding-bottom: 10px; }
        .card { background: #2d2d2d; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.3); padding: 20px; margin-bottom: 20px; border: 1px solid #404040; }
        .status-up { color: #4ade80; font-weight: bold; }
        .status-down { color: #f87171; font-weight: bold; }
        .status-starting { color: #fbbf24; font-weight: bold; }
        .service-list { list-style: none; padding: 0; }
        .service-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #404040; }
        .service-item:last-child { border-bottom: none; }
        .links { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
        .btn { display: inline-block; background: #61dafb; color: #1a1a1a; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; transition: background 0.3s; }
        .btn:hover { background: #4fc3f7; }
        .btn-secondary { background: #6b7280; color: #e0e0e0; }
        .btn-secondary:hover { background: #4b5563; }
        .error-msg { font-size: 0.8em; color: #f87171; margin-top: 5px; }
    </style>
    <script>
        // Auto refresh every 30 seconds
        setTimeout(() => window.location.reload(), 30000);
    </script>
</head>
<body>
    <h1>🤖 Bernard Unified Control</h1>
    
    <div class="card">
        <h2>Service Health</h2>
        <ul class="service-list">
            ${health.map(s => `
                <li class="service-item">
                    <div>
                        <strong>${s.name.toUpperCase()}</strong>
                        <div style="font-size: 0.8em; color: #666;">${s.url}</div>
                        ${s.error ? `<div class="error-msg">${s.error}</div>` : ''}
                    </div>
                    <span class="status-${s.status}">${s.status.toUpperCase()}</span>
                </li>
            `).join('')}
        </ul>
    </div>

    <div class="card">
        <h2>Quick Access</h2>
        <div class="links">
            <a href="/bernard/chat" class="btn">💬 Chat Interface</a>
            <a href="/bernard/admin" class="btn">⚙️ Admin Dashboard</a>
            <a href="/v1/models" class="btn btn-secondary">📋 List Models (v1)</a>
        </div>
    </div>

    <div style="text-align: center; color: #7f8c8d; font-size: 0.9em; margin-top: 40px;">
        Last Updated: ${new Date().toLocaleTimeString()} | Refresh: 30s
    </div>
</body>
</html>
    `;
    
    reply.type('text/html').send(html);
  });

  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}

