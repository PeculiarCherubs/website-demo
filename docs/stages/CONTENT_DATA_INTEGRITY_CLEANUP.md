# Content & Data Integrity Cleanup

## Scenario

The application architecture is now substantially safer:

- CMS schemas have been stabilized.
- Supabase is the live source of truth.
- Chapel records have canonical ownership.
- CMS writes are protected by Supabase Auth, an explicit `cms_admins` allowlist, table grants, and RLS.

The remaining question is no longer primarily technical:

> Is the content itself safe, verified, and intentional?

A structurally valid content record can still be unsuitable for production if it contains placeholder identities, generated media, dummy financial destinations, incomplete links, or duplicated data.

---

## Intent

This cleanup separates three categories:

1. **Known unsafe placeholders** — values that should never be presented as real.
2. **Incomplete content requiring human verification** — content that may be valid but cannot be verified from the repository alone.
3. **Verified/structured content** — content that can remain untouched.

No names, bank details, leadership records, sermon speakers, or official URLs are invented by this cleanup.

---

## Repository Fallback Decision

Because `site-content.json` is now fallback-only, it must be safe enough to display during a Supabase outage.

The following exact placeholder data has been removed from repository fallback:

### Giving

Removed known dummy account numbers:

- `1012345678`
- `0123456789`
- `5070123456`
- `5080123456`
- `5090123456`

Removed dummy WhatsApp number:

- `2348000000000`

If no verified transfer destination remains, fallback now displays a safe unavailable/contact-office message rather than invented payment instructions.

### Testimonials

Testimonials named exactly `Member Name` were removed from fallback.

The public homepage hides the Testimonials section if there are no verified testimonial records.

### Sermons

Sermons whose speaker is exactly `Pastor Name` were removed from fallback.

The homepage sermon section and Sermons listing section hide if there are no verified sermon records.

### Event social feed

Items explicitly marked as generated placeholders or using `Website Placeholder` were removed from fallback.

The existing Events empty-state mechanism is used instead.

### Leadership

No leadership names were invented.

If the fallback leadership team is empty, the Leadership section is hidden rather than displaying an empty public section.

### WhatsApp confirmation link

The public JavaScript no longer invents `2348000000000` when the CMS/fallback does not supply a number.

If no approved number exists, the notification link is hidden.

---

## Live Supabase Decision

Supabase is authoritative, so repository cleanup does not automatically modify live CMS data.

A read-only audit is included:

`supabase/audits/content-data-integrity-audit.sql`

It checks live data for:

- dummy Giving account numbers
- dummy Giving WhatsApp number
- placeholder testimonials
- placeholder sermon speakers
- generated Event social-media placeholders
- leadership team count
- Bible College `#` links
- Chapel canonical ownership
- duplicate IDs in important editable arrays

An optional exact-value cleanup script is also included:

`supabase/audits/exact-placeholder-live-cleanup.sql`

It removes only the exact known placeholder values. It deliberately does not invent replacement content.

The audit should be run first. The cleanup script should only be run after reviewing the results and exporting the affected live rows.

---

## Items Requiring Human Verification

The repository alone cannot determine whether the following are approved production content:

- Bible College course names and programme descriptions
- Bible College registration/portal URLs currently represented by `#`
- current leadership names/photos if Supabase contains them
- real sermon media, speakers, categories, and durations
- real testimonials and permission to publish them
- real Giving bank/payment destinations
- approved WhatsApp/contact destinations
- current event/social links
- future chapel launch statements
- publication editorial content and dates

These are flagged for review rather than silently changed.

---

## CSS

The user-supplied current `styles.css` is preserved verbatim in this build.

CSS/UI cleanup remains a separate future feature.

---

## Completion Rule

This workstream is complete only after:

1. repository fallback contains no known dangerous placeholder destinations;
2. live Supabase audit has been run;
3. known live placeholder values are either removed or deliberately approved;
4. sensitive public destinations such as Giving details are verified;
5. incomplete production content has an explicit keep/replace/remove decision.

## Bible College Placeholder-Link Decision

The live audit confirmed four unavailable Bible College destinations:

- three student-portal actions with `href: "#"`
- one registration action with `href: "#"`

These are known placeholders, not missing URLs to infer.

Decision:

- do not invent replacement destinations;
- keep future actions visible as disabled **Coming Soon** controls;
- replace `#` destinations with an empty href / `comingSoon` state;
- keep registration visible as **Coming Soon** until a real approved URL exists;
- render course-detail actions as **Coming Soon** until a course has a real `href`.

The targeted live cleanup is:

`supabase/audits/bible-college-placeholder-link-cleanup.sql`

## Leadership Data Decision

Leadership is a dynamic CMS collection, not a fixed list of predefined offices.

The Admin Portal already supports:

- adding a new leader/personnel record;
- entering any leadership position/title as free text;
- editing existing names and offices;
- deleting obsolete records;
- adding an optional portrait image.

Therefore the Content & Data Integrity stage must not hard-code six leadership
slots or assume the current six placeholder offices are exhaustive.

The current live records that use role labels as `name` values should be
corrected through the CMS. Additional real leadership offices can be added
through **Leadership Team → Add Leader / Personnel**.

A read-only audit is included:

`supabase/audits/leadership-content-audit.sql`

No destructive or fixed-office leadership migration is included.
