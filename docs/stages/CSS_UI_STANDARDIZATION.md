# CSS / UI Standardization

## Scenario

The site had reached a stable content and routing architecture, but presentation styles had accumulated through several parallel feature passes.

Baseline observations before this stage:

- `styles.css`: approximately 7,300 lines;
- `admin/admin.css`: approximately 1,350 lines;
- three separate public `:root` variable blocks;
- many page-specific component generations layered onto earlier versions;
- 76 `!important` declarations in the public stylesheet;
- repeated static inline styles across public footers;
- **120** inline style attributes across public HTML + Admin HTML;
- Admin UI relied heavily on repeated inline presentation rules;
- public and Admin components used overlapping but not fully normalized spacing, radii, shadows, control heights and focus treatments.

This stage is intentionally a **standardization**, not a visual redesign.

## Intent

1. preserve the Peculiar Cherubs visual identity;
2. establish one shared public design-token source;
3. align public and Admin controls to the same interaction language;
4. reduce repeated inline styling;
5. improve keyboard focus and reduced-motion behaviour;
6. make future CSS changes less likely to create another generation of one-off component styles.

## Decisions

### One public token block

`styles.css` now has one canonical `:root` block containing:

- brand colours;
- surfaces and borders;
- radii;
- shadows;
- spacing;
- text sizes;
- control height;
- motion tokens;
- section spacing;
- brand asset variables;
- Sunday School font scale.

The later variable-only `:root` blocks were folded into the canonical block.

### Preserve brand geometry

The church's distinctive seal-style card radius remains available through
`--radius-seal` and is mapped to the standardized `--radius-card`.

This is not a generic SaaS redesign.

### Shared interaction rules

Buttons now share:

- minimum control height;
- pill radius;
- consistent transition timing;
- active/focus behaviour;
- one disabled / Coming Soon treatment.

Cards and Quick Links share consistent border/shadow transition behaviour.

### Accessibility

Standardization includes:

- visible keyboard focus;
- consistent form focus behaviour;
- `prefers-reduced-motion` handling;
- non-interactive Coming Soon states.

### Footer styling

Repeated inline footer-brand styling has been replaced by the reusable
`.footer-brand` class.

### Admin alignment

Admin continues to import the public stylesheet and now maps its panels,
forms, settings cards and controls onto the shared token system.

Frequently repeated inline Admin settings styles were converted to reusable
classes.

### Scope boundary

This pass does **not** try to rewrite every historic page-specific selector or
remove every `!important` declaration in one risky sweep.

Complex feature-specific CSS (Publications, Sunday School, Events, Giving,
Leadership, etc.) is preserved unless it conflicts with the shared component
contract.

A later selector-debt reduction can be done safely once visual regression
screenshots are available.

## Validation

Run:

```bash
node scripts/check-content-integrity.js
node scripts/check-navigation-integrity.js
node scripts/check-ui-integrity.js
```

## Inline-style progress

HTML/Admin inline-style attributes:

- before: **120**
- after: **34**

Remaining inline styles are primarily one-off Admin layout details and are not
treated as a functional blocker for this stabilization stage.
