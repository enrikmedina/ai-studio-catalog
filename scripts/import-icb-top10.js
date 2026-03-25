// scripts/import-icb-top10.js
// Usage: node import-icb-top10.js
//
// Reads agents from: icb-top10-agents.json
// For each agent:
//   1. Check if item with matching Title already exists (skip if found)
//   2. POST to Graph to create list item
//   3. Status = "backlog", Published = false (as per source data)
//   4. Logs success/skip to console
//
// Auth: client_credentials from .env file in this directory
// Rate limiting: 200ms delay between requests to avoid Graph throttling

'use strict';

const fs   = require('fs');
const path = require('path');

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
  return (await res.json()).access_token;
}

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
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${await res.text()}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const dataPath = path.join(__dirname, 'icb-top10-agents.json');
  if (!fs.existsSync(dataPath)) {
    console.error(`ERROR: icb-top10-agents.json not found at ${dataPath}`);
    process.exit(1);
  }

  const agents = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  console.log(`\n📋 ICB Top 10 Agent Backlog Import`);
  console.log(`   Found ${agents.length} agents to import\n`);

  console.log('🔑 Acquiring access token…');
  const token = await getToken();
  console.log('   ✓ Token acquired\n');

  console.log('📥 Loading existing SharePoint items…');
  let existingTitles = new Set();
  try {
    let url = `${GRAPH_BASE}/items?expand=fields&$top=500`;
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

  let created = 0, skipped = 0, failed = 0;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const num   = `[${String(i + 1).padStart(2, ' ')}/${agents.length}]`;

    if (existingTitles.has(agent.Title)) {
      console.log(`${num} ⏭  SKIP    ${agent.Title}`);
      skipped++;
    } else {
      try {
        const { ICBMemberType, Published, ...fields } = agent;
        await graphPost(`${GRAPH_BASE}/items`, token, { fields });
        console.log(`${num} ✓  CREATED ${agent.Title}`);
        created++;
      } catch (err) {
        console.error(`${num} ✗  FAILED  ${agent.Title} — ${err.message}`);
        failed++;
      }
    }

    if (i < agents.length - 1) await sleep(200);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`   Created: ${created}  |  Skipped: ${skipped}  |  Failed: ${failed}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) {
    console.log('⚠️  Some agents failed. Re-run — skips handle duplicates safely.');
    process.exit(1);
  } else {
    console.log('✅  Import complete!\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
