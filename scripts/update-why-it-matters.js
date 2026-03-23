'use strict';

// scripts/update-why-it-matters.js
// Reads WhyItMatters from v2 XML and PATCHes all matching SharePoint items
// Usage: node update-why-it-matters.js [path-to-xml]

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── LOAD .env ──────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const [k, ...v] = line.split('=');
  if (k && k.trim() && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim();
}

const { TENANT_ID, CLIENT_ID, CLIENT_SECRET, SHAREPOINT_SITE_ID, LIST_ID } = process.env;
const GRAPH_BASE = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/lists/${LIST_ID}`;

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function getToken() {
  const r = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET, scope: 'https://graph.microsoft.com/.default',
    }),
  });
  return (await r.json()).access_token;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── XML PARSER ─────────────────────────────────────────────────────────────────
function parseWhyItMatters(xml) {
  const map = {};
  const agentRe = /<agent>([\s\S]*?)<\/agent>/g;
  let m;
  while ((m = agentRe.exec(xml)) !== null) {
    const block = m[1];
    const titleM = /<Title>([\s\S]*?)<\/Title>/.exec(block);
    const whyM   = /<WhyItMatters>([\s\S]*?)<\/WhyItMatters>/.exec(block);
    if (titleM && whyM) {
      const title = titleM[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
      const why   = whyM[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
      map[title] = why;
    }
  }
  return map;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const xmlPath = process.argv[2] || path.join(os.homedir(), 'Downloads', 'AI_Studio_SMBReady_v2.xml');

  if (!fs.existsSync(xmlPath)) {
    console.error(`ERROR: XML not found at: ${xmlPath}`);
    process.exit(1);
  }

  const whyMap = parseWhyItMatters(fs.readFileSync(xmlPath, 'utf8'));
  console.log(`\n📋 WhyItMatters Update`);
  console.log(`   Parsed ${Object.keys(whyMap).length} entries from XML\n`);

  console.log('🔑 Acquiring token…');
  const token = await getToken();
  console.log('   ✓ Token acquired\n');

  // Fetch all SharePoint items
  console.log('📥 Loading SharePoint items…');
  const items = [];
  let url = `${GRAPH_BASE}/items?$expand=fields($select=Title)&$top=500`;
  while (url) {
    const r    = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const data = await r.json();
    items.push(...data.value);
    url = data['@odata.nextLink'] || null;
  }
  console.log(`   ✓ Found ${items.length} items\n`);

  let updated = 0, skipped = 0, failed = 0;

  for (let i = 0; i < items.length; i++) {
    const item  = items[i];
    const title = item.fields?.Title || '';
    const num   = `[${String(i + 1).padStart(3, ' ')}/${items.length}]`;
    const why   = whyMap[title];

    if (!why) {
      console.log(`${num} ⏭  NO MATCH  ${title}`);
      skipped++;
      continue;
    }

    try {
      const r = await fetch(`${GRAPH_BASE}/items/${item.id}/fields`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ WhyItMatters: why }),
      });
      if (!r.ok) throw new Error(`${r.status}: ${await r.text()}`);
      console.log(`${num} ✓  ${title}`);
      updated++;
    } catch (err) {
      console.error(`${num} ✗  ${title} — ${err.message}`);
      failed++;
    }

    if (i < items.length - 1) await sleep(100);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`   Updated: ${updated}  |  Skipped: ${skipped}  |  Failed: ${failed}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) process.exit(1);
  else console.log('✅  Done!\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
