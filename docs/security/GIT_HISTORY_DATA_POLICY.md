# Git History & Sensitive Data Policy

## Policy

The git-tracked fallback must not contain real sensitive payment destinations, passwords, service-role keys, private database exports, or other secrets.

Anything committed to `content/site-content.json` should be treated as permanently visible to anyone with repository/history access.

The Supabase anon key is a public client credential by design; a service-role key must never be committed or shipped to the browser.

## History audit

The current working tree cannot prove what older commits contain.

Run from the real git clone:

```bash
git log --all -p -- content/site-content.json
git log --all -p -G 'accountNumber|whatsappConfirmPhone|service_role|password' -- .
```

If actual confidential data is found, coordinate a deliberate history rewrite with all collaborators. Do not rewrite shared history casually.

## Backups

Keep local database exports and emergency JSON backups outside git or under ignored `backups/`.
