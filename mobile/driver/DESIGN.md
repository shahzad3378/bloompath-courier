---
version: alpha
name: "Fast Drop Driver"
colors:
  background: "#fff7f7"
  foreground: "#202127"
  surface: "#ffffff"
  primary: "#c83d45"
  coral: "#ff646b"
  navigation: "#24242a"
  muted: "#696970"
  line: "#f0e6e6"
  primary-soft: "#ffebec"
  danger: "#a62838"
  success: "#16734b"
typography:
  sans:
    fontFamily: "DM Sans"
  display:
    fontFamily: "Merriweather"
rounded:
  control: "16px"
  card: "22px"
spacing:
  page: "22px"
  control-height: "52px"
components:
  button:
    rounded: "16px"
  card:
    rounded: "22px"
---
# Fast Drop Driver

## Overview
Product app for drivers working through assigned deliveries. User-approved visual reference: Fast Courier App by Ferdous, https://ui8.net/ferdous/products/fast. Adapt the reference's coral/white cards, serif display headings and black scan action to the existing driver functions. No commercial illustrations or paid source files are incorporated. This native app intentionally has its own identity; the web operational workspace keeps its green theme.

## Colors
`src/theme.ts` is canonical (runtime ownership model B). `colors.green`, `darkGreen` and `paleGreen` retain their existing exported names for compatibility, mapping respectively to primary, navigation and primary-soft here. Coral is decorative; darker primary is used behind white button text for contrast. Status semantics always include text.

## Typography
Bundle DM Sans regular and Merriweather bold locally via Expo Font before rendering. The display font is reserved for login/profile titles; shared operational text stays sans. Font load failures fall back to the platform font. No remote font fetch on device.

## Layout
Phone-first, 22px content gutters, vertically scrolling cards, fixed bottom navigation outside the list and inside safe-area bounds. Home, Routes, Scan and Profile are real destinations. Search filters already assigned stops locally and retains route order; it is transient to avoid putting recipient data in URLs.

## Elevation & Depth
White cards on warm pink with quiet borders. Black scan action is the navigation signature. Avoid ornamental gradients and fabricated route maps.

## Shapes
Shared buttons are 52px high with 16px corners, cards 22px corners and circular stop-sequence badges. Long addresses and names wrap.

## Components
Theme → `src/ui.tsx` shared ActionButton/Banner/BottomNav/styles → login, routes, scan and stop screens. Pressable actions expose names, selected/disabled states and pressed feedback. Native scrolling and focus are platform-owned. Input, button and card dimensions remain stable while busy.

## Do's and Don'ts
Keep actual assignments, tenant currency and delivery proof requirements. Do not add fictional totals, customer booking, notifications, offline queues or tracking history just because the reference kit includes them. Camera/POD verification needs a physical Android device.
