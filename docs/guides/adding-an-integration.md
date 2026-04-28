# Adding a tool integration

A new integration is one folder plus a registry entry.

## 1. Create the integration folder

Each integration lives at `packages/integrations/src/<id>/`:

```
packages/integrations/src/aider/
├── index.ts          # exports the Integration
├── detect.ts         # detect()
├── modes.ts          # supported modes + preferredMode()
├── install.ts        # install() and dryRun()
├── uninstall.ts      # uninstall()
├── status.ts         # status()
└── compat.ts         # versioned compatibility table (for native-hook integrations)
```

Implement the `Integration` interface from
`packages/integrations/src/types.ts`:

```ts
export interface Integration {
  id: string;                                 // 'aider' | 'codex' | …
  detect(): Promise<DetectResult>;
  modes: IntegrationMode[];                   // ordered by preference
  preferredMode(): IntegrationMode;
  install(mode: IntegrationMode, opts: InstallOpts): Promise<InstallResult>;
  uninstall(): Promise<void>;
  dryRun(mode: IntegrationMode): Promise<InstallPlan>;
  status(): Promise<IntegrationStatus>;
}
```

## 2. Implement detection

`detect()` returns:

```ts
{ installed: true, version: '0.42.0', confidence: 'high' }
```

Detection should be fast and side-effect-free. Use `which`-style lookups
or read a config file; do not invoke the tool.

## 3. Pick supported modes

Modes are `'native-hook'`, `'wrapper-launcher'`, `'paste'`. Order
`modes` by preference; `preferredMode()` typically returns `modes[0]`.

See [ADR 0008](../adr/0008-tool-integration-modes.md) for the fallback
ladder.

## 4. Implement `install()` and `dryRun()`

`dryRun(mode)` returns an `InstallPlan` describing exactly what would
change:

```ts
{
  integrationId: 'aider',
  mode: 'wrapper-launcher',
  filesCreated: ['/usr/local/bin/baton-aider'],
  filesModified: [],
  externalConfigChanges: [],
  hookEvents: ['session-end', 'limit-warning'],
  fallbackUsed: false,
  warnings: [],
}
```

`install()` performs the change and records a row in
`.baton/integrations/installed.json` including the original content of
any modified file (so `uninstall` can restore it).

Never modify another tool's config without explicit user consent. `baton
init` handles confirmation; integrations should not prompt directly.

## 5. Implement `uninstall()`

Read the install record, restore any backed-up files, remove any
Baton-installed hooks or wrappers, and drop the entry from
`installed.json`. An integration that omits `uninstall()` cannot ship.

## 6. Register the integration

Edit `packages/integrations/src/registry.ts`:

```ts
import { aiderIntegration } from './aider/index.js';

export const allIntegrations = [
  claudeCodeIntegration,
  codexIntegration,
  cursorIntegration,
  aiderIntegration,   // new
  genericIntegration,
];
```

## 7. Update the integration matrix

Add a row to `docs/spec/cli-contract.md` under "v1 integration matrix"
listing primary mode, fallback mode, and any notes.

## 8. Tests

Write tests under `packages/integrations/test/<id>/`:

- `detect()` against a fake `PATH`
- `dryRun()` returns the expected plan for each supported mode
- `install()` followed by `uninstall()` leaves the file system unchanged
  (snapshot-and-restore comparison)
- `status()` reflects post-install state

## 9. PR

```
feat(integrations): add aider with wrapper-launcher mode
```

Integration additions do not require an ADR unless they introduce a new
mode beyond `native-hook` / `wrapper-launcher` / `paste`.
