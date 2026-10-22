# Sounds

pnpm workspace containing the Sounds applications. The repository currently
contains the NestJS backend and a placeholder directory for the frontend.
The frontend application has not been initialized yet.

## Structure

```text
apps/
  api/
    src/                 # Backend source and generated Prisma Client
    test/                # End-to-end tests
    prisma/              # Schema, migrations and RBAC seed
    scripts/             # Auth session integration checks
    package.json         # Backend dependencies and scripts
    prisma.config.ts
    nest-cli.json
    tsconfig.json
    tsconfig.build.json
    eslint.config.mjs
  ui/                    # Frontend placeholder (not initialized yet)
package.json             # Workspace commands
pnpm-workspace.yaml      # Workspace packages and dependency build permissions
pnpm-lock.yaml           # Shared dependency lockfile
.prettierrc              # Shared formatting settings
```

## Setup

Use pnpm with support for the workspace `allowBuilds` setting (the migration
was verified with pnpm 12.9.1). Run commands from the repository root:

```bash
pnpm install --frozen-lockfile
```

Create `apps/api/.env` using the example in `apps/api/.env.example`:

```bash
DATABASE_URL="postgresql://postgres:<password>@HOST:PORT/DATABASE"
JWT_SECRET="<strong-random-secret>"
JWT_EXPIRES_IN="1d"
```

When migrating an existing checkout, move your root `.env` to `apps/api/.env`.
The API loads its environment from its own working directory, including when
started through the root scripts.

Apply database migrations, generate Prisma Client and seed the RBAC roles and
permissions:

```bash
pnpm prisma:migrate
pnpm prisma:generate
pnpm seed:rbac
```

The RBAC seed is idempotent. Prisma commands are executed inside `apps/api`.
For other Prisma operations, use `pnpm --filter api exec prisma <command>`.

## Development

```bash
pnpm dev                 # API with file watching (port 3000 by default)
pnpm build               # Build workspace applications
pnpm start:prod          # Run the compiled API
```

The existing `start`, `start:dev` and `start:debug` commands also remain
available from the repository root. To run a command directly for the backend:

```bash
pnpm --filter api build
pnpm --filter api exec jest --runInBand
```

## Checks

```bash
pnpm devtest             # Backend lint, build and unit tests
pnpm test                # Unit tests
pnpm test:cov            # Unit tests with coverage
pnpm test:e2e            # End-to-end tests (requires database configuration)
pnpm test:auth-sessions  # Auth integration checks (creates a temporary database)
pnpm format              # Format backend source and tests
```

Build output and test coverage are written to `apps/api/dist` and
`apps/api/coverage`. Backend dependencies belong in `apps/api/package.json`;
the root package manages the workspace commands.
