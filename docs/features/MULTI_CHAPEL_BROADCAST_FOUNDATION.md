# Multi-Chapel Broadcast Foundation

One canonical `livestream` section now powers the homepage, Sermons live state,
the dedicated Broadcast Hub, chapel pages and the SERMONS → LIVE NOW navigation
transformation.

The Sermons archive remains unified. Chapel selectors are temporary and appear
only when multiple chapels are simultaneously live.

Broadcast Admin saves continue through the hardened CMS RPC. No direct browser
table writes are restored.

Chapel-scoped content-manager enforcement is intentionally the next security
substage because it requires resource-level database RPCs, not UI-only hiding.
