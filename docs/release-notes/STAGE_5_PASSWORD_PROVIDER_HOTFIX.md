# Stage 5 — Authentication Provider Password Hotfix

The authenticated Password button was a legacy Supabase Auth control. Under
Cloudflare Access, OTP users do not have a CMS password, while users who sign
in with the Cloudflare identity provider manage their Cloudflare account
credentials outside the Peculiar Cherubs CMS.

The Password button is now hidden whenever the Admin portal is running in
Cloudflare mode, and both password handlers fail closed if invoked directly.
The legacy Supabase password flow remains available only to the temporary
legacy provider.
