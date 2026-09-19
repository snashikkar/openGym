### What this changes

### Why

*Link the issue if there is one: `Closes #123`.*

### Checklist

- [ ] `bun test` passes across workspaces (frontend, api, mcp)
- [ ] `bun run build` succeeds
- [ ] User-facing strings are in every locale pack — `bun scripts/check-locales.mjs`
- [ ] No new runtime dependency, or the MR explains why one is unavoidable
- [ ] CHANGELOG.md is left alone — release notes are written at release time

<!-- The pipeline runs the same checks on every MR. An APK build and a container build are
     available as manual jobs on the pipeline if your change needs one. -->
