# Docker deployment — Hostinger KVM 8 (Ubuntu)

Production deployment for the DMFT Survey stack:

| Service | Role | Internal port |
|---------|------|----------------|
| **nginx** | TLS termination, reverse proxy | 80 / 443 |
| **web** | Next.js survey UI | 3000 |
| **api** | Express API (`/api/v1`, `/health`, `/docs`) | 3001 |
| **mongodb** | Sessions, entries, survey data | 27017 |
| **redis** | Cache, idempotency | 6379 |
| **minio** | S3-compatible file storage | 9000 |

Architecture matches the API graph hubs: `SessionsService`, `SessionEntriesService`, MongoDB (`connectDB`), Redis (`isRedisReady`), and MinIO/S3 (`readStorageConfig`).

## Server prerequisites

**Hostinger KVM 8** (8 vCPU, 32 GB RAM) is sufficient for this stack with the resource limits in `docker-compose.prod.yml`.

On a fresh **Ubuntu 22.04/24.04** VPS:

1. Point DNS A records to the VPS IP:
   - `survey.example.com` → app + API (via nginx)
   - `storage.example.com` → MinIO (presigned upload/download URLs)
2. Open firewall ports: `22`, `80`, `443` (UFW or Hostinger firewall).
3. Install Docker:

```bash
cd /opt
sudo git clone <your-api-repo-url> surveymaster2026/api
sudo git clone <your-app-repo-url> surveymaster2026/app
cd surveymaster2026/api/deploy
sudo bash scripts/install-docker.sh
```

Expected directory layout:

```text
/opt/surveymaster2026/
  api/          # this repository
  app/          # Next.js frontend (sibling of api)
```

## Configure environment

```bash
cd /opt/surveymaster2026/api/deploy
cp .env.production.example .env.production
nano .env.production
```

Required changes:

- Replace every `CHANGE_ME_*` secret (use long random passwords).
- Set `APP_DOMAIN`, `STORAGE_DOMAIN`, `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`, `MINIO_PUBLIC_ENDPOINT`, and keep `MINIO_ENDPOINT` internal (`http://minio:9000` in compose).
- `REDIS_PASSWORD` must be **at least 12 characters** (enforced by API in production).
- `INTERNAL_API_TOKEN` protects `/ready` and `/metrics` when set.

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
curl -fsS http://127.0.0.1/health
```

## HTTPS (Let's Encrypt)

1. Ensure HTTP works on port 80 first.
2. Edit `nginx/conf.d/https.conf.example` and `nginx/conf.d/storage.conf.example` with your domains; copy them to `https.conf` and `storage.conf`.
3. Obtain certificates (one-time):

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d survey.example.com \
  -d storage.example.com \
  --email you@example.com \
  --agree-tos \
  --no-eff-email
```

4. Reload nginx:

```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

5. Enable auto-renewal:

```bash
docker compose -f docker-compose.prod.yml --profile ssl up -d certbot
```

## URL map (production)

| URL | Target |
|-----|--------|
| `https://survey.example.com/` | Next.js UI |
| `https://survey.example.com/api/v1/...` | Express API |
| `https://survey.example.com/health` | API liveness |
| `https://survey.example.com/docs` | Scalar API reference |
| `https://storage.example.com/...` | MinIO (presigned URLs) |

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
git -C /opt/surveymaster2026/api pull
git -C /opt/surveymaster2026/app pull
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

- `mongodb_data`, `redis_data`, `minio_data` — data stores
- `api_uploads` — temporary/persistent multer uploads
- `certbot_certs` — TLS certificates

## Local development vs production

| Concern | Local (`db.yml` / `docker-compose.yml`) | Production (`deploy/docker-compose.prod.yml`) |
|---------|----------------------------------------|---------------------------------------------|
| DB ports exposed | Yes (27017, 6379, 9000) | No (internal network only) |
| TLS | No | nginx + certbot |
| API build | `pnpm dev` on host | Multi-stage `Dockerfile` |
| Frontend | `pnpm dev` on host | Next.js `standalone` image |

## Troubleshooting

| Symptom | Check |
|---------|--------|
| API exits on boot | `docker logs dmft-api` — usually bad `MONGODB_URI` or short `REDIS_PASSWORD` |
| CORS errors in browser | `CORS_ORIGINS` must include exact UI origin (scheme + host) |
| Upload presign fails | `MINIO_ENDPOINT` must match public storage URL; bucket created on API boot |
| Autosave 400 loop | Ensure API + app images are current (dense answers patch) |

## Security notes

- Do not commit `.env.production`.
- Rotate secrets if `.env` was ever exposed.
- Keep MinIO console (`9001`) off the public internet (not published in prod compose).
- Set `INTERNAL_API_TOKEN` before exposing `/ready` or `/metrics` beyond localhost.
