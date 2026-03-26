# My Claims Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "My Claims" dropdown to the catalog header that shows when the user clicks their name/avatar — listing every agent and variation they have claimed, with ADO task links.

**Architecture:** All changes are in a single file (`public/au-agent-catalog.html`). The dropdown filters the in-memory `AGENTS` array (already loaded on page load) for claims matching `currentUserEmail`. No new API endpoints. The existing `.user-greeting` div becomes the toggle trigger; the dropdown is a child element hidden by default.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, no build tools. Azure Static Web Apps (SWA) for auth context.

---

### Task 1: Add CSS for the dropdown

**Files:**
- Modify: `public/au-agent-catalog.html` (inside the `<style>` block, after the `.logout-btn` rule ~line 140)

- [ ] **Step 1: Locate the insertion point**

Open `public/au-agent-catalog.html`. Find the `.logout-btn:hover` rule (around line 140). The new CSS goes immediately after it.

- [ ] **Step 2: Insert the CSS**

Add after the `.logout-btn:hover { ... }` rule:

```css
  /* ── MY CLAIMS DROPDOWN ── */
  .user-greeting {
    position: relative;
    cursor: pointer;
    border-radius: 8px;
    padding: 4px 8px;
    transition: background .15s;
  }
  .user-greeting:hover { background: rgba(52,223,186,.08); }
  .user-greeting-chevron {
    font-size: 10px;
    color: var(--muted);
    margin-left: 2px;
    transition: transform .2s;
  }
  .user-greeting.open .user-greeting-chevron { transform: rotate(180deg); }
  .claims-dropdown {
    display: none;
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    width: 288px;
    background: white;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    z-index: 200;
    overflow: hidden;
  }
  .claims-dropdown.open { display: block; }
  .claims-dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--border);
  }
  .claims-dropdown-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .07em;
  }
  .claims-count-badge {
    font-size: 11px;
    color: var(--muted);
    background: var(--cream);
    padding: 1px 8px;
    border-radius: 10px;
  }
  .claims-list { padding: 6px 0; max-height: 320px; overflow-y: auto; }
  .claims-empty {
    padding: 14px;
    font-size: 12px;
    color: var(--muted);
    text-align: center;
  }
  .claim-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 14px;
    gap: 8px;
  }
  .claim-row-info { flex: 1; min-width: 0; }
  .claim-row-name {
    font-size: 12px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .claim-row-variation {
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .claim-row-link {
    font-size: 11px;
    color: var(--teal);
    text-decoration: none;
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: 600;
  }
  .claim-row-link:hover { text-decoration: underline; }
  .claims-dropdown-footer {
    border-top: 1px solid var(--border);
    padding: 8px 14px;
  }
  .claims-dropdown-footer a {
    font-size: 12px;
    color: var(--muted);
    text-decoration: none;
  }
  .claims-dropdown-footer a:hover { color: var(--ink); }
```

- [ ] **Step 3: Verify no existing `.user-greeting` rules conflict**

Search the file for other `.user-greeting` rules. The existing one sets `display: flex; align-items: center; gap: 8px; flex-shrink: 0;` — these are preserved; the new block adds more properties. The `position: relative` and `cursor: pointer` additions are safe to merge by ensuring the original rule stays and the new block supplements it.

Actually, merge cleanly: replace the original `.user-greeting` rule at ~line 122 with:

```css
  .user-greeting {
    display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    position: relative;
    cursor: pointer;
    border-radius: 8px;
    padding: 4px 8px;
    transition: background .15s;
  }
  .user-greeting:hover { background: rgba(52,223,186,.08); }
```

And then add all the remaining new rules (`.user-greeting-chevron` onwards) after `.logout-btn:hover`.

- [ ] **Step 4: Commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add public/au-agent-catalog.html
git commit -m "feat: add CSS for My Claims dropdown"
```

---

### Task 2: Update header HTML

**Files:**
- Modify: `public/au-agent-catalog.html` (header section, ~lines 912-921)

- [ ] **Step 1: Locate the header HTML**

Find this block (around line 912):

```html
    <!-- Right: user greeting only -->
    <div class="header-right">
      <div class="user-greeting" id="userGreeting" style="display:none">
        <div class="user-avatar" id="userAvatar"></div>
        <span class="user-name">Hi, <strong id="userName"></strong></span>
        <a class="logout-btn" href="/.auth/logout?post_logout_redirect_uri=/public/logged-out.html">Sign out</a>
      </div>
    </div>
```

- [ ] **Step 2: Replace with updated HTML**

Replace that entire block with:

```html
    <!-- Right: user greeting only -->
    <div class="header-right">
      <div class="user-greeting" id="userGreeting" style="display:none">
        <div class="user-avatar" id="userAvatar"></div>
        <span class="user-name">Hi, <strong id="userName"></strong></span>
        <span class="user-greeting-chevron">▾</span>
        <!-- My Claims dropdown -->
        <div class="claims-dropdown" id="claimsDropdown">
          <div class="claims-dropdown-header">
            <span class="claims-dropdown-title">My Claims</span>
            <span class="claims-count-badge" id="claimsCount">0</span>
          </div>
          <div class="claims-list" id="claimsList"></div>
          <div class="claims-dropdown-footer">
            <a href="/.auth/logout?post_logout_redirect_uri=/public/logged-out.html">Sign out</a>
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Commit**

```bash
git add public/au-agent-catalog.html
git commit -m "feat: update header HTML for My Claims dropdown"
```

---

### Task 3: Add JS — buildClaimsDropdown() and toggle logic

**Files:**
- Modify: `public/au-agent-catalog.html` (inside `<script>`, after `loadUser()` function, before `// ── CONFIG ──`)

- [ ] **Step 1: Add `buildClaimsDropdown()` after `loadUser()`**

Find the line `loadUser();` (~line 1075). Insert the following new function block immediately after it:

```javascript
// ── MY CLAIMS DROPDOWN ────────────────────────────────────────────────────────
function buildClaimsDropdown() {
  if (!currentUserEmail) return;

  const claims = [];

  for (const a of AGENTS) {
    const name = a['Agent Name'];

    // Parent claim
    if (a['ClaimedBy'] && a['ClaimedBy'].toLowerCase() === currentUserEmail.toLowerCase()) {
      claims.push({
        name,
        variation: null,
        taskId:  a['ClaimedTaskId'],
        taskUrl: a['ClaimedTaskUrl'],
      });
    }

    // Variation claims
    let vars = [];
    try { vars = JSON.parse(a['ClaimedVariations'] || '[]'); } catch {}
    for (const v of vars) {
      if (v.claimedBy && v.claimedBy.toLowerCase() === currentUserEmail.toLowerCase()) {
        claims.push({
          name,
          variation: v.name,
          taskId:  v.taskId,
          taskUrl: v.taskUrl,
        });
      }
    }
  }

  const list  = document.getElementById('claimsList');
  const badge = document.getElementById('claimsCount');
  if (!list || !badge) return;

  badge.textContent = claims.length;

  if (!claims.length) {
    list.innerHTML = '<div class="claims-empty">No claims yet</div>';
    return;
  }

  list.innerHTML = claims.map(c => `
    <div class="claim-row">
      <div class="claim-row-info">
        <div class="claim-row-name">${c.name}</div>
        ${c.variation ? `<div class="claim-row-variation">${c.variation}</div>` : ''}
      </div>
      ${c.taskUrl ? `<a class="claim-row-link" href="${c.taskUrl}" target="_blank" rel="noopener">#${c.taskId} ↗</a>` : ''}
    </div>
  `).join('');
}

function initClaimsDropdown() {
  const trigger  = document.getElementById('userGreeting');
  const dropdown = document.getElementById('claimsDropdown');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', e => {
    // Don't toggle when clicking the sign-out link inside the dropdown
    if (e.target.closest('.claims-dropdown-footer')) return;
    const isOpen = trigger.classList.toggle('open');
    dropdown.classList.toggle('open', isOpen);
  });

  document.addEventListener('click', e => {
    if (!trigger.contains(e.target)) {
      trigger.classList.remove('open');
      dropdown.classList.remove('open');
    }
  });
}
```

- [ ] **Step 2: Call `initClaimsDropdown()` inside `loadUser()`**

Find the line inside `loadUser()` that sets `display = 'flex'`:

```javascript
    document.getElementById('userGreeting').style.display = 'flex';
```

Add `initClaimsDropdown();` on the next line:

```javascript
    document.getElementById('userGreeting').style.display = 'flex';
    initClaimsDropdown();
```

- [ ] **Step 3: Call `buildClaimsDropdown()` at the end of `loadAgents()` (after `render()`)**

Find in `loadAgents()` (around line 1235):

```javascript
    render();
  } catch (err) {
```

Change to:

```javascript
    render();
    buildClaimsDropdown();
  } catch (err) {
```

- [ ] **Step 4: Call `buildClaimsDropdown()` after each successful parent claim**

Find the parent claim success handler (around line 1534):

```javascript
    if (a) { a['ClaimedBy'] = currentUserEmail; a['ClaimedTaskId'] = id; a['ClaimedTaskUrl'] = url; }
```

Add `buildClaimsDropdown();` on the next line:

```javascript
    if (a) { a['ClaimedBy'] = currentUserEmail; a['ClaimedTaskId'] = id; a['ClaimedTaskUrl'] = url; }
    buildClaimsDropdown();
```

- [ ] **Step 5: Call `buildClaimsDropdown()` after each successful variation claim**

Find the variation claim success handler (around line 1574):

```javascript
      a['ClaimedVariations'] = JSON.stringify(vars);
```

Add `buildClaimsDropdown();` on the next line:

```javascript
      a['ClaimedVariations'] = JSON.stringify(vars);
      buildClaimsDropdown();
```

- [ ] **Step 6: Commit**

```bash
git add public/au-agent-catalog.html
git commit -m "feat: add My Claims dropdown JS — build, toggle, refresh on claim"
```

---

### Task 4: Manual verification

**Files:**
- Read: `public/au-agent-catalog.html` (final check)

- [ ] **Step 1: Check for XSS in claim row HTML**

`buildClaimsDropdown()` inlines `c.name`, `c.variation`, `c.taskId`, and `c.taskUrl` directly into HTML. These values come from SharePoint (trusted internal data), but add a minimal text-escape helper to be safe. Find the `buildClaimsDropdown` function and prepend this helper, then use it for name and variation:

```javascript
function buildClaimsDropdown() {
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  if (!currentUserEmail) return;
  // ... rest of function unchanged, but wrap string values:
  // c.name → esc(c.name)
  // c.variation → esc(c.variation)
  // c.taskUrl stays in an href attribute (already quoted), c.taskId is a number
```

Updated `list.innerHTML` map:

```javascript
  list.innerHTML = claims.map(c => `
    <div class="claim-row">
      <div class="claim-row-info">
        <div class="claim-row-name">${esc(c.name)}</div>
        ${c.variation ? `<div class="claim-row-variation">${esc(c.variation)}</div>` : ''}
      </div>
      ${c.taskUrl ? `<a class="claim-row-link" href="${c.taskUrl}" target="_blank" rel="noopener">#${c.taskId} ↗</a>` : ''}
    </div>
  `).join('');
```

- [ ] **Step 2: Open the catalog in a browser**

Serve the file via SWA or a local dev server. Log in. Verify:
- Name/avatar is visible in the header
- Clicking the name opens the dropdown
- "No claims yet" appears if you have no claims
- Clicking outside closes the dropdown
- Chevron rotates when open

- [ ] **Step 3: Claim an agent and verify the dropdown updates**

Claim any available agent. After the claim button updates to "✓ Claimed", open the dropdown — the claimed agent should now appear in the list with its ADO task link.

- [ ] **Step 4: Commit**

```bash
git add public/au-agent-catalog.html
git commit -m "fix: escape agent names in My Claims dropdown to prevent XSS"
```
