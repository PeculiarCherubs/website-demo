# Sermons / Live Navigation Cleanup

## Navigation

The site no longer carries a permanent `LIVE` / `Watch Live` navigation item.

`SERMONS` is the permanent navigation slot.

When one or more chapel broadcasts are live, the existing public navigation
renderer changes that same slot to a pulsing:

`LIVE NOW`

When no chapel is live, it returns to:

`SERMONS`

The cleanup migration removes any legacy `live.html` / `nav-live` item that
may still exist in the live Supabase `navigation` row.

## Broadcast Hub chapel selectors

The chapel pills at the top of the Broadcast Hub are now strictly LIVE
selectors.

- 0 live chapels: no live-selector row
- 1 live chapel: no redundant selector row
- 2+ live chapels: only those currently-live chapels appear as pills

Offline, upcoming and recap chapels no longer appear beside a live chapel in
that selector.

The separate `All broadcast locations` area can still show configured chapel
broadcast locations for upcoming/recap discovery.

Deep links such as `live.html?chapel=pdcm-gwarinpa` continue to work even if
that particular chapel is not currently live.
