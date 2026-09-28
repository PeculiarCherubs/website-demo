# About Page Refinement

## Editorial Our Story treatment

The Our Story section now uses a newspaper/magazine-style editorial layout.

The highlighted Scripture is rendered as a pull quote inside the story body,
rather than as a separate standalone card. On desktop it floats to the right
and the story copy wraps naturally around it.

The first paragraph also uses a restrained drop cap to strengthen the editorial
feel.

Story copy remains justified on larger screens. On smaller screens the pull
quote returns to normal document flow and paragraphs switch back to left
alignment for readability.

No CMS schema or Supabase migration is required. Existing
`about.story.paragraphs` and `about.story.quote` data are reused.
