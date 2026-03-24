import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { ConfidentialClientApplication } from "@azure/msal-node";

interface SharePointFields {
  Title?: string;
  Industry?: string;
  Tier?: string;
  Points?: number;
  UseCaseType?: string;
  WhyItMatters?: string;
  Description?: string;
  AUContext?: string;
  BuildNotes?: string;
  Connectors?: string;
  UpsellPath?: string;
  Status?: string;
  Published?: boolean | string;
  Iterations?: string;
  ClaimedBy?: string;
  ClaimedTaskId?: number;
  ClaimedTaskUrl?: string;
  ClaimedVariations?: string;
}

interface SharePointItem {
  id: string;
  fields: SharePointFields;
}

interface Agent {
  id: string;
  name: string;
  industry: string;
  tier: string;
  points: number;
  useCaseType: string;
  whyItMatters: string;
  description: string;
  auContext: string;
  buildNotes: string;
  connectors: string;
  upsellPath: string;
  status: string;
  iterations: string;
  claimedBy: string;
  claimedTaskId: number | null;
  claimedTaskUrl: string;
  claimedVariations: string;
}

// Cache token to avoid acquiring a new one on every request
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60_000) {
    return cachedToken;
  }

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

  if (!result?.accessToken) {
    throw new Error("Failed to acquire access token");
  }

  cachedToken = result.accessToken;
  tokenExpiry = result.expiresOn ? result.expiresOn.getTime() : now + 3600_000;
  return cachedToken;
}

function mapItem(item: SharePointItem): Agent {
  const f = item.fields;
  return {
    id: item.id,
    name: f.Title ?? "",
    industry: f.Industry ?? "",
    tier: f.Tier ?? "",
    points: f.Points ?? 0,
    useCaseType: f.UseCaseType ?? "",
    whyItMatters: f.WhyItMatters ?? "",
    description: f.Description ?? "",
    auContext: f.AUContext ?? "",
    buildNotes: f.BuildNotes ?? "",
    connectors: f.Connectors ?? "",
    upsellPath: f.UpsellPath ?? "",
    status: f.Status ?? "available",
    iterations: f.Iterations ?? "",
    claimedBy: f.ClaimedBy ?? "",
    claimedTaskId: f.ClaimedTaskId ?? null,
    claimedTaskUrl: f.ClaimedTaskUrl ?? "",
    claimedVariations: f.ClaimedVariations ?? "",
  };
}

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  const siteId = process.env.SHAREPOINT_SITE_ID!;
  const listId = process.env.LIST_ID!;

  try {
    const token = await getAccessToken();

    const url =
      `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items` +
      `?$expand=fields` +
      `&$select=id,fields` +
      `&$top=500`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      context.log.error("Graph API error:", response.status, errorText);
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Failed to fetch agents from SharePoint" }),
      };
      return;
    }

    const data = (await response.json()) as { value: SharePointItem[] };
    const agents: Agent[] = data.value
      .filter((item) => {
        const p = item.fields.Published;
        return p === true || p === "Yes" || p === "True";
      })
      .map(mapItem);

    context.res = {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
      },
      body: JSON.stringify(agents),
    };
  } catch (err) {
    context.log.error("Unhandled error:", err);
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};

export default httpTrigger;
