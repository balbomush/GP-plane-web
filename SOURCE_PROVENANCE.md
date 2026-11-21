# Source provenance

The original standalone Web behavior derived from GP Plane v0.4.4 66b5898d6c30544df00d928126ecc5a38ea6fffc, MIT. Svelte components replace legacy DOM renderers, not a runtime fallback. Original source: src/gp_control_plane/web/ui_assets. Pure run-state, realtime controller, candidate-selection and stylesheet retain original code/copyright; API/session adapters already ported in S2A. New feature controllers own state/lifetimes. No Horizon code or credentials imported. gp-ui 0.1.0-s2a.1 remains exact immutable archive; Web-owned features do not widen its contract.

Swagger UI function in `src/gp_control_plane_web/docs.py` copied unchanged from GP v0.4.4 `66b5898d6c30544df00d928126ecc5a38ea6fffc:src/gp_control_plane/web/docs.py`; owned MIT code, existing CDN links/offline fallback/auth/try-it-out behavior retained. No Core runtime import.

## API2 UI local candidate, 2026-11-15

The current shell and reusable API2 modules implement the accepted GP-owned mockup, pinned in the local WEB-UI plan. The old shell CSS is replaced with scoped theme/layout rules. gp-ui0.2.0-ui2.11 includes the public ./api2 entry; root Results/format and exact S2A archive remain unchanged. No Horizon sources were imported. Current Core/OpenAPI/gp-ui identities are recorded in CORE_API_PROVENANCE.json.
