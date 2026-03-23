import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const ADO_ORG     = "mySMBAIStudio"; // deploy trigger
const ADO_PROJECT = "AI%20Studio";
const ADO_API     = `https://dev.azure.com/${ADO_ORG}/${ADO_PROJECT}/_apis/wit/workitems/$Task?api-version=7.1`;

interface ClaimRequest {
  agentName: string;
  description?: string;
  industry?: string;
  tier?: string;
  variationName?: string;
}

interface SWAPrincipal {
  userDetails?: string; // email
  userId?: string;
}

function getClaimant(req: HttpRequest): string {
  try {
    const header = req.headers["x-ms-client-principal"];
    if (!header) return "unknown";
    const decoded = Buffer.from(header, "base64").toString("utf-8");
    const principal: SWAPrincipal = JSON.parse(decoded);
    return principal.userDetails || "unknown";
  } catch {
    return "unknown";
  }
}

function buildDescription(body: ClaimRequest, claimant: string): string {
  const variation = body.variationName ? `<br/><b>Variation:</b> ${body.variationName}` : "";
  return [
    `<b>Agent:</b> ${body.agentName}${variation}`,
    body.industry ? `<b>Industry:</b> ${body.industry}` : "",
    body.tier     ? `<b>Tier:</b> ${body.tier}`         : "",
    body.description ? `<br/><b>Description:</b> ${body.description}` : "",
    `<br/><b>Claimed by:</b> ${claimant}`,
    `<b>Source:</b> mySMB.com AI Studio Agent Catalog`,
  ]
    .filter(Boolean)
    .join("<br/>");
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

  const claimant   = getClaimant(req);
  const title      = body.variationName
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
