// seed-test.mjs — creates 5 test backlog agents in SharePoint
// Run: node scripts/seed-test.mjs

const TENANT_ID    = process.env.TENANT_ID    || "YOUR_TENANT_ID";
const CLIENT_ID    = process.env.CLIENT_ID    || "YOUR_CLIENT_ID";
const CLIENT_SECRET= process.env.CLIENT_SECRET|| "YOUR_CLIENT_SECRET";
const SITE_ID      = process.env.SITE_ID      || "YOUR_SITE_ID";
const LIST_ID      = process.env.LIST_ID      || "YOUR_LIST_ID";

const TEST_AGENTS = [
  {
    Title:        "Invoice Processing Bot",
    Industry:     "Financial Services",
    Tier:         "Connected Agent",
    Description:  "Reads incoming supplier invoices from Outlook, extracts key fields (amount, due date, supplier ABN), posts to Xero, and flags any anomalies for review.",
    WhyItMatters: "AU SMBs spend an average of 4 hours per week on manual invoice entry. Automating this reduces errors and frees up bookkeeper time.",
    AUContext:    "Integrates with Xero and MYOB — the two dominant accounting platforms in Australia. Supports ATO-compliant tax invoice requirements.",
    BuildNotes:   "Uses Azure AI Document Intelligence for extraction. Requires Xero OAuth connection and Graph API for Outlook.",
    Connectors:   "Xero, MYOB, Outlook, Power Automate, SharePoint",
    UpsellPath:   "Upgrade to full AP automation with payment run approvals.",
    Status:       "backlog",
    Published:    "Yes",
    Iterations:   JSON.stringify([
      { name: "1.1 Xero Basic", auContext: "Single Xero org, standard invoices only", connector: "Xero API, Outlook Graph", buildNotes: "MVP — no anomaly detection" },
      { name: "1.2 Multi-platform", auContext: "Supports Xero + MYOB side by side", connector: "Xero, MYOB, Outlook", buildNotes: "Requires conditional routing logic" },
    ]),
  },
  {
    Title:        "BAS Readiness Checker",
    Industry:     "Financial Services",
    Tier:         "Prompt Agent",
    Description:  "Two weeks before each BAS deadline, scans Xero for unreconciled transactions, uncoded expenses, and missing supplier invoices. Sends a prioritised task list to the business owner.",
    WhyItMatters: "Unreconciled transactions are the #1 cause of BAS errors in AU. Early detection prevents rushed lodgements and ATO penalties.",
    AUContext:    "Aligned to Australian quarterly BAS cycle (Oct, Feb, Apr, Jul deadlines). Checks ATO portal method (cash vs accrual).",
    BuildNotes:   "Scheduled trigger via Azure Timer Function. Queries Xero reports API. Sends digest via Outlook.",
    Connectors:   "Xero, MYOB, Outlook, Teams",
    UpsellPath:   "Bundle with GST Coding Validator for full BAS compliance suite.",
    Status:       "backlog",
    Published:    "Yes",
    Iterations:   JSON.stringify([
      { name: "1.1 Xero Only", auContext: "Quarterly BAS reminder for Xero users", connector: "Xero, Outlook", buildNotes: "Read-only, no write-back required" },
    ]),
  },
  {
    Title:        "Leave & Entitlements Copilot",
    Industry:     "HR & Workforce",
    Tier:         "Connected Agent",
    Description:  "Answers staff leave balance queries via Teams, validates leave requests against Fair Work entitlements, and syncs approvals to the payroll system and Outlook calendar.",
    WhyItMatters: "HR teams in AU SMBs spend significant time answering routine leave questions. This agent handles the full loop without HR involvement.",
    AUContext:    "Calculates entitlements per the Fair Work Act — annual leave (4 weeks), personal/carer's leave (10 days), and long service leave by state.",
    BuildNotes:   "Teams bot via Azure Bot Framework. Connects to Employment Hero or KeyPay for live balances. State-based LSL rules require lookup table.",
    Connectors:   "Microsoft Teams, Employment Hero, KeyPay, Outlook Calendar, SharePoint",
    UpsellPath:   "Expand to full onboarding automation suite.",
    Status:       "backlog",
    Published:    "Yes",
    Iterations:   JSON.stringify([
      { name: "1.1 Balance Query Only", auContext: "Read-only — answers balance questions via Teams", connector: "Employment Hero, Teams", buildNotes: "Simplest build, no approval workflow" },
      { name: "1.2 Full Approval Flow", auContext: "Request → manager approval → calendar block", connector: "Employment Hero, Teams, Outlook", buildNotes: "Requires Power Automate approval connector" },
      { name: "1.3 LSL Calculator", auContext: "State-based long service leave calculation", connector: "Employment Hero, Teams", buildNotes: "Lookup table per state — VIC, NSW, QLD differ" },
    ]),
  },
  {
    Title:        "Google Review Response Agent",
    Industry:     "Retail & eCommerce",
    Tier:         "Prompt Agent",
    Description:  "Monitors new Google Business Profile reviews, drafts personalised responses using the business's tone of voice, and sends for one-click approval before posting.",
    WhyItMatters: "Businesses that respond to reviews see 12% more reviews on average. Most AU SMBs never respond — this removes the friction entirely.",
    AUContext:    "Tuned for AU English tone. Handles common AU retail and hospitality review themes (parking, EFTPOS, service wait times).",
    BuildNotes:   "Polling via Google My Business API. Drafts via Azure OpenAI. Approval via Teams Adaptive Card or Outlook actionable message.",
    Connectors:   "Google Business Profile API, Teams, Outlook, SharePoint (tone guide)",
    UpsellPath:   "Add Yelp, TripAdvisor, and Facebook review monitoring.",
    Status:       "backlog",
    Published:    "Yes",
    Iterations:   JSON.stringify([
      { name: "1.1 Google Only, Manual Post", auContext: "Draft response for owner to copy-paste", connector: "Google Business Profile, Outlook", buildNotes: "No write-back — lowest risk MVP" },
      { name: "1.2 One-Click Approve & Post", auContext: "Approval card → auto-post to Google", connector: "Google Business Profile, Teams Adaptive Cards", buildNotes: "Requires Google API write permissions" },
    ]),
  },
  {
    Title:        "Payday Super Compliance Tracker",
    Industry:     "HR & Workforce",
    Tier:         "Orchestration Agent",
    Description:  "Monitors that superannuation is paid with every payroll cycle per the new July 2026 Payday Super laws. Verifies contributions are received by the employee's fund — not just sent — and alerts on any gaps.",
    WhyItMatters: "From 1 July 2026, every AU employer must pay super with each pay run. The ATO is using automated data-matching to detect non-compliance. Penalties apply per missed payment.",
    AUContext:    "Mandatory for all Australian employers from 1 July 2026. Integrates with SuperStream gateway data to confirm fund receipt. Tracks SGC rate (currently 11.5%, rising to 12% Jul 2025).",
    BuildNotes:   "Requires payroll system webhook or scheduled query. Cross-references SuperStream clearing house confirmation. Escalation via Teams if fund receipt not confirmed within 3 business days.",
    Connectors:   "Xero Payroll, KeyPay, Employment Hero, ATO SuperStream, Teams, Outlook",
    UpsellPath:   "Bundle with STP Lodgement Copilot for full payroll compliance suite.",
    Status:       "backlog",
    Published:    "Yes",
    Iterations:   JSON.stringify([
      { name: "1.1 Payment Sent Monitor", auContext: "Confirms super is sent each pay run (not quarterly)", connector: "Xero Payroll, Outlook", buildNotes: "Basic check — sent vs not sent per pay run" },
      { name: "1.2 Fund Receipt Verification", auContext: "Confirms fund received contribution via SuperStream", connector: "Xero Payroll, SuperStream, Teams", buildNotes: "Requires SuperStream clearing house API access" },
      { name: "1.3 Contractor Classification Check", auContext: "Flags workers who may be misclassified as contractors", connector: "Xero, Employment Hero, Teams", buildNotes: "ATO uses similar logic — reduces audit risk" },
    ]),
  },
];

async function getToken() {
  const url  = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type:    "client_credentials",
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         "https://graph.microsoft.com/.default",
  });
  const res  = await fetch(url, { method: "POST", body });
  const data = await res.json();
  if (!data.access_token) throw new Error("Token error: " + JSON.stringify(data));
  return data.access_token;
}

async function createItem(token, fields) {
  const url = `https://graph.microsoft.com/v1.0/sites/${SITE_ID}/lists/${LIST_ID}/items`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Create failed: ${JSON.stringify(data)}`);
  return data;
}

const token = await getToken();
console.log("✓ Token acquired\n");

for (const agent of TEST_AGENTS) {
  const item = await createItem(token, agent);
  console.log(`✓ Created: "${agent.Title}" (ID: ${item.id})`);
}

console.log("\nDone — 5 test agents created in SharePoint.");
