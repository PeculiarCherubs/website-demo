# PocketBase on Fly.io — Production Go-Live Runbook

This runbook provides the end-to-end, production-ready operational guide for deploying, configuring, securing, and operating **PocketBase** on **Fly.io** as the backend service for the Peculiar Cherubs website and CMS.

---

## 1. Architectural Overview & Fundamentals

PocketBase is a single-binary backend built on Go and embedded SQLite. When deploying to Fly.io, keep these foundational rules in mind:

```text
+-------------------------------------------------------------------------+
|                              Fly.io Edge                                |
|  - Anycast Global IPs                                                   |
|  - Automatic Managed SSL/TLS (HTTPS & HTTP/2)                           |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                  Fly Machine (Single Instance / VM)                     |
|  - Docker Container running PocketBase binary                           |
|  - Internal Port: 8080                                                  |
|  - Health Checks: GET /api/health                                       |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|              Fly Persistent NVMe Volume (/pb/pb_data)                   |
|  - data.db (SQLite database with WAL mode)                              |
|  - aux.db (Logs & request metrics)                                      |
|  - /storage (Uploaded assets & media)                                   |
+-------------------------------------------------------------------------+
```

### Critical Architecture Rules:
1. **Single-Node Only (No Multi-Instance Scaling)**:
   Because SQLite uses a local file lock, **PocketBase cannot be horizontally scaled across multiple active VMs** without specialized distributed consensus (e.g., LiteFS). Run exactly **one active Machine** attached to **one Persistent Volume**.
2. **Persistent Storage is Mandatory**:
   Containers on Fly.io have ephemeral root filesystems. Without a mounted Fly volume, your database and user uploads will be lost whenever the machine restarts or deploys a new image.
3. **Always Keep 1 Instance Running (`min_machines_running = 1`)**:
   Disable aggressive auto-stop (`auto_stop_machines = "off"`) so that client requests and real-time SSE subscriptions never suffer cold-start delays.

---

## 2. Prerequisites & Local Setup

### 2.1 Install flyctl
Install the official Fly CLI on your machine:

**Windows (PowerShell):**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Verify installation:
```powershell
fly version
```

### 2.2 Authenticate with Fly.io
```powershell
fly auth login
```
*(Or set `FLY_API_TOKEN` in CI/CD environments).*

---

## 3. Container & Deployment Files

Prepare a dedicated deployment folder (or deploy from your backend directory). Create the following three configuration files:

### 3.1 `Dockerfile`
A lean Alpine-based container fetching PocketBase:

```dockerfile
FROM alpine:latest

ARG PB_VERSION=0.25.9

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    curl \
    tzdata

# Download and extract PocketBase
ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && \
    rm /tmp/pb.zip && \
    chmod +x /pb/pocketbase

# Expose internal HTTP port
EXPOSE 8080

# Start PocketBase pointing to the persistent volume mount path
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8080", "--dir=/pb/pb_data"]
```

> **Note**: If you already have custom Go hooks or local migration files, copy your local binary or `pb_migrations` directory into `/pb/` before the `CMD`.

### 3.2 `.dockerignore`
Ensure local SQLite state and temporary build artifacts are never bundled into the Docker image:

```text
pb_data
*.db
*.db-shm
*.db-wal
.git
.gitignore
.env*
node_modules
```

### 3.3 `fly.toml`
Create the Fly application definition:

```toml
app = "peculiar-pocketbase" # Replace with your globally unique app name
primary_region = "lhr"       # e.g., lhr (London), ams (Amsterdam), iad (Virginia)

[build]
  dockerfile = "Dockerfile"

[mounts]
  source = "pb_data"
  destination = "/pb/pb_data"
  initial_size = "1gb"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "requests"
    soft_limit = 200
    hard_limit = 300

[[http_service.checks]]
  grace_period = "10s"
  interval = "30s"
  method = "GET"
  timeout = "5s"
  path = "/api/health"

[vm]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

---

## 4. Step-by-Step Go-Live Deployment

### Step 1: Initialize Fly Application
From the directory containing your `Dockerfile` and `fly.toml`:

```powershell
fly launch --no-deploy
```
*If prompted to copy configuration to existing fly.toml, select Yes.*

### Step 2: Create the Persistent Volume
Create the persistent volume in your chosen primary region (e.g. `lhr`):

```powershell
fly volumes create pb_data --size 1 --region lhr
```
*Confirm with `y`. This reserves 1 GB of fast NVMe storage mounted at `/pb/pb_data`.*

### Step 3: Initial Deployment
Deploy the container to Fly:

```powershell
fly deploy
```

Watch deployment logs and confirm the machine is running:
```powershell
fly status
fly logs
```

Verify that the health check passes:
```powershell
curl https://peculiar-pocketbase.fly.dev/api/health
```
Expected response:
```json
{"code":200,"message":"API is healthy.","data":{"canBackup":true}}
```

---

## 5. PocketBase Admin & Security Configuration

### Step 1: Create the Initial Superuser / Admin
Access the PocketBase Admin UI:
```text
https://peculiar-pocketbase.fly.dev/_/
```
You will be prompted to create the initial admin account (email and password).

*Alternative via Fly SSH Console:*
```powershell
fly ssh console -C "/pb/pocketbase superuser create admin@peculiarcherubs.org YourSecurePassword123!"
```

### Step 2: Configure CORS & Allowed Origins
1. In the PocketBase Admin UI, navigate to **Settings** (`⚙️`) > **Application**.
2. Set **Application URL** to your canonical URL: `https://pb.peculiarcherubs.org` (or `https://peculiar-pocketbase.fly.dev`).
3. Under **CORS allowed origins**, add your website domains:
   - `https://peculiarcherubs.org`
   - `https://www.peculiarcherubs.org`
   - `https://peculiar-cherubs-demo.pages.dev` (or your staging/preview domain)
   - `http://localhost:3000` / `http://localhost:5500` (for local development)
4. Click **Save changes**.

### Step 3: Schema & Collection Setup
Ensure the collections required by `js/backend/pocketbaseProvider.js` exist with the proper API rules:

| Collection Name | Type | Key Fields | Read Rule (`List/View`) | Write Rule (`Create/Update/Delete`) |
| :--- | :--- | :--- | :--- | :--- |
| `site_content` | Base | `section_name` (text, unique), `content_data` (json), `schema_version` (number), `updated_by` (relation/text) | `""` (Public Read) | `@request.auth.id != ""` (Authenticated Users) |
| `users` | Auth | `email`, `name`, `avatar`, `role` | `@request.auth.id != ""` | `@request.auth.id = id` |
| `cms_roles` | Base | `user_id` (relation), `role` (text: admin/editor/viewer) | `@request.auth.id != ""` | Admin only |

> **Pro-Tip**: You can export your collection schema from local PocketBase via **Settings > Export collections** and paste the JSON into the production admin UI via **Settings > Import collections**.

### Step 4: Configure SMTP for Password Resets
Under **Settings > Mail settings**:
1. Enable **Use custom SMTP credentials**.
2. Configure your transactional email provider (Postmark, SendGrid, Amazon SES, or Brevo):
   - **SMTP Host**: `smtp.postmarkapp.com` (or equivalent)
   - **Port**: `587` (TLS)
   - **Sender Address**: `noreply@peculiarcherubs.org`
   - **Sender Name**: `Peculiar Cherubs CMS`
3. Click **Send test email** to verify delivery.

---

## 6. Frontend Integration (`website-demo`)

Once your PocketBase instance is active on Fly.io, link it with your website application.

### 6.1 Update `content/baas-config.json`
Point `providers.pocketbase.url` to your live Fly.io endpoint:

```json
{
  "activeProvider": "pocketbase",
  "providers": {
    "supabase": {
      "name": "Supabase",
      "url": "https://iyihwxtkgawphsnrxvop.supabase.co",
      "anonKey": "...",
      "tableName": "site_content",
      "fetchTimeoutMs": 4000
    },
    "pocketbase": {
      "name": "PocketBase (Fly.io)",
      "url": "https://peculiar-pocketbase.fly.dev",
      "contentCollection": "site_content",
      "usersCollection": "users",
      "fetchTimeoutMs": 4000
    }
  }
}
```

### 6.2 Test Runtime Connectivity
1. Open the website or CMS Admin portal in your browser.
2. In the DevTools Console, verify connectivity:
   ```javascript
   const adapter = window.BaaS.adapter;
   console.log('Active provider:', adapter.providerName);
   adapter.testConnection().then(res => console.log('Connection test:', res));
   ```
3. Test a public read query:
   ```javascript
   adapter.content.fetchSections().then(sections => console.log('Loaded sections:', sections));
   ```

---

## 7. Custom Domain & SSL Setup

To run PocketBase under your organization's custom subdomain (e.g., `pb.peculiarcherubs.org`):

### Step 1: Add Certificate Request to Fly
```powershell
fly certs add pb.peculiarcherubs.org
```

Fly will output the required DNS configuration records.

### Step 2: Configure DNS Records
Log in to your DNS provider (Cloudflare, Namecheap, Route 53, etc.) and add:
- **Type**: `CNAME`
- **Name**: `pb`
- **Target**: `peculiar-pocketbase.fly.dev`
- **Proxy Status**: *DNS Only / Bypass* (Fly handles TLS certificates via Let's Encrypt).

### Step 3: Verify Certificate Issuance
Check verification status:
```powershell
fly certs show pb.peculiarcherubs.org
```
Once verified, your instance will be securely accessible at `https://pb.peculiarcherubs.org`.

---

## 8. Backup Strategy & Disaster Recovery

SQLite databases require reliable backups to protect against corruption or accidental deletion.

### 8.1 Automated S3 / R2 Backups (Recommended)
PocketBase has built-in automated backups to any S3-compatible object storage:
1. In the PocketBase Admin UI, go to **Settings > Backups**.
2. Enable **Auto backups** (e.g. Cron: `0 3 * * *` for daily at 3:00 AM, retention: 7).
3. Connect an S3-compatible bucket (e.g. Cloudflare R2, AWS S3, or Backblaze B2):
   - **Endpoint**: `https://<account-id>.r2.cloudflarestorage.com`
   - **Bucket**: `peculiar-cherubs-pb-backups`
   - **Region**: `auto` (or `us-east-1`)
   - **Access Key ID & Secret Key**

### 8.2 Fly.io Volume Snapshots
Fly automatically creates daily snapshots of persistent volumes:
```powershell
fly volumes snapshots list pb_data
```
To restore a snapshot into a new volume if needed:
```powershell
fly volumes create pb_data --snapshot-id <snapshot-id> --size 1 --region lhr
```

### 8.3 Manual Ad-hoc Backup via SSH
To take an immediate local backup archive:
```powershell
fly ssh console -C "/pb/pocketbase backup create pre_migration_backup.zip"
```

---

## 9. Operations, Monitoring & Troubleshooting

### Viewing Real-Time Logs
```powershell
fly logs
```
Filter for errors:
```powershell
fly logs | Select-String "ERR"
```

### SSH into the Running Container
For maintenance, inspecting SQLite files, or running CLI commands:
```powershell
fly ssh console
```
Once connected:
```sh
ls -lh /pb/pb_data
df -h /pb/pb_data
```

### Upgrading PocketBase Version
To upgrade PocketBase:
1. Update `ARG PB_VERSION=x.y.z` in `Dockerfile`.
2. Test build locally or in a staging environment.
3. Deploy the update:
   ```powershell
   fly deploy
   ```
4. PocketBase will run any pending database migrations automatically on startup.

### Restarting the Application
```powershell
fly apps restart peculiar-pocketbase
```

---

## 10. Go-Live Verification Checklist

Before opening PocketBase to live production traffic, confirm every item below:

- [ ] Persistent volume `pb_data` created and mounted at `/pb/pb_data`.
- [ ] `auto_stop_machines = "off"` configured in `fly.toml` to prevent cold starts.
- [ ] Admin superuser created with a strong password.
- [ ] `site_content` collection exists with public read permissions (`""`).
- [ ] `users` and `cms_roles` collections configured with authenticated write permissions.
- [ ] CORS allowed origins include production website domain(s).
- [ ] SMTP settings configured and test email verified.
- [ ] Automated backups enabled (Daily S3 / R2 or Fly volume snapshots).
- [ ] Custom domain CNAME configured and SSL certificate active (`fly certs show`).
- [ ] `content/baas-config.json` updated with production PocketBase URL.
- [ ] End-to-end CMS test: Login, section content edit, publish, and public page reload.
