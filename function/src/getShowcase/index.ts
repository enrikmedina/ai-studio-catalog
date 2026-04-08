import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const ADO_ORG     = "mySMBAIStudio";
const ADO_PROJECT = "AI%20Studio";
const ADO_BASE    = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis`;

function adoHeaders(pat: string) {
  return {
    Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface AdoFields {
  "System.Title": string;
  "System.Description"?: string;
  "System.AssignedTo"?: { displayName: string };
  "System.Tags"?: string;
}

async function getClosedUserStories(pat: string): Promise<object[]> {
  const wiqlUrl = `${ADO_BASE}/wit/wiql?api-version=7.1`;
  const wiql = {
    query: `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.TeamProject] = 'AI Studio'
        AND [System.WorkItemType] = 'User Story'
        AND [System.State] = 'Closed'
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
  if (!ids.length) return [];

  // Batch fetch details (max 200 per request)
  const results: object[] = [];
  const fields = [
    "System.Title",
    "System.Description",
    "System.AssignedTo",
    "System.Tags",
  ].join(",");

  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));

  for (const batch of batches) {
    const url = `${ADO_BASE}/wit/workitems?ids=${batch.join(",")}&fields=${fields}&api-version=7.1`;
    const detailRes = await fetch(url, { headers: adoHeaders(pat) });
    if (!detailRes.ok) continue;

    const detail = (await detailRes.json()) as { value: { id: number; fields: AdoFields }[] };
    for (const item of detail.value) {
      const f = item.fields;
      results.push({
        id:          item.id,
        name:        f["System.Title"] ?? "",
        description: f["System.Description"] ?? "",
        assignedTo:  f["System.AssignedTo"]?.displayName ?? "",
        tags:        f["System.Tags"] ?? "",
        status:      "available",
      });
    }
  }

  return results;
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
    const agents = await getClosedUserStories(pat);

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
