# Release Preconditions Checklist

**Purpose**: Clear step-by-step guide for completing all requirements before releasing Phase 9 audit changes to production.

**Date**: 2026-07-27  
**Status**: 🟡 **3 of 4 preconditions pending**

---

## Precondition 1: PostgreSQL Integration Tests ✅ Ready

**Status**: ⏳ BLOCKED (requires desktop/laptop access)  
**Owner**: You (run locally when you have computer access)  
**Timeline**: Before staging deployment

### Setup (Choose ONE option below)

#### **Option A: Docker + Supabase CLI** (Recommended)
Best for: Clean local environment, fastest setup

**Steps**:
1. Ensure Docker daemon is running:
   ```bash
   # Linux:
   sudo systemctl start docker
   
   # macOS (with Docker Desktop installed):
   open -a Docker
   ```

2. Install Supabase CLI (if not already installed):
   ```bash
   npm install -g supabase
   # or macOS:
   brew install supabase/tap/supabase
   ```

3. Start Supabase local environment:
   ```bash
   cd /home/user/Dividenden-Tracker
   supabase start
   ```
   
   Expected output:
   ```
   API URL: http://localhost:54321
   DB URL: postgresql://postgres:postgres@127.0.0.1:5432/postgres
   Anon Key: eyJhbGc...
   Service Role Key: eyJhbGc...
   ```

4. Run integration tests:
   ```bash
   npm run test:integration
   ```

5. Wait for results (1–2 minutes):
   ```
   Test Files  3 passed (3)
   Tests       57 passed (57)
   Duration    ~45 seconds
   ```

6. Stop Supabase when done:
   ```bash
   supabase stop
   ```

---

#### **Option B: Manual PostgreSQL** (Advanced)
Best for: Already have PostgreSQL 15+ running

**Steps**:
1. Create test database:
   ```bash
   createdb dividend_tracker_test
   ```

2. Set connection string:
   ```bash
   export DATABASE_URL="postgresql://postgres@127.0.0.1:5432/dividend_tracker_test"
   ```

3. Apply migrations:
   ```bash
   npx supabase db push --db-url "$DATABASE_URL"
   ```

4. Run tests:
   ```bash
   npm run test:integration
   ```

---

#### **Option C: Remote PostgreSQL** (CI/CD-compatible)
Best for: Already have remote database credentials

**Steps**:
1. Get connection string from your provider (Render, Railway, Supabase Cloud, etc.):
   ```
   postgresql://[user]:[password]@[host]:[port]/[database]
   ```

2. Set environment variable:
   ```bash
   export DATABASE_URL="postgresql://user:password@host:5432/dbname"
   ```

3. Apply migrations:
   ```bash
   npx supabase db push --db-url "$DATABASE_URL"
   ```

4. Run tests:
   ```bash
   npm run test:integration
   ```

---

### Expected Test Results

**Success** (57/57 tests pass):
```
✓ tests/integration/rls.test.ts (19)
✓ tests/integration/constraints.test.ts (21)
✓ tests/integration/triggers.test.ts (16)

Test Files  3 passed (3)
Tests       57 passed (57)
```

**What's Being Tested**:
- ✅ Multi-user isolation (RLS enforcement on 23 tables)
- ✅ Financial data constraints (amounts, dates, foreign keys)
- ✅ Automatic triggers (timestamps, audit logs)
- ✅ Backup atomicity (all-or-nothing restore)

**If Tests Fail**:
See **Failure Diagnosis** section in INTEGRATION_TEST_GUIDE.md

---

## Precondition 2: Deployment Secrets Verification ⏳ Awaiting

**Status**: ⏳ PENDING (deployment environment not yet configured)  
**Owner**: DevOps / Deployment team  
**Timeline**: Before staging deployment

### Checklist

#### For Vercel/Netlify/Similar Hosting

1. Go to project settings → Environment Variables

2. Add or verify these variables:
   ```
   VITE_SUPABASE_URL = https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. Verify they are **not empty** and **not whitespace-only**

4. Test build locally with these values:
   ```bash
   export VITE_SUPABASE_URL="https://xxxxx.supabase.co"
   export VITE_SUPABASE_ANON_KEY="eyJhbGc..."
   npm run build
   ```

   Expected: Build succeeds, bundle contains app code (not white page)

#### For Self-Hosted Environments

1. Set environment variables in your deployment script:
   ```bash
   export VITE_SUPABASE_URL="https://xxxxx.supabase.co"
   export VITE_SUPABASE_ANON_KEY="eyJhbGc..."
   npm run build
   ```

2. Verify build output is ~1.4 MB (not 407 KB)

---

### Why This Matters

**Phase 9 Critical Finding (K-1):**
- Build was shipping app-less bundle (407 KB vendor-only code)
- Build exited successfully despite missing Supabase env vars
- Deployment would have shown white page to users
- Now prevented: Build fails loudly with exit 1 if vars missing

**Verification**:
```bash
# Test build WITHOUT env vars (should fail):
unset VITE_SUPABASE_URL
unset VITE_SUPABASE_ANON_KEY
npm run build
# Expected: Error with clear message about missing vars

# Test build WITH env vars (should succeed):
export VITE_SUPABASE_URL="https://xxxxx.supabase.co"
export VITE_SUPABASE_ANON_KEY="eyJhbGc..."
npm run build
# Expected: Success, bundle > 1 MB
```

---

## Precondition 3: Manual Post-Deployment Smoke Test ⏳ Awaiting

**Status**: ⏳ BLOCKED (deployment not yet performed)  
**Owner**: QA / Release manager  
**Timeline**: Immediately after deploy to staging, before production

### Pre-Deployment

- [ ] PostgreSQL integration tests passed (Precondition 1)
- [ ] Deployment secrets verified (Precondition 2)
- [ ] All unit tests passing (`npm run test` → 373/373)
- [ ] Branch reviewed and approved

### Deployment

Deploy `claude/phase-9-audit-release-c2fqo5` branch to staging environment

### Smoke Test Checklist

**Browser Access & Load**:
- [ ] Navigate to deployed URL in browser
- [ ] Page loads within 5 seconds
- [ ] No 500/503 errors in console
- [ ] Page is **NOT a white screen**

**Visual Verification**:
- [ ] UI renders correctly (not blank/broken)
- [ ] All text is visible
- [ ] Buttons and inputs are clickable
- [ ] Navigation bar present
- [ ] Theme toggle works (light/dark mode)

**Authentication**:
- [ ] Login page loads
- [ ] Can enter credentials
- [ ] Login button responsive
- [ ] After login: redirected to dashboard

**Dashboard Functionality**:
- [ ] Dashboard loads data
- [ ] KPI cards show numbers (not errors)
- [ ] Charts render without errors
- [ ] Year selector works
- [ ] Data refreshes when changed

**Navigation**:
- [ ] Can navigate to all major pages:
  - [ ] Dashboard
  - [ ] Dividends
  - [ ] Statistics
  - [ ] Goals
  - [ ] Settings
- [ ] Back/Forward browser buttons work
- [ ] No 404 errors

**Error Checking**:
- [ ] Open Browser DevTools (F12)
- [ ] Check Console tab
- [ ] Verify NO red errors
- [ ] Verify NO `undefined` warnings from app code
- [ ] Network tab shows all requests succeeded (200/304 status)

**Mobile Responsiveness** (if applicable):
- [ ] Test on mobile view (DevTools → Device Toolbar)
- [ ] 320px viewport: UI readable, no horizontal scroll
- [ ] 768px viewport: Tablet layout working
- [ ] Touch interactions work on mobile

---

### Pass Criteria

✅ **All of the following must be true**:
1. Page loads (not white screen, not error page)
2. Login works
3. Dashboard displays data
4. Navigation between pages works
5. No JavaScript errors in DevTools console
6. All network requests successful

✅ **If ALL pass**: **Smoke test PASSED** ✓ Safe to proceed to production

❌ **If ANY fail**: **Smoke test FAILED** ✗ Do not proceed to production; investigate error

---

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| White screen | Missing VITE_SUPABASE_URL/KEY | Verify Precondition 2 |
| "Cannot read property X of undefined" | Data not loading | Check network tab for 4xx/5xx errors |
| Login fails | Supabase config wrong | Verify DATABASE_URL on server |
| Charts not rendering | JavaScript error | Open DevTools console, copy error, file issue |
| Slow page load (>5s) | Bundle size issue | Check if exceljs is being lazy-loaded (optional at load time) |

---

## Precondition 4: Accessibility & Responsive Testing 🟡 Deferred (Optional for Phase 10)

**Status**: 🟡 PARTIAL (analytical testing done, real device testing needed)  
**Owner**: QA / Accessibility specialist  
**Timeline**: Before production (or Phase 10 backlog with acknowledgment)  
**Can Defer?**: Yes, with documented acknowledgment

### If Completing Now

#### Accessibility (WCAG 2.2 AA)

**Keyboard Navigation**:
- [ ] Can tab through all interactive elements
- [ ] Focus ring visible (blue outline)
- [ ] Can submit forms with Enter key
- [ ] Can close dialogs with Esc key
- [ ] Tab order is logical (top-to-bottom, left-to-right)

**Screen Reader Testing** (macOS VoiceOver, Windows NVDA):
- [ ] Page title announced
- [ ] Navigation structure understandable
- [ ] Form labels associated with inputs
- [ ] Buttons have accessible text (not just icons)
- [ ] Charts have text alternatives

**Color & Contrast**:
- [ ] No information conveyed by color alone
- [ ] Text contrast ≥ 4.5:1 for normal text
- [ ] Text contrast ≥ 3:1 for large text (18pt+)
- [ ] Use axe DevTools browser extension to scan for issues

**Interactive Elements**:
- [ ] All buttons keyboard accessible
- [ ] All form fields can be filled via keyboard
- [ ] Error messages are announced to screen readers
- [ ] Success messages are announced

---

#### Responsive Design (9 Breakpoints)

**Mobile (320px–480px)**:
- [ ] Layout single-column
- [ ] Text readable without zoom
- [ ] Buttons ≥ 44px touch targets
- [ ] No horizontal scroll
- [ ] Bottom navigation accessible

**Tablet (600px–1024px)**:
- [ ] Layout adapts to wider screen
- [ ] Navigation visible or easily accessible
- [ ] Content properly spaced
- [ ] Charts readable

**Desktop (1440px+)**:
- [ ] Full sidebar visible
- [ ] Multi-column layouts work
- [ ] Charts display clearly
- [ ] Performance good

**Orientation Changes**:
- [ ] Portrait → Landscape: Layout adapts
- [ ] No content cut off
- [ ] Navigation still accessible

**Zoom Levels**:
- [ ] 100% zoom: Normal view
- [ ] 125% zoom: Content readable, no overflow
- [ ] 150% zoom: Can still navigate, single-column as needed

---

### If Deferring to Phase 10

Create issue in backlog with:
```
Title: Phase 10.1 — Complete Accessibility & Responsive Testing

Description:
- [ ] VoiceOver testing (macOS/iOS)
- [ ] NVDA testing (Windows)
- [ ] axe DevTools scan
- [ ] Lighthouse audit
- [ ] 9 breakpoint visual verification
- [ ] Touch testing on real devices

Acceptance Criteria:
- WCAG 2.2 AA compliance verified
- All 9 breakpoints responsive
- No keyboard navigation issues
- Screen reader compatible
```

**Document in RELEASE_NOTES.md**:
```
## Known Limitations (Phase 9 Release)

⚠️ Accessibility and responsive design testing completed analytically but not with real devices/browsers:
- VoiceOver/NVDA manual testing deferred to Phase 10
- Real device responsive testing deferred to Phase 10
- Lighthouse audit deferred to Phase 10

See Phase 10.1 backlog for completion.
```

---

## Summary Table

| Precondition | Status | Owner | Timeline | Blocker? |
|---|---|---|---|---|
| 1. PostgreSQL tests (57 RLS tests) | ⏳ BLOCKED | You | Before staging | ✅ YES |
| 2. Deployment secrets | ⏳ PENDING | DevOps | Before deploy | ✅ YES |
| 3. Manual smoke test | ⏳ BLOCKED | QA | After deploy | ✅ YES |
| 4. Accessibility/responsive | 🟡 PARTIAL | QA | Before prod | ⚠️ CAN DEFER |

---

## Release Sign-Off

When all preconditions are met, fill in:

```
[ ] PostgreSQL tests: 57/57 PASS — Date: _________
[ ] Secrets verified in deployment env — Date: _________
[ ] Smoke test PASSED — Date: _________
[ ] Accessibility/responsive tested (or deferred) — Date: _________

Approved by: _________________________ Date: _________
```

Then merge `claude/phase-9-audit-release-c2fqo5` to main and deploy to production.

---

**Questions?** See PHASE_9_RELEASE_READINESS.md for full context, or INTEGRATION_TEST_GUIDE.md for PostgreSQL setup details.

