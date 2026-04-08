# Agent Showcase Page — Design Spec

**Date:** 2026-04-08
**Status:** Approved

---

## Overview

A standalone, publicly accessible showcase page (`/public/au-agent-showcase.html`) displaying all completed agents. Intended for external audiences — sales asset, proof of capability, shareable link. No authentication required. No hard CTA; the page exists to impress and inform.

---

## Design Direction

**Bold & Editorial.** Dark hero, oversized serif typography, full-bleed industry photography, teal accent colour. Tone: confident, modern, external-facing. No tier information is shown anywhere on the page.

Palette and fonts reuse the existing catalog design system:
- Fonts: DM Serif Display (headings), Inter (body)
- Colours: `--dark: #1A1A2E`, `--teal: #34DFBA`, `--cream: #F2F1ED`, `--muted: #6B7280`

---

## Page Structure

### 1. Navigation bar
- Sticky, dark background (`--dark`)
- Left: mySMB.com logo mark + "mySMB.com / AI Studio" wordmark
- Right: "Agent Showcase" label in teal

### 2. Hero section
- Full-bleed background photo with dark overlay
- Bottom-left: eyebrow line ("AI Studio · mySMB.com"), large serif headline, subtitle
  - Headline: *"AI agents, built and live in the wild."*
  - Subtitle: *"A growing library of intelligent agents built by the mySMB.com team — automating real workflows across Australian industries."*
- Bottom-right: two live stat counters — **Agents live** (count of `status === 'available'` agents) and **Industries** (distinct industry count)

### 3. Featured spotlight
- Section label: "Featured agents"
- Asymmetric 2-column grid: one large card (left, spans 2 rows) + two small cards (right column, stacked)
- Each card: full-bleed industry photo, dark gradient overlay, industry label (top-left), agent name (bottom-left in serif)
- Large card also shows a 2-line description
- **Featured flag:** agents marked `featured: true` in a `SHOWCASE_CONFIG` object at the top of the file (hardcoded list of 3 agent names). Falls back gracefully if fewer than 3 are available.

### 4. Industry filter bar
- Pill buttons: "All industries" + one per distinct industry present in the data
- Active state: dark background, white text
- Filters the "All live agents" grid below; does not affect the featured section

### 5. All live agents grid
- Section label: "All live agents" with dynamic count (e.g. "All live agents — 42")
- Responsive grid: `repeat(auto-fill, minmax(280px, 1fr))`
- Each card:
  - Photo header (industry photo, 100px tall) with industry name overlay
  - Agent name (serif)
  - 2-line description
  - Footer: pulsing green "Live" badge

---

## Data

- Fetches from the same API endpoint: `GET /api/agents`
- Filters to `status === 'available'` agents only
- No authentication header — page is fully public, API endpoint must allow unauthenticated reads for `available` agents (verify existing CORS/auth config)
- Industry photos reuse the existing `INDUSTRY_META` map from the catalog

---

## Featured Config

At the top of the file, a hardcoded config controls which agents appear in the spotlight:

```js
const SHOWCASE_CONFIG = {
  featured: [
    'Lease Renewal Reminder Agent',
    'BAS Preparation Checklist Agent',
    'Employee Onboarding Orchestrator',
  ]
};
```

Featured agents are removed from the "All live agents" grid to avoid duplication.

---

## Routing & Access

- File: `public/au-agent-showcase.html`
- URL: `/public/au-agent-showcase.html`
- No login required — `staticwebapp.config.json` must have an `allowedRoles: ["anonymous"]` rule for this path (verify existing config allows it)

---

## Out of Scope

- Detail panel / agent drawer (clicking a card does nothing in v1)
- Search input
- Sort controls
- Any claim/build functionality
- Authentication or gating
