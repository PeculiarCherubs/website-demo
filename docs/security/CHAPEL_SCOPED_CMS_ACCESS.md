# Chapel-Scoped CMS Access

## Purpose

This stage adds resource-level authorization for chapel content managers.

A single reusable `Chapel Content Manager` role is used for every chapel.
The chapel assignment is stored separately as resource scope, so the project
does not need roles such as `Gwarinpa Manager`, `English Manager`, etc.

## Access model

User → Role → Permissions → Chapel Scope

Example:

- Role: Chapel Content Manager
- Permissions:
  - chapel.content.manage
  - sermons.manage
  - livestream.manage
- Scope:
  - pdcm-gwarinpa

The same user may be assigned multiple chapels.

## Server-side enforcement

Scope is enforced in Supabase through dedicated RPCs:

- `cms_update_chapel_content`
- `cms_update_chapel_broadcast`
- `cms_upsert_chapel_sermon`
- `cms_delete_chapel_sermon`

A scoped account cannot replace the entire shared `chapels`, `sermons` or
`livestream` sections through `cms_upsert_site_content()`.

That prevents a user from bypassing the Admin interface and editing another
chapel by crafting a request manually.

## Existing Admins

All existing CMS Admins are migrated to Global scope so the migration does not
silently remove any current access.

## Admin Access

Super Admins can assign the Chapel Content Manager role and select one or more
chapels. Other roles remain Global.

## Scoped Admin experience

A Chapel Content Manager sees:

- only assigned chapel records in Ministries & Chapels;
- only sermons belonging to assigned chapels;
- only assigned chapel broadcast channels.

They may edit assigned chapel page content but cannot delete or move the chapel
record to another content domain.
