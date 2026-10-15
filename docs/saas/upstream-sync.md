# Upstream Synchronization & Maintenance Guide

This document outlines the standard operating procedure for pulling and synchronizing upstream updates from the original author's repository ([`ArnasDon/wacrm`](https://github.com/ArnasDon/wacrm)) into the commercial SaaS fork ([`mhaseebcp786/wacrm`](https://github.com/mhaseebcp786/wacrm)).

---

## 1. Git Repository & Branching Model

```
       [ArnasDon/wacrm] (Original author upstream repository)
                 │
                 │  git fetch upstream
                 ▼
       [upstream/main]  (Latest upstream releases & bug fixes)
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
(mirrored directly)  (merged into)
   [local main]      [saas-main]  <── (SaaS features, billing, sidecars)
        │                 │
        ▼                 ▼
  [origin/main]     [origin/saas-main]
       (Your GitHub fork: mhaseebcp786/wacrm)
```

- **`main`**: Pure, untouched mirror of `upstream/main`. Never write SaaS-specific code directly to `main`.
- **`saas-main`**: The production SaaS branch containing all multi-tenant enhancements and integrations.
- **Feature branches**: Must branch off `saas-main` (e.g., `feature/billing-stripe`) and merge back into `saas-main`.

---

## 2. Remote Configuration Verification

Ensure both `origin` (your fork) and `upstream` (the original author) are configured in your local git repository:

```bash
git remote -v
```

If `upstream` is missing, add it with:

```bash
git remote add upstream https://github.com/ArnasDon/wacrm.git
```

Expected output:
```text
origin    https://github.com/mhaseebcp786/wacrm.git (fetch)
origin    https://github.com/mhaseebcp786/wacrm.git (push)
upstream  https://github.com/ArnasDon/wacrm.git (fetch)
upstream  https://github.com/ArnasDon/wacrm.git (push)
```

---

## 3. Step-by-Step Upstream Sync Procedure

### Step 1: Fetch Latest Commits from Upstream
Fetch all new branches, commits, and tags from the original author:

```bash
git fetch upstream
```

### Step 2: Synchronize the Mirror `main` Branch
Fast-forward your local `main` branch to match `upstream/main` and push to your GitHub:

```bash
git checkout main
git merge upstream/main --ff-only
git push origin main
```

### Step 3: Merge Upstream into `saas-main`
Switch to `saas-main` and merge `upstream/main`:

```bash
git checkout saas-main
git merge upstream/main
```

#### Why conflicts are minimized:
1. **Union Merge in `.gitattributes`**: Shared files (`AGENTS.md`, `CLAUDE.md`, `.gitignore`, `.prettierignore`) have `merge=union` enabled, resolving diffs automatically.
2. **Dedicated SaaS Namespaces**: SaaS code is isolated in fork-owned directories and route groups (such as `src/saas/` or `app/(saas)/`), preventing filename collisions with upstream.
3. **High-Offset Migration Numbers**: Upstream migrations (e.g., `047_...`, `048_...`) sort lexicographically before your SaaS migrations (`90000+...`), ensuring deterministic database reset/replay ordering without numbering clashes.

### Step 4: Run the Quality Verification Gate
Before committing or pushing any merge result, execute the mandatory verification suite:

```bash
# 1. Check TypeScript types
npm run typecheck

# 2. Run automated test suite
npm run test

# 3. Check code formatting & linting
npm run lint
npm run format:check
```

### Step 5: Push the Synchronized SaaS Branch
Once all tests and type checks pass:

```bash
git push origin saas-main
```

---

## 4. Conflict Resolution & Invariant Checklist

If Git reports any conflict during `git merge upstream/main`:

1. **New Dashboard Routes in Upstream:**
   - Check if upstream introduced a new dashboard route under `src/app/[locale]/(authenticated)/`.
   - If added, verify that `src/middleware.ts` protected-paths list covers it (required by the automated middleware route scanner test).

2. **New Upstream i18n Translation Keys:**
   - Upstream might introduce new translation keys in `messages/*.json`.
   - Ensure your SaaS overlay or custom keys don't shadow or corrupt ICU arguments (`{arg}`) or rich-text tags. Run `npm test` to verify 100% key and signature parity across all locale files.

3. **Database Schema Assertions:**
   - If upstream updated `supabase/ci/verify-schema.sql`, verify that your SaaS assertions remain at the bottom of the single `DO $$ ... $$;` block.

4. **Preserve the 99/1 Rule:**
   - Never solve a conflict by refactoring or formatting surrounding upstream code. Keep edits on upstream files strictly to boundary calls and wrappers.
