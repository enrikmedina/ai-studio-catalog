import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const ADO_ORG     = "mySMBAIStudio";
const ADO_PROJECT = "AI%20Studio";
const ADO_API     = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/wit/workitems/$Task?api-version=7.1`;

interface ClaimRequest {
  agentName: string;
  variationName?: string;
  claimantEmail?: string;
  // All SharePoint fields
  industry?: string;
  tier?: string;
  description?: string;
  whyItMatters?: string;
  auContext?: string;
  buildNotes?: string;
  connectors?: string;
  upsellPath?: string;
  status?: string;
  iterations?: string; // JSON string
}

interface SWAPrincipal {
  userDetails?: string;
  userId?: string;
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

  // Header block
  lines.push(`<b>Agent:</b> ${body.agentName}`);
  if (body.variationName) lines.push(`<b>Variation:</b> ${body.variationName}`);
  lines.push(row("Industry",  body.industry));
  lines.push(row("Tier",      body.tier));
  lines.push(row("Status",    body.status));
  lines.push("");

  // Content
  lines.push(row("Description",    body.description));
  lines.push(row("Why It Matters", body.whyItMatters));
  lines.push(row("AU Context",     body.auContext));
  lines.push(row("Build Notes",    body.buildNotes));
  lines.push(row("Connectors",     body.connectors));
  lines.push(row("Upsell Path",    body.upsellPath));

  // Variations / iterations
  if (body.iterations) {
    try {
      const iters = JSON.parse(body.iterations) as Array<{
        name?: string;
        auContext?: string;
        connector?: string;
        buildNotes?: string;
      }>;
      if (iters.length > 0) {
        lines.push("");
        lines.push("<b>Agent Variations:</b>");
        iters.forEach((it, i) => {
          lines.push(`&nbsp;&nbsp;<b>${i + 1}. ${it.name || "Variation " + (i + 1)}</b>`);
          if (it.auContext)   lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;AU Context: ${it.auContext}`);
          if (it.connector)   lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;Connectors: ${it.connector}`);
          if (it.buildNotes)  lines.push(`&nbsp;&nbsp;&nbsp;&nbsp;Build Notes: ${it.buildNotes}`);
        });
      }
    } catch { /* ignore malformed iterations */ }
  }

  // Footer
  lines.push("");
  lines.push(`<b>Claimed by:</b> ${claimant}`);
  lines.push(`<b>Source:</b> mySMB.com AI Studio Agent Catalog`);

  return lines.filter(l => l !== undefined && l !== null).join("<br/>");
}

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const pat = process.env.ADO_PAT;
  if (!pat) {
    context.res = { status: 500, body: JSON.stringify({ error: "ADO_PAT not configured" }) };
    return;
  }

  const body = req.body as ClaimRequest;
  if (!body?.agentName) {
    context.res = { status: 400, body: JSON.stringify({ error: "agentName is required" }) };
    return;
  }

  const claimant    = getClaimant(req) || body.claimantEmail || "unknown";
  const title       = body.variationName
    ? `[Claim] ${body.agentName} – ${body.variationName}`
    : `[Claim] ${body.agentName}`;
  const description = buildDescription(body, claimant);
  const tags        = "AI Studio; Agent Catalog";

  const patch = [
    { op: "add", path: "/fields/System.Title",       value: title },
    { op: "add", path: "/fields/System.Description", value: description },
    { op: "add", path: "/fields/System.Tags",         value: tags },
    { op: "add", path: "/fields/System.AssignedTo",   value: claimant },
  ];

  const token = Buffer.from(`:${pat}`).toString("base64");

  try {
    const response = await fetch(ADO_API, {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "Content-Type": "application/json-patch+json",
        Accept: "application/json",
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      const errText = await response.text();
      context.log.error("ADO error:", response.status, errText);
      context.res = {
        status: 502,
        body: JSON.stringify({ error: "Failed to create ADO work item" }),
      };
      return;
    }

    const item = (await response.json()) as { id: number; _links: { html: { href: string } } };
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id:  item.id,
        url: item._links?.html?.href ?? `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_workitems/edit/${item.id}`,
      }),
    };
  } catch (err) {
    context.log.error("Unhandled error:", err);
    context.res = {
      status: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

export default httpTrigger;
