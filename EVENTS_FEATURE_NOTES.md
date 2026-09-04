# Events Calendar Feature — Develop Notes

## What is now connected from the extracted workbook/publications

- `2026_theme.monthly_themes` → the monthly theme banner above the event calendar.
- `church_general_activities` → recurring weekly/monthly calendar entries and the Weekly Rhythm section.
- `july_2026_events` → special events, Upcoming Events, Watch Out, and Catch Up.
- `lectionary.hq_weekly` → the real full-year Calendar of Lectionary on Publications.
- HQ lectionary special observances → additional annual event-calendar entries.
- Hour of Praise/Anointing sheet → monthly calendar entries.
- Goodnews Week 27 and Week 28 references → Catch Up links for the Goodness Harvest and Founder’s Day.

## Intentionally not published

- Phone numbers from the older workbook directory.
- Church and ministry bank-account details.
- Officiating-minister schedules.
- The International Evangelical Convention remains in `events.items` with `published: false`
  because it appears in one July source but is absent from the later notice list.
- The current 20-centre House Fellowship directory remains authoritative; the older
  18-centre workbook list does not overwrite it.

## Editing events

Open:

`content/site-content.json`

Main sections:

- `events.items` — one-off and multi-day events.
- `events.recurring` — weekly or monthly recurring services.
- `events.monthlyThemes` — month theme and declaration.
- `events.socialFeed` — official Facebook, Instagram, YouTube, livestream, gallery, or video links.

Example social item:

```json
{
  "platform": "YouTube",
  "type": "Video",
  "title": "Founder’s Day Highlights",
  "text": "Watch highlights from the anniversary service.",
  "url": "https://...",
  "thumbnail": "assets/events/founders-day.jpg",
  "published": true
}
```

## Automatic behaviour

- Watch Out selects the current/next published special event.
- Upcoming Events contains future events.
- Catch Up contains past events.
- Changing the calendar month updates the monthly theme.
- Selecting an event opens details.
- “Add to Calendar” downloads an `.ics` calendar file.
