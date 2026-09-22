# Stage 1 — CMS Schema Stabilization

This build stabilizes Admin CRUD against the schemas used by the public website.

## Fixed

- Events Admin now edits/saves `startDate`, `endDate`, `startTime`, `endTime`, `location`, `allDay`, `published` and preserves unexposed rich fields.
- Sermons now have stable IDs; Admin preserves the public fields `category`, `duration`, `image` while retaining optional richer fields.
- House Fellowships now have stable IDs and can be edited reliably.
- Ministries/Chapels Admin now writes to canonical `ministries.details`, updates `ministries.groups`, and synchronizes `chapels.current`.
- Sunday School saves now preserve rich fields such as memory-verse context, Scripture texts, outline metadata, discussion hints, class flow and prayer points unless explicitly edited.
- Sunday School `targetAudience` is no longer overwritten by duration.
- Devotion and Goodnews form fields now use unique DOM IDs, preventing hidden Devotion inputs from hijacking Goodnews saves.
- Modal CRUD no longer shows a success state when Supabase synchronization returns failure.

## Deliberately not changed in Stage 1

- Supabase/source-of-truth architecture.
- Repository migration controls.
- Financial/placeholder content.
- Repository cleanup.
- CSS/UI standardization.
- Production authentication/RLS.
