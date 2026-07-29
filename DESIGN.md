# Room Reservation Design System

This document is the visual design authority for the room-reservation product.
It applies to both the public reservation flow and the administrator UI. Product
policy, reservation behavior, and API contracts remain governed by the existing
product and engineering rules.

## Transformation Goal

This is a structural redesign, not a visual skin refresh.

Changing only colors, typography, border radii, shadows, or icons is not
sufficient. Each major screen must be recomposed around its actual reservation
task while preserving product behavior, routes, accessibility, and API
contracts.

Preserve every established user task and the information needed to complete it.
The current visual grouping, panel hierarchy, field placement, and emphasis are
not preservation requirements. They may be recomposed when the new structure
makes the task clearer, faster, or more accessible.

Existing E2E tests are evidence of product behavior, but they do not freeze the
current presentation. Preserve tests that protect functional and accessibility
contracts, including field availability, value retention, logical keyboard and
focus order, five-minute time selection, timetable hover and click behavior,
mobile overflow prevention, mobile input sizing, zoom resilience, and the
public/administrator policy boundary. Tests coupled only to exact DOM order,
same-row placement, legacy class names, fixed title sizes, or obsolete panel
composition may be deliberately updated as part of an approved redesign.

A design should be rejected when:

- replacing reservation terminology with another business domain would leave
  the screen essentially unchanged;
- most pages still use the same header, card, filter, and content composition;
- decorative presentation is stronger than room, time, availability, and
  reservation-state hierarchy;
- the result resembles a generic generated dashboard, landing page, shop, or
  portfolio template.

## 1. Design North Star: Quiet Operations

The product should feel like a well-maintained reservation desk: calm, direct,
and specific to rooms and time. It is an operational tool, not a generic SaaS
dashboard and not a branded editorial or commerce site.

The visual hierarchy must come from real reservation information:

1. time and date;
2. room;
3. reservation status;
4. applicant and purpose;
5. secondary metadata and administration actions.

User-facing terminology must stay aligned with the product language:

- In Korean UI copy, use `공간` or `예약 공간`.
- Internal code and API contracts may continue to use `room`.
- Do not reintroduce `강의실` as a UI label.

Use warm neutral surfaces, dark ink-like text, restrained green interaction
signals, thin rules, and mostly flat composition. The interface may borrow
restraint and warmth from editorial references, but must remain a fast Korean
work interface.

## 2. Explicit Anti-Template Rules

These rules exist to prevent the repetitive AI-generated dashboard style that
the project is replacing.

- Do not wrap every section in a white card. Group with spacing and dividers
  first; use a bordered container only when it establishes a real boundary.
- Do not repeat `eyebrow + large title + explanatory paragraph` on every page.
  Use an eyebrow only when it communicates a real parent context that is not
  already visible in navigation.
- Do not attach an icon to every navigation item, heading, button, or empty
  state. Prefer a literal Korean label when the icon adds no information.
- Do not use numbered labels such as `01`, `02`, and `03` as decoration.
  Numbers are for real sequence, rank, count, date, time, or room identity.
- Do not represent every state with a pill badge. Prefer plain text, a small
  dot, a narrow marker, or a compact rectangular label according to context.
- Do not use a saturated primary color as page decoration. Accent color means
  action, selection, focus, or status.
- Do not make all pages share the same panel composition. The reservation list,
  timetable, detail view, and public request flow should each follow their task.
- Do not add generic dashboard statistics, decorative charts, gradients,
  glassmorphism, glow, or oversized empty-state illustrations.
- Do not use uniform spacing merely because it is a token. Related content may
  be dense; unrelated sections must have visibly larger separation.
- Do not imitate an external brand wholesale. References provide principles,
  not a replacement identity.

## 3. Typography

### Font family

The product uses a Korean-first system sans stack and must not depend on a
remote font request:

```css
font-family:
  "Noto Sans KR",
  "Apple SD Gothic Neo",
  "Malgun Gothic",
  "Segoe UI",
  sans-serif;
```

- Do not use `Inter` as the primary family. Its Korean fallback creates a mixed,
  generic SaaS appearance.
- Do not use a display serif in the administrator UI.
- A serif may be introduced later in a public-facing institutional identity,
  but only with an explicit product-specific reason and a bundled font asset.
- Use a monospace family only for technical identifiers, never for ordinary
  dates or times.
- Use tabular numerals for timetables, date/time columns, counts, and capacities.

The initial implementation may accept the platform differences of this system
stack. Do not add a remote font request merely to make rendering identical.
Consider a bundled Korean font only after cross-platform review demonstrates a
material consistency problem and the asset cost and loading behavior have been
explicitly approved.

### Weight

Use only weights that render predictably across the fallback stack:

- `400`: body copy, table cells, input values;
- `500`: controls, labels, navigation, metadata emphasis;
- `600`: page titles, section headings, primary actions, important values;
- `700`: rare display emphasis such as the organization name on the entry page.

Do not use synthetic-looking weights such as `650`, `750`, `800`, or `950`.
Avoid bold text as a substitute for hierarchy; prefer placement, size, and
spacing first.

### Scale and rhythm

| Role | Desktop size | Weight | Line height |
| --- | ---: | ---: | ---: |
| Public entry title | 30-34px | 600-700 | 1.25 |
| Admin page title | 26-28px | 600 | 1.3 |
| Section title | 18-20px | 600 | 1.4 |
| Body / table | 14-16px | 400 | 1.5 |
| Label / navigation | 13-14px | 500-600 | 1.4 |
| Metadata | 12-13px | 400-500 | 1.4 |

Korean headings use sentence case. Avoid ornamental English labels and forced
uppercase unless the text is a real acronym or code.

## 4. Color Foundation

The target palette is warm and operational. Exact tokens may be tuned during
visual implementation, but their roles must remain stable.

| Role | Starting token | Usage |
| --- | --- | --- |
| Canvas | `#f4f3ed` | Warm app background |
| Canvas light | `#f8f8f5` | Lighter near-white app background |
| Surface | `#faf9f5` | Inputs and bounded work surfaces |
| Surface strong | `#ebe9e1` | Selected or grouped neutral area |
| Ink | `#222521` | Primary text |
| Muted ink | `#666a63` | Supporting copy and metadata |
| Rule | `#d4d2c9` | Dividers and control borders |
| Action | `#245b47` | Primary actions and active navigation |
| Action soft | `#e7f0eb` | Selected background |
| Focus | `#285ea8` | Keyboard focus only |
| Status requested | `#8a6100` | Reservations awaiting approval |
| Status confirmed | `#2f6b4f` | Confirmed reservation state |
| Status cancelled | `#73766f` | Cancelled historical state |
| Danger | `#a13d38` | Destructive action and failure |
| Warning | `#8a6100` | Pending or caution |

- Pure white is allowed only where contrast or layering requires it; it should
  not create a field of floating white cards.
- Choose the warm or light canvas deliberately for a complete product surface.
  Do not alternate canvas colors between neighboring pages without a structural
  reason.
- Semantic colors keep one meaning throughout the product.
- Action and status tokens remain semantically separate even when two tokens
  temporarily share the same color value. Button color must not define
  reservation status color.
- Never rely on color alone. Pair status color with a label or structural cue.
- Verify text and interactive-state contrast against WCAG AA during
  implementation.

## 5. Geometry, Borders, and Depth

### Spacing system

Use the following scale for ordinary layout and component spacing:

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
--space-6: 32px;
--space-7: 48px;
```

- Use smaller spacing for tightly related content and larger spacing to mark a
  change of task or information group.
- Do not force precision geometry onto the general spacing scale. Timetable
  grids, one-pixel rules, native-control corrections, and similar technical
  alignment may use necessary intermediate values such as `2px`, `3px`, or
  `5px`.
- Repeated arbitrary values should become a named token or be removed during
  implementation.

### Geometry and depth

- Default control radius: `3-4px`.
- Large container radius: `4-6px`, only when a container is necessary.
- Full rounding is reserved for genuinely circular controls or very small
  status dots. It is not the default badge language.
- Standard borders are `1px` quiet rules. Avoid doubled borders from nested
  panels.
- Standard content is flat. Shadows are reserved for elements that physically
  float: dialogs, popovers, menus, and sticky overlays.
- Hover should not lift ordinary cards. Use a small background or text change.

## 6. Layout by Product Surface

### Responsive framework

Use these ranges as the default responsive framework:

- small: up to `680px`;
- compact: `681px-980px`;
- standard: `981px-1279px`;
- wide: `1280px` and above.

These are coordination defaults, not a ban on content-driven breakpoints.
Timetables, detail views, settings forms, and other width-sensitive surfaces may
use an additional breakpoint such as `1180px` or `1680px` when their content
demonstrates the need. Do not introduce a breakpoint only to repair decorative
composition.

At mobile widths:

- the document must not overflow horizontally;
- tables and timetables may scroll within an explicitly bounded region;
- multi-column forms stack in a logical reading and focus order;
- text-entry controls use at least `16px` text to prevent unintended mobile
  browser zoom;
- native date controls remain contained within their grid or field boundary;
- floating reservation panels may become bottom sheets with contained vertical
  scrolling;
- icon glyphs may remain visually small while their public/mobile hit target is
  at least `44px`.

Full-height entry and gateway screens must account for persistent global
elements such as the footer. Do not combine an unconditional `100vh` content
region with an additional footer in a way that creates empty space or needless
document scrolling when all content fits in one viewport.

### Administrator

- Keep navigation compact and text-led. Active navigation should use text
  contrast or a narrow marker instead of a filled rounded tile.
- Page descriptions are optional. Omit them when the title and controls already
  explain the task.
- Connect filters visually to the data they affect. A filter toolbar should not
  look like an unrelated promotional card.
- Keep primary actions scarce: normally one per page or task region.
- Group settings by meaning rather than allowing a generic auto-placement grid
  to determine reading order. Start/end dates, opening/closing times, and
  minimum/maximum values remain adjacent pairs across supported layouts.

### Reservation list

- The table or list is the page, not content placed inside a decorative card.
- Time and room receive the strongest typographic hierarchy.
- Applicant, purpose, and origin are secondary but remain readable without
  opening the detail view.
- Row actions should appear where needed, not as a permanent cluster of icon
  buttons on every row.

### Timetable

- The timetable should use as much available workspace as practical.
- Use tabular numerals, quiet hour lines, and stronger day/room boundaries.
- Reservation blocks use compact geometry and semantic tint. Avoid shadows.
- A reservation block should communicate purpose, room or series, and state
  according to available space; do not force the same content at every size.

### Public reservation flow

- The public flow may use more whitespace than the administrator UI, but must
  not become a marketing landing page.
- Show availability and the selected time as the central interaction.
- Keep organization identity quiet; the reservation task remains primary.
- Confirmation, edit, and cancellation states must be explicit and reassuring.

## 7. Components

### Buttons

- Primary buttons use the action color or dark ink, not bright SaaS blue.
- Secondary buttons are quiet text or outlined controls.
- Icon-only buttons require an accessible name and are reserved for familiar
  spatial actions such as close, previous, next, or disclosure.
- Avoid arrows added purely to make a label look more designed.

### Control states

- Hover uses a restrained background, rule, or text change. Ordinary controls
  and content surfaces do not lift or gain promotional shadow.
- Keyboard focus uses the dedicated focus token and remains clearly visible on
  every surface. Invalid controls retain an error cue while focused.
- Disabled controls remain legible and clearly unavailable; opacity alone is
  not a sufficient disabled treatment.
- Loading controls preserve their geometry, prevent duplicate submission, and
  expose state through visible text or an appropriate accessibility attribute.
- Selected controls use a structural marker or action-soft surface together
  with `aria-selected`, `aria-current`, or the applicable native state.

### Forms and filters

- Labels stay visible above or beside controls; placeholders are examples, not
  replacements for labels.
- Place related date/time fields together and make their relationship visible.
- Search and filter controls should be compact enough to preserve data space.
- Error text appears next to the affected field and remains after focus moves.

### Status

- Reservation status values are limited to `REQUESTED`, `CONFIRMED`, and
  `CANCELLED`.
- User-facing status language must use only product-contract states and the
  established Korean labels: `승인 대기`, `승인`, and `취소`.
- `REQUESTED` uses the requested/warning role, `CONFIRMED` uses the confirmed
  role, and `CANCELLED` uses the quiet cancelled role. Cancellation is a
  historical reservation state, not automatically a destructive-action error.
- Danger is reserved for destructive actions, failures, and conditions that
  require immediate correction.
- Prefer compact rectangular labels, dots with text, or a table-column marker.
- Reserve strong fills for urgent or irreversible states.

### Tables and lists

- Use alignment, whitespace, and rules before adding containers.
- Text aligns left; numeric values align right where comparison matters;
  dates and times use tabular numerals.
- Loading, empty, error, and permission states must preserve the surrounding
  layout instead of replacing it with a generic illustration card.

### Dialogs and overlays

- Dialogs may use elevation because they float above the current task.
- The title states the decision, the body explains consequences, and the action
  order remains consistent.
- Destructive actions require explicit confirmation as defined by product rules.
- When a modal or mobile bottom sheet owns vertical scrolling, lock document
  scrolling behind it. Present one clear active scroll region instead of nested
  page and overlay scrollbars.

## 8. Motion and Interaction

- Motion explains state change; it is not decoration.
- Use short `120-180ms` transitions for hover, selection, and disclosure.
- Respect reduced-motion preferences.
- Focus-visible treatment must remain obvious even when visual chrome is
  reduced.
- Minimum touch targets remain 44px on public/mobile flows. Dense desktop admin
  controls may be smaller only when keyboard access is complete.

## 9. Redesign Rollout

Apply the design progressively by complete product surface. Do not recolor the
entire application first and leave every screen in its legacy composition.

1. Establish tokens, typography, focus behavior, and the minimum shared control
   primitives without changing product behavior.
2. Recompose the public entry and reservation flow around availability,
   selected time, and completion state.
3. Recompose the administrator shell, reservation list, and timetable around
   scanning and operational action.
4. Apply the established patterns to detail, edit, settings, spaces, tags,
   recurrence, and audit surfaces.
5. Complete cross-surface responsive, keyboard, zoom, loading, empty, error,
   and permission-state review.

Each completed surface must be usable and internally consistent before moving
on. Temporary coexistence with legacy screens is allowed, but a single screen
must not stop at a token-only reskin when structural redesign is required.

Split CSS only when the new component and surface boundaries are demonstrated
by implementation. Do not begin by mechanically distributing legacy selectors
across multiple files.

## 10. Reference Use

- Aesop is a reference for warm neutrals, flat depth, restrained weight, and
  reduction of decorative chrome. Its commerce layout, brand fonts, and
  low-density gallery composition are not product requirements.
- Google Calendar is a reference for time grids, event blocks, and numeric
  alignment. Its brand colors and platform-specific Material styling are not
  product requirements.
- Enterprise SaaS remains a reference for accessible forms, data states, and
  workflow completeness. Its blue palette, repeated cards, fixed visual recipe,
  and generic dashboard identity are explicitly not the target style.

## 11. Change Checklist

Before accepting a UI change, verify:

1. Does the composition reflect this page's actual reservation task?
2. Can any card, icon, badge, border, or helper sentence be removed?
3. Are time, room, and status easier to scan than before?
4. Is accent color carrying meaning rather than decoration?
5. Does Korean typography use the defined family and supported weights?
6. Are keyboard focus, touch targets, and data states still complete?
7. Would this screen still make sense without generic dashboard conventions?
