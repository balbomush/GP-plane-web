# Source provenance

Full Web behavior derives from GP Plane v0.4.4 66b5898d6c30544df00d928126ecc5a38ea6fffc, MIT. Svelte components replace legacy DOM renderers, not a runtime fallback. Original source: src/gp_control_plane/web/ui_assets. Pure run-state, realtime controller, candidate-selection and stylesheet retain original code/copyright; API/session adapters already ported in S2A. New feature controllers own state/lifetimes. No Horizon code or credentials imported. gp-ui 0.1.0-s2a.1 remains exact immutable archive; Web-owned features do not widen its contract.

Swagger UI function in `src/gp_control_plane_web/docs.py` copied unchanged from GP v0.4.4 `66b5898d6c30544df00d928126ecc5a38ea6fffc:src/gp_control_plane/web/docs.py`; owned MIT code, existing CDN links/offline fallback/auth/try-it-out behavior retained. No Core runtime import.
