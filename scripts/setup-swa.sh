#!/usr/bin/env bash
# scripts/setup-swa.sh
# Creates the Azure Static Web App and configures Microsoft auth
# Run once from your terminal: bash scripts/setup-swa.sh
set -e

RESOURCE_GROUP="AgentCatalog_group"
SWA_NAME="AICatalogWeb"
LOCATION="eastasia"         # Closest free-tier region to AU
TENANT_ID="ec20d836-3fb1-4ff3-a389-25fc6cf07baf"
GITHUB_REPO="https://github.com/enrikmedina/ai-studio-catalog"
BRANCH="main"

echo ""
echo "▶  Creating Azure Static Web App: $SWA_NAME"
az staticwebapp create \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku "Free" \
  --branch "$BRANCH" \
  --source "$GITHUB_REPO" \
  --login-with-github

echo ""
echo "▶  Fetching deployment token..."
DEPLOY_TOKEN=$(az staticwebapp secrets list \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.apiKey" -o tsv)

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  ACTION REQUIRED — Add this secret to GitHub:"
echo ""
echo "  Name:  AZURE_STATIC_WEB_APPS_API_TOKEN"
echo "  Value: $DEPLOY_TOKEN"
echo ""
echo "  Go to: https://github.com/enrikmedina/ai-studio-catalog/settings/secrets/actions/new"
echo "══════════════════════════════════════════════════════════"

echo ""
echo "▶  Configuring Microsoft (AAD) authentication..."
echo "   Restricting to tenant: $TENANT_ID"
az staticwebapp auth microsoft update \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --tenant-id "$TENANT_ID" \
  --registration-app-id-setting-name "AAD_CLIENT_ID" \
  --registration-app-secret-setting-name "AAD_CLIENT_SECRET" 2>/dev/null || true

echo ""
echo "▶  Getting your Static Web App URL..."
SWA_URL=$(az staticwebapp show \
  --name "$SWA_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query "defaultHostname" -o tsv)

echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Static Web App URL: https://$SWA_URL"
echo ""
echo "  NEXT STEP — Enable auth in the Azure Portal:"
echo "  1. Go to: https://portal.azure.com"
echo "  2. Open Static Web Apps → $SWA_NAME → Settings → Authentication"
echo "  3. Click Add → Microsoft"
echo "  4. Set 'Restrict access' to: Require authentication"
echo "  5. Set Tenant type: Workforce (your org)"
echo "  6. Tenant ID: $TENANT_ID"
echo "  7. Save"
echo ""
echo "  Then add the secret to GitHub (shown above) and push to main."
echo "══════════════════════════════════════════════════════════"
echo ""
