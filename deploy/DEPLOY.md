# Docker deployment — Hostinger KVM 8 (Ubuntu)

Production deployment for the DMFT Survey stack:

| Service | Role | Exposed to internet? |
|---------|------|----------------------|
| **nginx** | Single entry on **port 3000** (configurable) | Yes — only public port |
| **web** | Next.js UI | No — internal `web:3000` |
| **api** | Express API | No — internal `api:3001` |
| **mongodb** | Survey data | No |
| **redis** | Cache / idempotency | No |

### How traffic flows

```text
Browser  http://YOUR_VPS:3000/
            │
            ▼
         nginx :80  (mapped to host :3000)
            ├── /           →  web:3000   (UI)
            ├── /api/...    →  api:3001   (API)
            ├── /health     →  api:3001
            └── /docs       →  api:3001
```

The frontend is built with `NEXT_PUBLIC_API_URL=http://YOUR_VPS:3000`, so the browser calls `/api/v1/...` on the **same port**; nginx forwards those requests to the API container. The API never needs a public port.

Object storage (MinIO) is **not** included in production yet. The API boots without it and logs that attachments are disabled until you add file storage later.

Architecture matches the API graph hubs: `SessionsService`, `SessionEntriesService`, MongoDB (`connectDB`), and Redis (`isRedisReady`).

## Server prerequisites

**Hostinger KVM 8** (8 vCPU, 32 GB RAM) is sufficient for this stack with the resource limits in `docker-compose.prod.yml`.

On a fresh **Ubuntu 22.04/24.04** VPS:

1. Open firewall port **3000** (and `22` for SSH). Optionally `80`/`443` later for TLS.
2. Point DNS at the VPS only if using a domain (you can start with `http://VPS_IP:3000`).

```bash
cd /home/ubuntu/surveymaster/survermasterapiv1/deploy
sudo bash scripts/install-docker.sh
```

```text
/home/ubuntu/surveymaster/
  survermasterapiv1/     # API repo
  surveymasterappv1/     # frontend repo
```

Set `APP_BUILD_CONTEXT=../../surveymasterappv1` in `.env.production` (default in the example file).

## Configure environment

```bash
cd /home/ubuntu/surveymaster/survermasterapiv1/deploy
cp .env.production.example .env.production
nano .env.production
```

Required changes:

- Replace every `CHANGE_ME_*` secret (use long random passwords).
- Set `APP_DOMAIN`, `NEXT_PUBLIC_API_URL`, and `CORS_ORIGINS` to your VPS URL with port, e.g. `http://203.0.113.10:3000` (all three should match the origin users open in the browser).
- `REDIS_PASSWORD` must be **at least 12 characters** (enforced by API in production).
- `INTERNAL_API_TOKEN` protects `/ready` and `/metrics` when set.
- Do **not** set MinIO variables unless you add MinIO to the compose file.

## Start the stack

```bash
chmod +x scripts/up.sh
./scripts/up.sh
```

Or manually:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:3000/health
```

Open the app: `http://YOUR_VPS_IP:3000`

## HTTPS (Let's Encrypt) — optional later

When you move to a domain on ports 80/443, add `"80:80"` and `"443:443"` to the nginx `ports` section in `docker-compose.prod.yml`, then:

1. Edit `nginx/conf.d/https.conf.example` with your domain; copy to `https.conf`.
2. Obtain certificate (one-time):

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d survey.example.com \
  --email you@example.com \
  --agree-tos \
  --no-eff-email
```

3. Reload nginx:

```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

4. Enable auto-renewal:

```bash
docker compose -f docker-compose.prod.yml --profile ssl up -d certbot
```

## URL map (production on port 3000)

| URL | Target |
|-----|--------|
| `http://YOUR_VPS:3000/` | Next.js UI |
| `http://YOUR_VPS:3000/api/v1/...` | Express API |
| `http://YOUR_VPS:3000/health` | API liveness |
| `http://YOUR_VPS:3000/docs` | Scalar API reference |

Frontend build bakes in `NEXT_PUBLIC_API_URL` at image build time. After changing it, rebuild the web image:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build web
docker compose -f docker-compose.prod.yml --env-file .env.production up -d web
```

## Operations

**Logs**

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web nginx
```

**Restart after code deploy**

```bash
git -C /home/ubuntu/surveymaster/survermasterapiv1 pull
git -C /home/ubuntu/surveymaster/surveymasterappv1 pull
./scripts/up.sh
```

**Backup MongoDB**

```bash
docker exec dmft-mongodb mongodump \
  --username="$MONGO_INITDB_ROOT_USERNAME" \
  --password="$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase=admin \
  --db=dmft_survey \
  --archive=/data/db/backup-$(date +%F).archive
docker cp dmft-mongodb:/data/db/backup-$(date +%F).archive ./backups/
```

**Persisted volumes**

- `mongodb_data`, `redis_data` — data stores
- `api_uploads` — temporary multer uploads on disk (if used before MinIO)
- `certbot_certs` — TLS certificates

## Adding file storage later (MinIO)

When you need photo/file uploads:

1. Restore the `minio` service in `docker-compose.prod.yml` (see git history).
2. Add `nginx/conf.d/storage.conf` from `storage.conf.example`.
3. Set MinIO env vars in `.env.production`.
4. Point `storage.yourdomain.com` DNS at the VPS and include it in the TLS cert.

Until then, local dev can still use `db.yml` / `docker-compose.yml` with MinIO.

## Local development vs production

| Concern | Local (`db.yml` / `docker-compose.yml`) | Production (`deploy/docker-compose.prod.yml`) |
|---------|----------------------------------------|---------------------------------------------|
| MinIO | Optional for dev | Not deployed |
| DB ports exposed | Yes (27017, 6379, 9000) | No (internal network only) |
| TLS | No (port 3000) | Optional nginx + certbot on 80/443 later |
| API build | `pnpm dev` on host | Multi-stage `Dockerfile` |
| Frontend | `pnpm dev` on host | Next.js `standalone` image |

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API exits on boot | `docker logs dmft-api` — usually bad `MONGODB_URI` or short `REDIS_PASSWORD` |
| CORS errors in browser | `CORS_ORIGINS` must include exact UI origin (scheme + host) |
| Autosave 400 loop | Ensure API + app images are current (dense answers patch) |
| "Object storage is not configured" in logs | Expected until MinIO is added; safe to ignore |

## Security notes

- Do not commit `.env.production`.
- Rotate secrets if `.env` was ever exposed.
- Set `INTERNAL_API_TOKEN` before exposing `/ready` or `/metrics` beyond localhost.
