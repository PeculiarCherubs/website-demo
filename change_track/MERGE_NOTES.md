# Publications Merge — Integration Notes

This folder combines the two parallel branches instead of choosing one wholesale.

## Kept from the structured publication-blog branch
- `publications.html` as the primary publications landing/archive page
- Featured publication
- Category filters and search
- Reusable `publication.html?slug=...` article shell
- Goodnews, devotion and Sunday School article templates
- Related publications
- Existing lectionary
- Event-media placeholder behavior

## Kept from the parallel develop work
- Dedicated `sunday-school.html?lesson=...` interactive study experience
- Teacher Mode
- Memory-verse practice
- browser text-to-speech
- font controls
- print/PDF controls
- local saved notes
- reading progress and scrollspy
- legacy `publication-detail.html?issue=...` page for existing issue links
- ministry social handles/feed rendering
- all corresponding Sunday School, publication-detail and ministry-social CSS

## Intentional integration decisions
- `script.js` starts from the structured blog branch, then adds the parallel branch's
  Sunday School, legacy publication-detail and ministry-social features.
- The page router supports all three publication routes:
  - `publicationPost`
  - `publicationDetail`
  - `sundaySchoolDetail`
- `publications.html` exposes an **Open interactive study** link so the advanced
  Sunday School page is not orphaned.
- The generic Sunday School publication article also offers an
  **Open Interactive Sunday School** CTA.
- The old publication-detail renderer was cleaned so it no longer performs unrelated
  Sunday School/lectionary rendering on a detail page.
- `styles.css` keeps the more comprehensive parallel stylesheet and appends the
  structured blog/article styles so both feature sets coexist.

## Content data requirement
The final `content/site-content.json` must also retain BOTH data structures if they
exist in the two branches:
- `publications.blog` (structured blog posts/categories)
- `publications.sundaySchoolDetails` (interactive lesson data)
- `publications.details` (legacy issue detail data, if old links must continue working)
- `publications.lectionaryCalendar`

If Git reports a conflict in `content/site-content.json`, do not choose one whole side.
Merge those sibling keys into the same `publications` object.
