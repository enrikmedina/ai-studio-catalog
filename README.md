# AI Studio Agent Catalog

SharePoint-backed agent catalog for mySMB AI Studio.

## Architecture

```
PUBLIC USER  →  au-agent-catalog.html  →  Azure Function (/api/agents)  →  SharePoint List
ADMIN USER   →  au-agent-admin.html    →  MSAL.js (delegated)           →  SharePoint List
```

## Setup

Follow these steps in order. Steps 1–4 require a Global Admin or Application Admin.

### 1. Create the SharePoint List

- Create a list named `AgentCatalog` in your mySMB SharePoint site
- Add all columns from the spec (see column reference below)

### 2. App Registration — Azure Function (read-only)

- Entra ID → App registrations → New: **AI Studio Catalog Reader**
- API permissions → Microsoft Graph → **Application** → `Sites.Read.All` → grant admin consent
- Certificates & secrets → New client secret → copy immediately

### 3. App Registration — Admin Page (read/write)

- Entra ID → App registrations → New: **AI Studio Catalog Admin**
- Platform: Single-page application → redirect URI: URL of `au-agent-admin.html`
- API permissions → Microsoft Graph → **Delegated** → `Sites.ReadWrite.All` → grant admin consent
- No client secret needed

### 4. Get SharePoint Site ID and List ID

Via [Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer):

```
GET https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/{siteName}
GET https://graph.microsoft.com/v1.0/sites/{siteId}/lists?$filter=name eq 'AgentCatalog'
```

### 5. Deploy the Azure Function

```bash
cd function
npm install
npm run build
# Deploy via Azure Portal or GitHub Actions (push to main)
```

Set these in Function App Settings:
```
TENANT_ID
CLIENT_ID
CLIENT_SECRET
SHAREPOINT_SITE_ID
LIST_ID
```

Test: `GET https://<functionapp>.azurewebsites.net/api/agents`

### 6. Seed the SharePoint List

```bash
cd scripts
cp .env.example .env
# Fill in your values in .env
node seed-sharepoint.js
```

### 7. Configure the HTML Files

**au-agent-catalog.html** — update `API_URL`:
```js
const API_URL = 'https://<your-functionapp>.azurewebsites.net/api/agents';
```

**au-agent-admin.html** — update MSAL config and IDs:
```js
clientId: '<ADMIN_APP_CLIENT_ID>',
authority: 'https://login.microsoftonline.com/<TENANT_ID>',
const SITE_ID = '<SHAREPOINT_SITE_ID>';
const LIST_ID = '<LIST_ID>';
```

### 8. GitHub Actions

Add these secrets to your GitHub repo:
- `AZURE_FUNCTIONAPP_NAME` — the Function App name in Azure
- `AZURE_FUNCTIONAPP_PUBLISH_PROFILE` — download from Azure Portal → Function App → Get publish profile

---

## SharePoint Column Reference

| Display Name  | Internal Name | Type           |
|---------------|---------------|----------------|
| Agent Name    | Title         | Single line    |
| Industry      | Industry      | Choice         |
| Tier          | Tier          | Choice         |
| Points        | Points        | Number         |
| UseCaseType   | UseCaseType   | Choice         |
| Description   | Description   | Multiple lines |
| AUContext     | AUContext     | Multiple lines |
| BuildNotes    | BuildNotes    | Multiple lines |
| Connectors    | Connectors    | Multiple lines |
| UpsellPath    | UpsellPath    | Single line    |
| Status        | Status        | Choice         |
| Published     | Published     | Yes/No         |

## Files

```
ai-studio-catalog/
├── function/                   # Azure Function (TypeScript)
│   ├── src/getAgents/
│   │   ├── index.ts            # Function handler
│   │   └── function.json       # Binding config
│   ├── package.json
│   ├── tsconfig.json
│   └── local.settings.json     # Local dev (gitignored)
├── public/
│   ├── au-agent-catalog.html   # Public catalog
│   ├── au-agent-admin.html     # Admin UI
│   └── agents-data.json        # Source data for seed script
├── scripts/
│   ├── seed-sharepoint.js      # One-time import script
│   └── .env.example
├── .github/workflows/
│   └── deploy.yml              # CI/CD
└── README.md
```
