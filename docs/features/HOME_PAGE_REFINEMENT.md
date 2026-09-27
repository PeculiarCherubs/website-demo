# Home Page Refinement

## Homepage order

The Senior Pastor section appears before Our Ministries.

## Conditional Live Mode

The homepage does not carry an always-visible `Live Now` button.

Instead, the hero supports a conditional embedded YouTube live-stream mode.

### Normal state

When Live Mode is disabled, the homepage keeps the normal slideshow hero.

### Live state

When an authorized Site Settings editor:

1. pastes the specific YouTube live-video URL;
2. enables **Live stream is active**;
3. saves;

the homepage hero changes to a responsive live layout and embeds the stream
directly using YouTube's privacy-enhanced embed domain.

A `Watch on YouTube` link remains inside the live panel as a fallback.

When the service ends, the editor turns Live Mode off and the normal slideshow
hero returns.

### Why this is the current sustainable approach

The site is a static frontend backed by Supabase. Manual Live Mode:

- has no YouTube API key to expose;
- has no polling/quota dependency;
- cannot falsely claim the church is live because an API result is stale;
- works with the CMS/RBAC architecture already in place;
- keeps YouTube out of every normal homepage load when the church is offline.

### Future automatic detection

Automatic live detection can be added later through a server-side/cached
Supabase Edge Function using the YouTube Data API.

It should not poll YouTube from every visitor's browser. The server-side
integration should hold the API credential, cache live status, and make the
homepage consume only the cached result.

Manual Live Mode should remain available as an override even after automation
is introduced.
