# Check services

Each service has a check function, let's expand and complete the feature.

## Services & Checks

Service checks should be configurable and has an id. The check log output should be piped to the service log file. Each check type should have an icon that represents it in the UI (/status) which would be GREEN if successful and RED if failed.

- core:

  - type check
  - lint
  - build (production)
  - validate .env exists and is configured for: redis, one of the OAUTH endpoints
- bernard-agent:

  - type check
  - lint
  - build (production)
  - langgraph.json is present and configured for bernard_agent
- bernard-ui:

  - type check
  - lint
  - build (production)

- Redis:

  - docker or podman is installed
- Kokoro:

  - model file(s) exist
- Whisper:

  - model file(s) exist

## Caching

The results of the service checks should be preserved in localStorage and cleared whenever the service is detected to have restarted.
