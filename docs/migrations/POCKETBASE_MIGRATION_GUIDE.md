# PocketBase Migration & Switchover Guide

This guide describes how to deploy PocketBase, configure the necessary collections, migrate site content, and switch the Peculiar Cherubs website and CMS from Supabase to PocketBase using the built-in 1-click BaaS switchover.

---

## 1. PocketBase Deployment

PocketBase is a single-binary backend consisting of an embedded SQLite database with real-time subscriptions, file storage, and authentication.

### Option A: Docker Deployment
```yaml
# docker-compose.yml
version: '3.8'
services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    container_name: pdcm-pocketbase
    restart: unless-stopped
    ports:
      - "8090:8090"
    volumes:
      - ./pb_data:/pb_data
    environment:
      - PB_ENCRYPTION_KEY=your-optional-32-char-encryption-key
```
Run `docker compose up -d`.

### Option B: Direct Binary
1. Download the PocketBase binary for your OS from [pocketbase.io](https://pocketbase.io/docs/).
2. Run `./pocketbase serve --http="0.0.0.0:8090"`.

---

## 2. PocketBase Schema & Collections

Access the PocketBase Admin UI at `http://your-server:8090/_/` and create the following collections:

### 2.1 Collection: `site_content`
- **Type**: Base Collection
- **Fields**:
  - `key` (Text, Unique, Required, Nonempty): The section identifier (e.g. `home`, `about`, `ministries`, `sermons`, `chapels`, `give`, etc.).
  - `data` (JSON, Required): The JSON content object for the section.
  - `updated_by` (Text, Optional): The User ID of the administrator who made the update.
  *(Note: Concurrency tracking uses PocketBase's built-in `updated` ISO timestamp, mirroring Supabase's `updated_at` column).*
- **API Rules**:
  - **List / Search Rule**: `""` (Publicly accessible to everyone)
  - **View Rule**: `""` (Publicly accessible to everyone)
  - **Create Rule**: `@request.auth.id != ""` (Authenticated CMS administrators only)
  - **Update Rule**: `@request.auth.id != ""` (Authenticated CMS administrators only)
  - **Delete Rule**: `@request.auth.role = "super_admin"` (Super Admin only)

### 2.2 Collection: `users` (System Auth Collection)
PocketBase provides the `users` auth collection out of the box. Add the following custom fields:
- `role` (Select or Text): Options: `super_admin`, `editor`, `chapel_manager`.
- `chapel_scopes` (JSON or Text): Optional array of assigned chapel slugs (e.g. `["gwarinpa", "byazhin"]`).

---

## 3. Data Migration from Supabase to PocketBase

You can populate PocketBase directly from `website-demo/content/site-content.json` using a migration script:

```javascript
// scripts/migrate-to-pocketbase.js
const fs = require('fs');
const content = JSON.parse(fs.readFileSync('content/site-content.json', 'utf8'));

const PB_URL = 'http://127.0.0.1:8090';
const ADMIN_TOKEN = 'YOUR_POCKETBASE_SUPERUSER_TOKEN';

async function migrate() {
  for (const [sectionKey, sectionData] of Object.entries(content)) {
    if (sectionKey.startsWith('_')) continue;

    console.log(`Migrating section: ${sectionKey}...`);
    const resp = await fetch(`${PB_URL}/api/collections/site_content/records`, {
      method: 'POST',
      headers: {
        'Authorization': ADMIN_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        key: sectionKey,
        data: sectionData
      })
    });

    if (resp.ok) {
      console.log(`  ✅ Section '${sectionKey}' imported.`);
    } else {
      console.warn(`  ⚠️ Failed '${sectionKey}':`, await resp.text());
    }
  }
}
migrate();
```

---

## 4. One-Click Switchover in Production

Once your PocketBase instance is online:

1. Log into the CMS Admin Portal at `/admin/index.html` as a Super Admin.
2. In the left navigation, click **⚙️ BaaS Settings**.
3. Under the **PocketBase (Go / SQLite)** card:
   - Enter your Server URL (e.g. `https://127.0.0.1:8090`).
   - Confirm the Content Collection name (`site_content`).
   - Confirm the Users Collection name (`users`).
4. Click **🔍 Test Connection**:
   - The system executes a live `/api/health` check and verifies the `site_content` collection schema.
   - You will see a green confirmation: `Connection and schema verified successfully (~45ms)`.
5. Click **🚀 Set as Active BaaS**:
   - The active provider switches to PocketBase immediately.
   - All public pages, live sections, and CMS mutations will now communicate with PocketBase.
   - The active badge changes to `POCKETBASE`.

---

## 5. Instant Rollback Procedure

If you ever need to rollback to Supabase:
1. In the CMS Admin Portal, navigate to **⚙️ BaaS Settings**.
2. Under **Supabase**, click **🚀 Set as Active BaaS**.
3. The system instantly switches all queries and mutations back to Supabase with zero downtime.

---

## 6. Offline / Outage Protection

If both backends or any active provider encounters an outage or network disconnect:
- The integrated **Circuit Breaker** automatically trips, preventing 5-second connection hangs.
- Public web pages immediately fall back to local `content/site-content.json` without user disruption.
- The Admin Portal displays a clear toast notification that the live backend is unreachable and enters protected read-only mode to prevent data corruption.
