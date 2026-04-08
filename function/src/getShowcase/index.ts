import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { ConfidentialClientApplication } from "@azure/msal-node";

const ADO_ORG     = "mySMBAIStudio";
const ADO_PROJECT = "AI%20Studio";
const ADO_BASE    = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis`;

// ── SharePoint token ──────────────────────────────────────────────────────────
let cachedGraphToken: string | null = null;
let graphTokenExpiry = 0;

async function getGraphToken(): Promise<string> {
  const now = Date.now();
  if (cachedGraphToken && now < graphTokenExpiry - 60_000) return cachedGraphToken;
  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId:     process.env.CLIENT_ID!,
      clientSecret: process.env.CLIENT_SECRET!,
      authority:    `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    },
  });
  const result = await msalApp.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire Graph token");
  cachedGraphToken = result.accessToken;
  graphTokenExpiry  = result.expiresOn ? result.expiresOn.getTime() : now + 3_600_000;
  return cachedGraphToken;
}

// ── ADO helpers ───────────────────────────────────────────────────────────────
function adoHeaders(pat: string) {
  return {
    Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** Extract the agent name from a claim task title like "[Claim] Agent Name – Variation" */
function agentNameFromTitle(title: string): string | null {
  const match = title.match(/^\[Claim\]\s+(.+?)(?:\s+[-–]\s+.+)?$/);
  return match ? match[1].trim() : null;
}

/** Query ADO for Done tasks tagged with "AI Studio" and return unique agent names */
async function getDoneAgentNames(pat: string): Promise<Set<string>> {
  const wiqlUrl = `${ADO_BASE}/wit/wiql?api-version=7.1`;
  const wiql = {
    query: `
      SELECT [System.Id], [System.Title]
      FROM WorkItems
      WHERE [System.TeamProject] = 'AI Studio'
        AND [System.WorkItemType] = 'Task'
        AND [System.Tags] CONTAINS 'AI Studio'
        AND [System.State] = 'Done'
      ORDER BY [System.ChangedDate] DESC
    `,
  };

  const res = await fetch(wiqlUrl, {
    method: "POST",
    headers: adoHeaders(pat),
    body: JSON.stringify(wiql),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ADO WIQL failed: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as { workItems: { id: number }[] };
  const ids = (data.workItems || []).map((w) => w.id);

  if (!ids.length) return new Set();

  // Batch fetch titles (max 200 per request)
  const names = new Set<string>();
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));

  for (const batch of batches) {
    const detailUrl =
      `${ADO_BASE}/wit/workitems?ids=${batch.join(",")}&fields=System.Title&api-version=7.1`;
    const detailRes = await fetch(detailUrl, { headers: adoHeaders(pat) });
    if (!detailRes.ok) continue;
    const detail = (await detailRes.json()) as { value: { fields: { "System.Title": string } }[] };
    for (const item of detail.value) {
      const name = agentNameFromTitle(item.fields["System.Title"] || "");
      if (name) names.add(name.toLowerCase());
    }
  }

  return names;
}

/** Fetch all published agents from SharePoint and filter to those matching done names */
async function getAgentsFromSharePoint(
  graphToken: string,
  doneNames: Set<string>
): Promise<object[]> {
  const siteId = process.env.SHAREPOINT_SITE_ID!;
  const listId = process.env.LIST_ID!;

  const url =
    `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items` +
    `?$expand=fields&$select=id,fields&$top=500`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${graphToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SharePoint fetch failed: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as { value: { id: string; fields: Record<string, unknown> }[] };

  return data.value
    .filter((item) => {
      const f = item.fields;
      const published = f.Published;
      if (published !== true && published !== "Yes" && published !== "True") return false;
      const title = String(f.Title ?? "").toLowerCase();
      return doneNames.has(title);
    })
    .map((item) => {
      const f = item.fields;
      return {
        id:          item.id,
        name:        f.Title        ?? "",
        industry:    f.Industry     ?? "",
        description: f.Description  ?? "",
        whyItMatters: f.WhyItMatters ?? "",
        status:      "available",
      };
    });
}

// ── Handler ───────────────────────────────────────────────────────────────────
const httpTrigger: AzureFunction = async function (
  context: Context,
  _req: HttpRequest
): Promise<void> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "ADO_PAT not configured" }),
    };
    return;
  }

  try {
    const [doneNames, graphToken] = await Promise.all([
      getDoneAgentNames(pat),
      getGraphToken(),
    ]);

    const agents = doneNames.size > 0
      ? await getAgentsFromSharePoint(graphToken, doneNames)
      : [];

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=120",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
      body: JSON.stringify(agents),
    };
  } catch (err) {
    context.log.error("getShowcase error:", err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

export default httpTrigger;
