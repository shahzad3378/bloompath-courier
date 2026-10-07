# Driver UI 1.1.0 verification

Reference inspected: Fast Courier App UI8 gallery (coral/white rounded cards, black scan navigation, DM Sans/Merriweather).

- TypeScript and Expo ESLint pass.
- Expo Android export succeeds, producing a Hermes bundle with bundled fonts/icons.
- Expo web export succeeds.
- Frontend premium strict static audit: zero findings. Native ActionButton handlers use onPress; its previous generic Button name caused HTML-auditor false positives, so it was renamed to clarify native ownership.
- DESIGN.md lint: zero errors; runtime-owned palette tokens have informational orphan warnings because React Native consumers are documented in prose rather than generated component references.
- No changes to src/courier.ts or src/driver-context.tsx business/auth/storage behavior.
- Local browser preview blocked by cloud-browser localhost policy; final visual/browser acceptance is outstanding.
- No signed APK is produced in this workspace: Expo authentication is unavailable. Existing repository icon assets are preserved; local placeholder icons were used only to satisfy export resolution and are not committed.

## Device acceptance before distribution
Build using the existing preview profile and verify sign-in, Home/Routes/Profile navigation, local search/Clear, loading/empty/error/retry, assigned-only manual AWB and camera scan, call/map, camera permission denial, required proof/reason, and confirmed result save on a physical Android phone. A new build is required; Vercel deployment does not update the installed driver app.
