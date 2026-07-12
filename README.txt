PECULIAR CHERUBS CONTENT-MANAGED WEBSITE

This version separates the editable website content from the HTML templates.

MAIN FILES
- index.html
- about.html
- pdcms.html
- sermons.html
- publications.html
- quick-links.html
- give.html
- styles.css
- script.js

EDITABLE CONTENT
- content/site-content.json

Most headings, paragraphs, chapel information, sermons, testimonials,
publication details, giving options, navigation labels and church details
can now be edited in content/site-content.json without changing the HTML.

IMPORTANT
Because the pages use JavaScript fetch() to load JSON, do not simply
double-click index.html. Open the project through a local or online server.

QUICK LOCAL PREVIEW

Python:
1. Open a terminal inside the project folder.
2. Run:
   python -m http.server 8000
3. Open:
   http://localhost:8000

VS Code:
Install the Live Server extension and choose "Open with Live Server".

CONTENT NOTES
- Replace the Senior Pastor placeholder name, biography and photograph.
- Replace sample testimonials with approved real testimonies.
- Replace giving placeholders with verified church details.
- Replace publication placeholders with real PDF links.
- Replace sample sermon titles, images, speakers and durations.

BRAND COLOURS
- White: #FFFFFF
- Light blue: #D6E7F4
- Navy: #162249
- Yellow: #FFFF00
- Fire red: #D7261E


BRANDED ASSET UPDATE
- Mother church logo is used in the header and footer.
- PDCM chapel cards now use chapel logo graphics instead of stock photographs.
- PDCM English Chapel and PDCM Byazhin Chapel use their supplied branded lockups.
- The generic PDCM logo is used as a placeholder for other chapels.
- The Senior Pastor photograph replaces the previous placeholder.
- The homepage hero now uses a full-screen fading slideshow.
- Slideshow image paths are editable under home.hero.slides in content/site-content.json.

TO ADD MORE HERO PHOTOS
1. Place the photographs inside assets/hero/.
2. Open content/site-content.json.
3. Add each image under home.hero.slides.


BRANDING FIX
- Removed the old placeholder seal from all internal pages.
- Mother church logo now appears consistently in every header and footer.
- Internal page heroes now use the official mother-church logo as a subtle watermark.
- The PDCM page uses the PDCM identity as its page-hero watermark.
- Sermon play buttons now illuminate, enlarge slightly, and glow on hover.


PUBLICATIONS UPDATE
- Restored the strong yellow, navy, and red publication-card system.
- Goodnews This Week now has colourful issue cards with stronger contrast.
- Added Daily Devotion.
- Added Sunday School Outline.
- All publication content is editable in content/site-content.json.


PUBLICATIONS ORDER UPDATE
- Daily Morning Devotion now appears first.
- Restored the large featured Goodnews This Week section.
- Goodnews issue archive follows the featured weekly publication.
- Sunday School Outline appears after the weekly publication archive.


INTERNAL HERO CLEANUP
- Removed the legacy .page-hero::after placeholder seal.
- Removed the pasted logo watermark from internal page heroes.
- Added a simplified cross-and-radiating-light motif instead.


CROSS AND CARD HOVER UPDATE
- Internal page heroes now use the supplied cross-and-radiance artwork.
- Removed CSS-generated cross elements from the hero decoration.
- White cards now alternate navy, red, and yellow hover backgrounds.
- Text, icons, borders, and accents invert automatically for contrast.
- Publication cards now use the same stronger hover language.


HOVER CONTRAST AND BRAND NAME FIX
- Red hover cards now change red labels and metadata to yellow.
- Standard copy changes to white for proper contrast.
- Peculiar Cherubs is now stacked on two lines in the header and footer.


BIBLE COLLEGE UPDATE
- Added a new BIBLE COLLEGE navigation tab.
- Added Christian Heritage Bible School page.
- Includes registration, classes, catch-up access, course catalogue,
  student services, academic resources and student portal placeholders.
- All Bible College wording and links can be edited in
  content/site-content.json under bibleCollege.
- Registration and student-portal links are placeholders until the
  school selects its form, learning platform or portal system.
