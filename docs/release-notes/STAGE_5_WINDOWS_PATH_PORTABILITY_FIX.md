# Stage 5 — Windows Path Portability Fix

The Windows path bug in `check-stage5-admin-scope-wiring.mjs` was reintroduced
when the later role/scope transition build was generated from an artifact that
still contained the earlier URL-pathname implementation.

Unsafe:

```js
path.dirname(new URL(import.meta.url).pathname)
```

On Windows this can turn `/C:/Users/...` into an invalid path such as
`C:\C:\Users\...`, causing `ENOENT`.

Fixed:

```js
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

A portability regression checker now scans the other Cloudflare scripts and is
run automatically by the Stage 5 scope checks.

This is a checker/tooling fix only; it does not alter CMS runtime, D1 data,
authentication, roles, or chapel authorization.
