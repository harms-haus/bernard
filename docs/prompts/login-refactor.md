# Login refactor

Refactor the oauth login process:

1. move all login UI and logic to core/
2. use these routes:
   - `/auth/login`: login page
   - `/auth/github/callback`: github callback
   - `/auth/google/callback`: google callback
   - `/api/auth/login`: login endpoint
   - `/api/auth/logout`: logout endpoint
