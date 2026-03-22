// scripts/seed-sharepoint.js
// Usage: node seed-sharepoint.js
//
// Reads agents from: ../public/agents-data.json
// For each agent:
//   1. Check if item with matching Title already exists (skip if found)
//   2. POST to Graph to create list item
//   3. Sets Published = true, Status = "available"
//   4. Logs success/skip to console
//
// Auth: client_credentials from .env file in this directory
// Rate limiting: 200ms delay between requests to avoid Graph throttling

'use strict';

const fs   = require('fs');
const path = require('path');

// Load .env from scripts/ directory
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: Missing scripts/.env file. Copy .env.example and fill in your values.');
  process.exit(1);
}
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && k.trim() && !k.startsWith('#')) {
    process.env[k.trim()] = v.join('=').trim();
  }
}

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, SHAREPOINT_SITE_ID, LIST_ID } = process.env;

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !SHAREPOINT_SITE_ID || !LIST_ID) {
  console.error('ERROR: Missing required env vars. Ensure .env contains:\n  TENANT_ID, CLIENT_ID, CLIENT_SECRET, SHAREPOINT_SITE_ID, LIST_ID');
  process.exit(1);
}

const GRAPH_BASE = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/lists/${LIST_ID}`;

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function getToken() {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  });

  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) throw new Error(`Token request failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// ── GRAPH HELPERS ─────────────────────────────────────────────────────────────
async function graphGet(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`GET ${url} failed: ${await res.text()}`);
  return res.json();
}

async function graphPost(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${await res.text()}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── MAP AGENT DATA ────────────────────────────────────────────────────────────
// agents-data.json uses the old HTML keys; map to SharePoint internal names
function mapToFields(agent) {
  return {
    Title:       agent['Agent Name'],
    Industry:    agent['Industry'],
    Tier:        agent['Tier'],
    Points:      agent['Points'],
    UseCaseType: agent['Use Case Type'],
    Description: agent['Description'],
    AUContext:   agent['AU-Specific Context'],
    BuildNotes:  agent['Copilot Studio Build Notes'],
    Connectors:  agent['Connectors / Features'],
    UpsellPath:  agent['Upsell Path'],
    Status:      'available',
    Published:   true,
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const dataPath = path.join(__dirname, '..', 'public', 'agents-data.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`ERROR: agents-data.json not found at ${dataPath}`);
    process.exit(1);
  }

  const agents = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`\n📋 AI Studio Catalog Seed Script`);
  console.log(`   Found ${agents.length} agents in agents-data.json\n`);

  console.log('🔑 Acquiring access token…');
  const token = await getToken();
  console.log('   ✓ Token acquired\n');

  // Load all existing titles from SharePoint for duplicate check
  console.log('📥 Loading existing SharePoint items…');
  let existingTitles = new Set();
  try {
    let url = `${GRAPH_BASE}/items?$select=id,fields&$expand=fields(select=Title)&$top=500`;
    while (url) {
      const data = await graphGet(url, token);
      for (const item of data.value) {
        if (item.fields?.Title) existingTitles.add(item.fields.Title);
      }
      url = data['@odata.nextLink'] || null;
    }
    console.log(`   ✓ Found ${existingTitles.size} existing items\n`);
  } catch (err) {
    console.warn(`   ⚠️  Could not load existing items — will attempt to insert all. (${err.message})\n`);
  }

  // Seed each agent
  let created = 0, skipped = 0, failed = 0;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const name  = agent['Agent Name'];
    const num   = `[${String(i + 1).padStart(3, ' ')}/${agents.length}]`;

    if (existingTitles.has(name)) {
      console.log(`${num} ⏭  SKIP    ${name}`);
      skipped++;
    } else {
      try {
        const fields = mapToFields(agent);
        await graphPost(`${GRAPH_BASE}/items`, token, { fields });
        console.log(`${num} ✓  CREATED ${name}`);
        created++;
      } catch (err) {
        console.error(`${num} ✗  FAILED  ${name} — ${err.message}`);
        failed++;
      }
    }

    // Rate limit: 200ms between requests
    if (i < agents.length - 1) await sleep(200);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`   Created: ${created}  |  Skipped: ${skipped}  |  Failed: ${failed}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) {
    console.log('⚠️  Some agents failed to import. Re-run the script — skips handle duplicates safely.');
    process.exit(1);
  } else {
    console.log('✅  Seed complete! Verify in SharePoint that all agents appear with Published = true.\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
