# Publications Blog Feature — Develop Notes

## What changed

Publications is now a structured blog rather than a set of isolated cards.

### New archive page

`publications.html`

- Featured publication
- Category filters
- Search
- Blog cards for all publication types
- Latest Daily Devotion feature
- Latest Goodnews feature
- Latest Sunday School feature
- Existing Calendar of Lectionary retained

### New reusable article page

`publication.html?slug=<post-slug>`

All publication types share the same article shell:

- Publication type
- Date
- Title
- Excerpt
- Author
- Cover
- Tags
- Article body
- Publication details
- Related publications

The inner structure changes by template:

- `goodnews` — sermon article, issue details, Sunday School, special service,
  officiating ministers and weekly Bible meditation.
- `devotion` — scripture, reflection, prayer, declaration and action point.
- `sundaySchool` — scripture, objectives, lesson outline, discussion questions
  and closing prayer.

## Editing posts

Open:

`content/site-content.json`

Then edit:

`publications.blog.posts`

Every new publication should include the common fields:

- `slug`
- `type`
- `category`
- `template`
- `date`
- `title`
- `excerpt`
- `author`
- `cover`
- `tags`
- `blocks`

Then add the template-specific object:

- `goodnews`
- `devotion`
- `sundaySchool`

No new HTML page is needed for each publication. The single `publication.html`
page renders the correct article based on the slug in the URL.
