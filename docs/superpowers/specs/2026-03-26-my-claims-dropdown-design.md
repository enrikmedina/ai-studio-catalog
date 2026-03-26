# My Claims Dropdown — Design Spec

**Date:** 2026-03-26
**Feature:** Allow users to see all agents/variations they have claimed

---

## Overview

Add a "My Claims" dropdown to the catalog header. Clicking the user's name/avatar reveals a list of every agent and variation the current user has claimed, with a link to the associated ADO task.

---

## Data Source

Claims are derived entirely from the in-memory `AGENTS` array (already fetched on page load). No new API endpoint is needed.

Two types of claims to surface:

1. **Parent claims** — agents where `agent['ClaimedBy'] === currentUserEmail`
2. **Variation claims** — parse each agent's `ClaimedVariations` JSON array and find entries where `entry.claimedBy === currentUserEmail`

Each claim yields: agent name, variation name (variation claims only), ADO task ID, ADO task URL.

---

## UI

### Trigger

The existing `.user-greeting` div (`#userGreeting`) becomes a clickable toggle. A small chevron `▾` is added after the name. The element gets `cursor: pointer` and a subtle highlight style when active.

### Dropdown panel

- Positioned `absolute`, anchored to the right of the trigger, appearing below it
- Width: `280px`
- Styled with the existing design tokens (white bg, `--border`, `--radius`, `--shadow-lg`)

### Layout

```
┌─────────────────────────────────┐
│ MY CLAIMS                    (3)│  ← section header + count badge
├─────────────────────────────────┤
│ Invoice Automation Agent  #1234↗│  ← parent claim
│ Tax Query Bot                   │  ← variation claim
│   AU Variant              #1235↗│
│ Payroll Compliance Checker #1240↗│
├─────────────────────────────────┤
│ Sign out                        │  ← moved from header into dropdown
└─────────────────────────────────┘
```

- Each row: agent name (truncated if too long) + ADO task link on the right (`#ID ↗`, opens in new tab)
- Variation claims: agent name on first line, variation name below in muted smaller text
- ADO link styled in `--teal`
- "Sign out" link moves into the dropdown footer (removed as a standalone element in the header)

### Empty state

When the user has no claims: show "No claims yet" in muted text inside the panel.

### Dismiss

Click outside the dropdown closes it (standard `document` click listener).

---

## Implementation Plan (summary)

All changes are in `public/au-agent-catalog.html`.

1. **CSS** — add styles for: `.user-greeting` as trigger (cursor, hover state), `.claims-dropdown` panel, claim rows, empty state
2. **HTML** — add `▾` chevron to `#userGreeting`; add `.claims-dropdown` div (hidden by default) inside `.user-greeting`; remove standalone "Sign out" link from header markup and place it in the dropdown footer
3. **JS — `buildClaimsDropdown()`** — scans `AGENTS` for current user's claims, builds list HTML, injects into dropdown
4. **JS — toggle logic** — click on `.user-greeting` toggles dropdown; click outside closes it
5. **JS — call site** — call `buildClaimsDropdown()` after `AGENTS` is populated (after `fetchAgents()` resolves) so the dropdown is ready before the user can open it

---

## Edge Cases

- **Not logged in** (`currentUserEmail` is empty): dropdown still renders but shows "No claims yet"
- **Long agent names**: truncated with `text-overflow: ellipsis`
- **No ADO task URL** (shouldn't happen in practice): skip the link, just show the name
- **Dropdown content freshness**: data reflects the page-load fetch; if the user claims something after load, `buildClaimsDropdown()` is called again post-claim to keep the list current
