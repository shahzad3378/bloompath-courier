---
version: alpha
name: "BloomPath Courier"
description: "Operational courier SaaS with a calm green control-room identity for warehouse, dispatch, driver, finance, and shipper teams."
colors:
  background: "#f4f7f6"
  foreground: "#17231e"
  surface: "#ffffff"
  muted: "#66756e"
  line: "#dfe7e3"
  primary: "#13734b"
  primary-dark: "#0c4d33"
  primary-soft: "#e7f4ed"
  navigation: "#10291f"
  info: "#376eb1"
  warning: "#c77912"
  danger: "#c64242"
typography:
  sans:
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif"
  mono:
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace"
rounded:
  sm: "0.5rem"
  DEFAULT: "0.75rem"
  lg: "1rem"
  panel: "1.125rem"
spacing:
  control-height: "2.75rem"
  panel-gap: "1.25rem"
  page-max: "93.75rem"
components:
  button:
    radius: "0.75rem"
  card:
    radius: "1rem"
  panel:
    radius: "1.125rem"
  input:
    radius: "0.75rem"
---

# BloomPath Courier Design System

## Overview

### Creative North Star

The interface should feel like a well-run parcel control room: quiet surfaces, precise operational states, visible custody, and one continuous green route line tying actions together.

### Product context and register

- **Audience and primary job:** Courier administrators, dispatchers, warehouse staff, drivers, finance teams, and shippers need to move an AWB through custody without losing its current state.
- **Target markets:** Multi-tenant courier businesses, currently including Canada, the United States, and UAE operations.
- **Locale and language:** Product UI is currently English; operational data may contain international names, addresses, currencies, and postal formats.
- **Usage scene:** Desktop-first operational work with responsive driver and shipper views; frequent scanning, dense tables, and time-sensitive status checks.
- **Register:** Product/admin. Familiarity and operational clarity lead.
- **Memorable signature:** Green custody and route accents connect warehouse, dispatch, and delivery states.
- **Restraint:** Tables, forms, route maps, finance totals, and exceptions remain quiet and data-led.
- **Anti-references:** Avoid playful ecommerce styling, excessive gradients, ornamental motion, and dashboard cards that hide the underlying operational count.
- **Token ownership/runtime mapping:** This file mirrors the canonical CSS variables and shared primitives in `src/app/globals.css`; runtime CSS remains the implementation source of truth.

## Colors

The authenticated Courier portal uses white workspace surfaces, blue navigation and primary actions (`#174ea6`, hover `#123b7a`), pale blue selected states (`#edf4ff`), restrained red accents (`#d62828`), and cool borders (`#dce4ef`). Green remains for successful shipment states; amber remains for recoverable attention; red status and destructive actions retain their semantic meaning. The portal-wide theme is scoped on `PortalShell` with `data-portal-theme="courier"` and adapted in `src/app/globals.css`.

## Typography

Geist Sans is used for interface copy and Geist Mono for AWBs, run numbers, and other machine identifiers. Numeric totals use strong weight and tabular visual alignment; long addresses remain readable and may wrap instead of being silently clipped.

## Layout

Pages use a centered maximum width up to 1500px, a 20px panel rhythm, and responsive grids that collapse without changing data meaning. Maps reserve their height before client loading, tables own horizontal overflow, and status summaries distinguish system totals from operational subsets.

## Elevation & Depth

Hierarchy is produced primarily through tonal surfaces and borders. Static panels use only a low green-black shadow; controls and alerts do not rely on elevation alone.

## Shapes

Inputs and buttons use 12px corners, cards use 16px, and major panels use 18px. Route-stop markers use circles because sequence, not container hierarchy, is their primary meaning.

## Components

### Foundational visual states

Interactive elements require visible hover and focus-visible treatment. Disabled controls retain stable dimensions. Success, warning, info, and danger always include text, not color alone.

### Buttons and actions

Solid green is the primary commit action. Green outline is used for safe operational tools such as route mapping. Dangerous actions remain visually separated and explicitly named.

### Navigation and data display

Counts must state their scope: total system shipments, physical warehouse custody, route-assigned AWBs, and mapped stops are separate metrics. Route maps pair a visual path with a text sequence and Google Maps links.

### Forms and overlays

Fields keep 44px minimum height, associated labels, inline errors, and stable help text. Product flows use app-owned feedback and do not use browser alert dialogs.

### Iconography

Lucide is the canonical icon family. Icons are normally 16–20px with text labels unless the action is universally understood and has an accessible name.

### Motion

Transitions are short and functional (160–180ms). Map loading reserves final geometry. Reduced-motion preferences must not remove status feedback.

### Content and data visualization

Copy is direct and operational. Counts use locale-aware separators. Currency is tenant-aware. Maps, charts, and status colors always retain a textual equivalent.

## Do's and Don'ts

- **Do:** State custody and count scope explicitly.
- **Do:** Pair route visualization with sequence and unmapped-address information.
- **Don't:** Treat booked shipments as physically received inventory.
- **Don't:** Hide missing coordinates behind a zero count without explaining recovery.
