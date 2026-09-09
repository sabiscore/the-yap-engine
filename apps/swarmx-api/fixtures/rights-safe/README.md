# Rights-safe fixtures

Landing directory for media assets that the SwarmXQ certified local golden path
may consume without a network round trip. Per the APEX Video Factory V4
directive (§12.1), the constrained CPU-only profile must remain useful with
rights-safe local assets only.

## What belongs here

Only assets whose rights state is unambiguously **approved** at import time:

- Public-domain media (Creative Commons CC0, US federal government works, etc.)
- Permissively licensed media whose license terms are compatible with SwarmXQ's
  distribution model and whose attribution requirements are captured in
  `attribution.json`
- User-approved imports whose consent and attribution are documented
- Programmatically generated visuals (gradients, shapes, charts) whose lineage
  is captured in `AssetLineage` at generation time

## What does NOT belong here

- Any asset whose license is unknown, needs review, or is rejected
- Any asset with unresolved voice or likeness consent
- Any asset extracted from a third-party platform without explicit permission
- Any asset whose attribution requirement cannot be satisfied in the final
  package

## File layout

```
apps/swarmx-api/fixtures/rights-safe/
├── README.md                 (this file)
├── attribution.json          (canonical schema; see below)
├── image/                    (per-mime subdirectories are optional)
├── video/
└── audio/
```

Nothing under the per-mime directories is checked into the repository by
default. This directory is a landing pad; CI does not require any media
present. When a fixture is added, its entry in `attribution.json` becomes
mandatory.

## attribution.json schema

Every asset added to this tree must have a corresponding record in
`attribution.json`. The schema mirrors the runtime `AssetRecord` /
`AssetLicense` / `AssetLineage` types in
`packages/swarmx-types/src/video-types.ts`, kept in JSON form so imports can
be verified without executing TypeScript:

```json
{
  "schemaVersion": 1,
  "assets": [
    {
      "id": "gradient-neutral-01",
      "path": "image/gradient-neutral-01.png",
      "mediaType": "image",
      "sha256": "<64-hex-chars>",
      "license": {
        "state": "approved",
        "sourceName": "Programmatically generated",
        "sourceUrl": null,
        "allowedUses": ["preview", "production"],
        "attribution": null,
        "expiresAt": null
      },
      "lineage": {
        "sourceKind": "generated",
        "generatedAt": "2026-07-23T00:00:00.000Z",
        "modelTag": null,
        "promptHash": null,
        "parentAssetIds": []
      }
    }
  ]
}
```

Fields:

- `state` must be `"approved"` for anything in this directory; other states
  belong elsewhere in the asset registry
- `allowedUses` enumerates the runtime uses the asset is licensed for (preview,
  production, redistribution, etc.)
- `attribution` is a rendered credit string if the license requires one;
  `null` otherwise
- `sha256` is verified at import time; a mismatch blocks certification

## Adding a fixture

1. Confirm the license state and record the source
2. Copy the asset into the appropriate subdirectory
3. Compute the SHA-256: `sha256sum apps/swarmx-api/fixtures/rights-safe/<path>`
4. Add the record to `attribution.json`
5. Run `pnpm -F @swarmx/api tsc --noEmit` and the Creative Factory invariant
   script to confirm no regression

Assets whose license changes after import must be removed from this tree and
either relocated with a documented license update or deleted.
