# DMFT Survey Tool - Package Guide

This document defines the dependency baseline for the local DMFT survey collection system.
The repository currently contains the backend package in `api/`. The frontend should be a separate sibling package, for example `web/`.

Use pnpm for all package operations.

## Backend Package: `api/`

### 1) Core API Framework

```bash
pnpm add express cors helmet compression cookie-parser morgan express-rate-limit express-mongo-sanitize hpp
```

### 2) Environment And Runtime Control

```bash
pnpm add dotenv dotenv-expand
```

### 3) Database, Cache, And Storage

MongoDB stores sessions, forms, entries, exports, and merge metadata. Redis supports idempotency, short-lived locks, and cache helpers. MinIO is accessed through the AWS S3-compatible SDK.

```bash
pnpm add mongodb mongoose ioredis @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 4) Simple Edit-Key Security

`bcrypt` hashes the per-session edit key. Do not add full user auth unless the product scope changes.

```bash
pnpm add bcrypt
```

### 5) Uploads And Import/Export

`multer` handles EOD merge upload files. JSON is the primary export format.

```bash
pnpm add multer
```

### 6) Validation, Responses, And Utilities

```bash
pnpm add zod date-fns uuid winston chalk
```

### 7) API Documentation

```bash
pnpm add swagger-jsdoc swagger-ui-express @scalar/express-api-reference
```

### 8) Backend Runtime Install (One Shot)

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @scalar/express-api-reference bcrypt chalk compression cookie-parser cors date-fns dotenv dotenv-expand express express-mongo-sanitize express-rate-limit helmet hpp ioredis mongodb mongoose morgan multer swagger-jsdoc swagger-ui-express uuid winston zod
```

### 9) Backend Developer Tooling

```bash
pnpm add -D typescript ts-node tsx tsc-alias tsconfig-paths cross-env vitest supertest eslint @antfu/eslint-config eslint-plugin-format prettier husky @commitlint/cli @commitlint/config-conventional knip @faker-js/faker @types/bcrypt @types/compression @types/cookie-parser @types/cors @types/express @types/hpp @types/morgan @types/multer @types/node @types/swagger-jsdoc @types/swagger-ui-express
```

## Frontend Package: `web/`

Create this as a sibling of `api/` when frontend development starts.

### 1) Next.js And React

```bash
pnpm create next-app@latest web --ts --tailwind --eslint --app --src-dir --import-alias "@/*"
```

### 2) React Query

```bash
cd web
pnpm add @tanstack/react-query
```

### 3) shadcn/ui Support Packages

```bash
pnpm add lucide-react class-variance-authority clsx tailwind-merge
pnpm dlx shadcn@latest init
```

Add components as needed:

```bash
pnpm dlx shadcn@latest add button input table textarea select dialog alert card badge separator
```

### 4) Frontend API Client Utilities

Use the native `fetch` API wrapped by small typed helpers. Do not add Axios unless the frontend needs request interceptors or multipart progress UI.

## Dependency Chart

| Dependency | Package | Why |
| --- | --- | --- |
| express | backend | HTTP server and route mounting under `/api/v1`. |
| cors | backend | Allow local frontend origin with credentials. |
| helmet | backend | Secure HTTP headers. |
| express-rate-limit | backend | Abuse protection for mutation routes. |
| express-mongo-sanitize | backend | NoSQL injection protection. |
| hpp | backend | HTTP parameter pollution protection. |
| compression | backend | Response compression. |
| cookie-parser | backend | Cookie parsing if later needed by admin/session helpers. |
| morgan | backend | HTTP request logging. |
| dotenv, dotenv-expand | backend | Local environment loading. |
| mongodb, mongoose | backend | MongoDB driver and ODM. |
| ioredis | backend | Redis client for idempotency, locks, and cache. |
| @aws-sdk/client-s3 | backend | MinIO/S3-compatible object storage client. |
| @aws-sdk/s3-request-presigner | backend | Presigned import/export object URLs. |
| bcrypt | backend | Edit-key hashing. |
| multer | backend | Multipart JSON upload handling for EOD merge. |
| zod | backend | Request validation. |
| date-fns | backend | Date helpers for export metadata and timestamps. |
| uuid | backend | Stable public IDs and slugs where needed. |
| winston | backend | Structured app logging. |
| chalk | backend | Local CLI/log color helpers. |
| swagger-jsdoc | backend | OpenAPI extraction from route JSDoc. |
| swagger-ui-express | backend | Swagger UI endpoint. |
| @scalar/express-api-reference | backend | Scalar API reference endpoint. |
| next, react, react-dom | frontend | Next.js App Router UI. |
| @tanstack/react-query | frontend | API server state, mutations, retries, cache invalidation. |
| shadcn/ui support packages | frontend | Survey table UI components and styling utilities. |

## Explicitly Out Of Scope Packages

Do not add these unless the PRD changes:

- `@anthropic-ai/sdk`
- `apify-client`
- `socket.io`
- `nodemailer`
- `sharp`
- `xlsx`
- `better-auth`
- `bullmq`

## Scripts Baseline

Backend:

```bash
cd api
pnpm dev
pnpm build
pnpm start
pnpm typecheck
pnpm lint
pnpm test
pnpm check
```

Frontend, after `web/` exists:

```bash
cd web
pnpm dev
pnpm build
pnpm lint
```
