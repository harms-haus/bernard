# Better Auth Test Demo

This project is a Next.js application demonstrating the integration of [Better Auth](https://better-auth.com/) with SQLite and Tailwind CSS.

## Features

- **Authentication**: Email and Password scheme.
- **Database**: SQLite (via `better-sqlite3`).
- **Authorisation**: Role-based access control with an Admin plugin.
- **Pages**:
  - `/bernard/hello`: Publicly accessible page.
  - `/bernard/user`: Protected page (requires login).
  - `/bernard/admin`: Admin-only page (requires `admin` role).
  - `/auth/login`: Custom login and registration UI.
  - `/auth/logout`: Sign out functionality.
- **API**:
  - `/api/auth/*`: Better Auth handlers.
  - `/api/admin`: Example admin-restricted API endpoint.

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file (one has been provided for you):
   ```env
   BETTER_AUTH_SECRET=<your-secret>
   BETTER_AUTH_URL=http://localhost:3456
   NEXT_PUBLIC_APP_URL=http://localhost:3456
   ```

3. **Database Migration**:
   Run the following to initialize the SQLite database:
   ```bash
   npx @better-auth/cli migrate
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```

## Testing Roles

By default, new users do not have the `admin` role. To test the admin page:
1. Sign up a new user via `/auth/login`.
2. Update the user's role in the `auth.db` database to `admin`.
   - You can use a SQLite explorer or the `@better-auth/cli` if available.
   - Alternatively, you can add your user ID to the `adminUserIds` array in `src/lib/auth.ts`.

## Tech Stack

- **Framework**: Next.js 15+
- **Auth**: Better Auth
- **DB**: SQLite
- **Styling**: Tailwind CSS
- **Design**: Premium Dark Mode
