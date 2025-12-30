import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SettingsStore } from "../lib/settingsStore";
import { requireAdmin } from "../lib/auth";
import { logger } from "../lib/logger";

export function registerProviderRoutes(fastify: FastifyInstance) {
  const store = new SettingsStore();

  // GET /providers - Get providers list
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const providers = await store.getProviders();
      logger.info({ action: "providers.read", adminId: admin.user.id, count: providers.length });
      return reply.send(providers);
    } catch (error) {
      logger.error({ error }, "Failed to get providers");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /providers - Create provider
  fastify.post<{
    Body: { name: string; baseUrl: string; apiKey: string; type?: "openai" | "ollama" };
  }>("/", async (request: FastifyRequest<{ Body: { name: string; baseUrl: string; apiKey: string; type?: "openai" | "ollama" } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { name, baseUrl, apiKey, type = "openai" } = request.body;
      if (!name || !baseUrl || !apiKey) {
        return reply.status(400).send({ error: "name, baseUrl, and apiKey are required" });
      }

      const models = await store.getModels();
      const providers = models.providers || [];
      
      if (providers.some(p => p.name === name)) {
        return reply.status(400).send({ error: "Provider with this name already exists" });
      }

      const newProvider = await store.addProvider({ name, baseUrl, apiKey, type });
      logger.info({ action: "providers.create", adminId: admin.user.id, providerId: newProvider.id });
      return reply.status(201).send(newProvider);
    } catch (error) {
      logger.error({ error }, "Failed to create provider");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // GET /providers/:id - Get single provider
  fastify.get<{ Params: { id: string } }>("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const providers = await store.getProviders();
      const provider = providers.find(p => p.id === request.params.id);
      
      if (!provider) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      return reply.send(provider);
    } catch (error) {
      logger.error({ error }, "Failed to get provider");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // PUT /providers/:id - Update provider
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; baseUrl?: string; apiKey?: string };
  }>("/:id", async (request: FastifyRequest<{
    Params: { id: string };
    Body: { name?: string; baseUrl?: string; apiKey?: string };
  }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const updatedProvider = await store.updateProvider(id, request.body);
      
      if (!updatedProvider) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      logger.info({ action: "providers.update", adminId: admin.user.id, providerId: id });
      return reply.send(updatedProvider);
    } catch (error) {
      logger.error({ error }, "Failed to update provider");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // DELETE /providers/:id - Delete provider
  fastify.delete<{ Params: { id: string } }>("/:id", {
    schema: { body: false }
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const deleted = await store.deleteProvider(id);
      
      if (!deleted) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      logger.info({ action: "providers.delete", adminId: admin.user.id, providerId: id });
      return reply.status(204).send();
    } catch (error) {
      logger.error({ error }, "Failed to delete provider");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });

  // POST /providers/:id/test - Test provider connection
  fastify.post<{ Params: { id: string } }>("/:id/test", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const providers = await store.getProviders();
      const provider = providers.find(p => p.id === id);
      
      if (!provider) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      const testResult = await store.testProviderConnection(provider);
      
      logger.info({ 
        action: "providers.test", 
        adminId: admin.user.id, 
        providerId: id, 
        status: testResult.status 
      });
      
      return reply.send({
        ...testResult,
        testedAt: new Date().toISOString()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error }, "Failed to test provider");
      return reply.status(500).send({ 
        status: 'failed', 
        error: errorMessage,
        testedAt: new Date().toISOString()
      });
    }
  });

  // GET /providers/:id/models - Get models for provider
  fastify.get<{ Params: { id: string } }>("/:id/models", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const admin = await requireAdmin(request);
      if (!admin) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const { id } = request.params;
      const providers = await store.getProviders();
      const provider = providers.find(p => p.id === id);
      
      if (!provider) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      interface OpenAIModelsResponse {
        data?: Array<{ id: string; object: string; created: number; owned_by: string }>;
      }
      
      let models: Array<{ id: string; object: string; created: number; owned_by: string }> = [];
      let fetchError: string | null = null;
      
      const normalizedBase = provider.baseUrl.replace(/\/$/, '');
      const modelsUrl = normalizedBase.endsWith('/v1') 
        ? `${normalizedBase}/models` 
        : `${normalizedBase}/v1/models`;
      
      try {
        const response = await fetch(modelsUrl, {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          fetchError = `Provider returned ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ''}`;
        } else {
          const data = await response.json() as OpenAIModelsResponse;
          models = data.data || [];
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        fetchError = `Failed to connect to provider: ${errorMessage}`;
      }

      if (fetchError) {
        logger.error({ error: fetchError, providerId: id }, 'Failed to fetch models from provider');
        return reply.status(502).send({ 
          error: fetchError,
          providerId: id
        });
      }

      logger.info({ action: "providers.models.read", adminId: admin.user.id, providerId: id, count: models.length });
      return reply.send(models);
    } catch (error) {
      logger.error({ error }, "Failed to get provider models");
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}
