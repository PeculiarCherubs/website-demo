# Worship Location Registry Integration

## UI terminology decision

The church-facing navigation remains:

```text
CHAPELS
└── All Chapels
```

No terminology change is introduced without Church Admin approval.

## Canonical data source

Entries underneath the CHAPELS menu and the Giving Location selector now come
from the same canonical worship-location registry:

```text
peculiar-hq
pdcm-gwarinpa
pdcm-english
pdcm-byazhin
pdcm-mega-youth
```

The registry derives from `chapels.current` and `chapels.details`, with legacy
Mother Church aliases normalized to `peculiar-hq`.

## Giving

Giving Location and Giving Purpose remain distinct:

```text
Giving Location
→ Peculiar HQ / chapel

Giving Category / Purpose
→ Tithe / Sunday Offering / Thanksgiving / etc.
```

Bank accounts may optionally declare a future `locationId` or `chapelId`.
Accounts with no location remain global and visible for every selected location.
No bank account is automatically reassigned by this build.
