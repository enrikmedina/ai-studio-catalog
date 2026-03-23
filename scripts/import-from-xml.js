'use strict';

// scripts/import-from-xml.js
// Imports agents from AI_Studio_SMBReady_AgentCatalog.xml into SharePoint
// Usage: node import-from-xml.js [path-to-xml]
// Defaults to ~/Downloads/AI_Studio_SMBReady_AgentCatalog.xml

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── LOAD .env ──────────────────────────────────────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('ERROR: Missing scripts/.env file.');
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
  console.error('ERROR: Missing required env vars in .env');
  process.exit(1);
}

const GRAPH_BASE = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/lists/${LIST_ID}`;

// ── AUTH ──────────────────────────────────────────────────────────────────────
async function getToken() {
  const url  = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
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

async function graphPost(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── XML PARSER ────────────────────────────────────────────────────────────────
// Simple regex-based parser — no external deps needed
function parseXml(xml) {
  const agents = [];
  const agentRegex = /<agent>([\s\S]*?)<\/agent>/g;
  let match;
  while ((match = agentRegex.exec(xml)) !== null) {
    const block = match[1];
    const fields = [
      'Title', 'Industry', 'Tier', 'Points', 'UseCaseType',
      'Description', 'AUContext', 'BuildNotes', 'Connectors',
      'UpsellPath', 'Status', 'Published',
    ];
    const agent = {};
    for (const f of fields) {
      const re = new RegExp(`<${f}>([\\s\\S]*?)<\\/${f}>`);
      const m  = re.exec(block);
      if (m) {
        // Decode XML entities
        agent[f] = m[1]
          .replace(/&amp;/g,  '&')
          .replace(/&lt;/g,   '<')
          .replace(/&gt;/g,   '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .trim();
      }
    }
    if (agent.Title) agents.push(agent);
  }
  return agents;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const xmlPath = process.argv[2] || path.join(os.homedir(), 'Downloads', 'AI_Studio_SMBReady_AgentCatalog.xml');

  if (!fs.existsSync(xmlPath)) {
    console.error(`ERROR: XML file not found at: ${xmlPath}`);
    console.error('Usage: node import-from-xml.js [path-to-xml]');
    process.exit(1);
  }

  const xml    = fs.readFileSync(xmlPath, 'utf8');
  const agents = parseXml(xml);

  console.log(`\n📋 XML Import — AI Studio Agent Catalog`);
  console.log(`   XML file:  ${xmlPath}`);
  console.log(`   Agents found: ${agents.length}\n`);

  if (agents.length === 0) {
    console.error('ERROR: No <agent> elements found in the XML.');
    process.exit(1);
  }

  console.log('🔑 Acquiring access token…');
  const token = await getToken();
  console.log('   ✓ Token acquired\n');

  let created = 0, failed = 0;

  for (let i = 0; i < agents.length; i++) {
    const a   = agents[i];
    const num = `[${String(i + 1).padStart(3, ' ')}/${agents.length}]`;

    const fields = {
      Title:       a.Title       || '',
      Industry:    a.Industry    || '',
      Tier:        a.Tier        || '',
      Points:      a.Points ? Number(a.Points) : 0,
      UseCaseType: a.UseCaseType || '',
      Description: a.Description || '',
      AUContext:   a.AUContext   || '',
      BuildNotes:  a.BuildNotes  || '',
      Connectors:  a.Connectors  || '',
      UpsellPath:  a.UpsellPath  || '',
      Status:      'backlog',   // all imported as backlog
      Published:   'Yes',
    };

    try {
      await graphPost(`${GRAPH_BASE}/items`, token, { fields });
      console.log(`${num} ✓  ${a.Title}`);
      created++;
    } catch (err) {
      console.error(`${num} ✗  ${a.Title} — ${err.message}`);
      failed++;
    }

    if (i < agents.length - 1) await sleep(150);
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`   Created: ${created}  |  Failed: ${failed}`);
  console.log(`${'─'.repeat(60)}\n`);

  if (failed > 0) {
    console.log('⚠️  Some agents failed. Re-run — already imported ones will be duplicates only if title-check is added.');
    process.exit(1);
  } else {
    console.log('✅  Import complete!\n');
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
