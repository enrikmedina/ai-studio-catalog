import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { ConfidentialClientApplication } from "@azure/msal-node";

const ADO_ORG     = "mySMBAIStudio";
const ADO_PROJECT = "AI%20Studio";
const ADO_API     = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/wit/workitems/$Task?api-version=7.1`;

interface ClaimRequest {
  sharePointId: string;
  agentName: string;
  variationName?: string;
  claimantEmail?: string;
  currentClaimedVariations?: string; // JSON string — current value from SharePoint
  // Agent fields for ADO description
  industry?: string;
  tier?: string;
  description?: string;
  whyItMatters?: string;
  auContext?: string;
  buildNotes?: string;
  connectors?: string;
  upsellPath?: string;
  status?: string;
  iterations?: string;
}

interface SWAPrincipal {
  userDetails?: string;
  userId?: string;
}

interface ClaimedVariation {
  name: string;
  claimedBy: string;
  taskId: number;
  taskUrl: string;
}

async function getGraphToken(): Promise<string> {
  const msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.CLIENT_ID!,
      clientSecret: process.env.CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${process.env.TENANT_ID}`,
    },
  });
  const result = await msalApp.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire Graph token");
  return result.accessToken;
}

function getClaimant(req: HttpRequest): string {
  try {
    const header = req.headers["x-ms-client-principal"];
    if (!header) return "";
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const principal: SWAPrincipal = JSON.parse(decoded);
    return principal.userDetails || "";
  } catch {
    return "";
  }
}

function row(label: string, value: string | undefined): string {
  return value ? `<b>${label}:</b> ${value}` : "";
}

function buildDescription(body: ClaimRequest, claimant: string): string {
  const lines: string[] = [];

  lines.push(`<b>Agent:</b> ${body.agentName}`);
  if (body.variationName) lines.push(`<b>Variation:</b> ${body.variationName}`);
  lines.push(row("Industry",  body.industry));
  lines.push(row("Tier",      body.tier));
  lines.push(row("Status",    body.status));
  lines.push("");
  lines.push(row("Description",    body.description));
  lines.push(row("Why It Matters", body.whyItMatters));
  lines.push(row("AU Context",     body.auContext));
  lines.push(row("Build Notes",    body.buildNotes));
  lines.push(row("Connectors",     body.connectors));
  lines.push(row("Upsell Path",    body.upsellPath));

  if (body.iterations) {
    try {
      const iters = JSON.parse(body.iterations) as Array<{
        name?: string; auContext?: string; connector?: string; buildNotes?: string;
      }>;
      if (iters.length > 0) {
        lines.push("");
        lines.push("<b>Agent Variations:</b>");
        iters.forEach((it, i) => {
          lines.push(`&nbsp;&nbsp;<b>${i + 1}. ${it.name || "Variation " + (i + 1)}</b>`);
          if (it.auContext)  lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;AU Context: ${it.auContext}`);
          if (it.connector)  lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;Connectors: ${it.connector}`);
          if (it.buildNotes) lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;Build Notes: ${it.buildNotes}`);
        });
      }
    } catch { /* ignore */ }
  }

  lines.push("");
  lines.push(`<b>Claimed by:</b> ${claimant}`);
  lines.push(`<b>Source:</b> mySMB.com AI Studio Agent Catalog`);

  return lines.filter(l => l !== undefined && l !== null).join("<br/>");
}

async function patchSharePoint(
  graphToken: string,
  siteId: string,
  listId: string,
  itemId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items/${itemId}/fields`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${graphToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`SharePoint PATCH failed: ${res.status} ${txt}`);
  }
}

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const pat    = process.env.ADO_PAT;
  const siteId = process.env.SHAREPOINT_SITE_ID!;
  const listId = process.env.LIST_ID!;

  if (!pat) {
    context.res = { status: 500, body: JSON.stringify({ error: "ADO_PAT not configured" }) };
    return;
  }

  const body = req.body as ClaimRequest;
  if (!body?.agentName || !body?.sharePointId) {
    context.res = { status: 400, body: JSON.stringify({ error: "agentName and sharePointId are required" }) };
    return;
  }

  const claimant = getClaimant(req) || body.claimantEmail || "unknown";
  const title    = body.variationName
    ? `[Claim] ${body.agentName} – ${body.variationName}`
    : `[Claim] ${body.agentName}`;

  // ── 1. Create ADO Task ────────────────────────────────────────────────────
  const adoToken = Buffer.from(`:${pat}`).toString("base64");
  const patch = [
    { op: "add", path: "/fields/System.Title",       value: title },
    { op: "add", path: "/fields/System.Description", value: buildDescription(body, claimant) },
    { op: "add", path: "/fields/System.Tags",         value: "AI Studio; Agent Catalog" },
    { op: "add", path: "/fields/System.AssignedTo",   value: claimant },
  ];

  let taskId: number;
  let taskUrl: string;

  try {
    const adoRes = await fetch(ADO_API, {
      method: "POST",
      headers: {
        Authorization: `Basic ${adoToken}`,
        "Content-Type": "application/json-patch+json",
        Accept: "application/json",
      },
      body: JSON.stringify(patch),
    });

    if (!adoRes.ok) {
      const errText = await adoRes.text();
      context.log.error("ADO error:", adoRes.status, errText);
      context.res = { status: 502, body: JSON.stringify({ error: "Failed to create ADO work item" }) };
      return;
    }

    const adoItem = (await adoRes.json()) as { id: number; _links: { html: { href: string } } };
    taskId  = adoItem.id;
    taskUrl = adoItem._links?.html?.href ?? `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_workitems/edit/${adoItem.id}`;
  } catch (err) {
    context.log.error("ADO unhandled:", err);
    context.res = { status: 500, body: JSON.stringify({ error: "Internal server error" }) };
    return;
  }

  // ── 2. Write back to SharePoint ──────────────────────────────────────────
  try {
    const graphToken = await getGraphToken();

    if (body.variationName) {
      // Update ClaimedVariations JSON array
      let claimed: ClaimedVariation[] = [];
      try { claimed = JSON.parse(body.currentClaimedVariations || "[]"); } catch { claimed = []; }
      // Remove any existing entry for this variation name, then add the new one
      claimed = claimed.filter(v => v.name !== body.variationName);
      claimed.push({ name: body.variationName!, claimedBy: claimant, taskId, taskUrl });
      await patchSharePoint(graphToken, siteId, listId, body.sharePointId, {
        ClaimedVariations: JSON.stringify(claimed),
      });
    } else {
      // Update parent agent claim fields
      await patchSharePoint(graphToken, siteId, listId, body.sharePointId, {
        ClaimedBy:      claimant,
        ClaimedTaskId:  taskId,
        ClaimedTaskUrl: taskUrl,
      });
    }
  } catch (err) {
    // ADO task was created — log the SP error but still return success
    context.log.error("SharePoint write-back failed:", err);
  }

  context.res = {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: taskId, url: taskUrl }),
  };
};

export default httpTrigger;
