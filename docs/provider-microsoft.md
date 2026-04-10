# Microsoft OAuth (OpenID Connect)

Step-by-step guide to adding Microsoft / Azure AD login via the standard OpenID Connect provider. This approach uses the `openid-client` library and works for basic authentication needs.

For advanced Microsoft scenarios (Exchange Online, Microsoft Graph API calls, Azure AD B2C), see the [Microsoft MSAL Guide](provider-microsoft-msal.md) instead.

## When to Use This Guide

Use the OpenID Connect approach when:

- You only need to **identify** the user (login, name, email)
- You don't need to call Microsoft Graph or Exchange APIs
- You want a lighter dependency (`openid-client` vs `@azure/msal-node`)
- You want a provider-agnostic approach that could be swapped for any OIDC provider

## Prerequisites

- A Microsoft Azure account (free tier works)
- An Orator application with `orator-authentication` installed
- The `openid-client` library: `npm install openid-client`

## Step 1: Register an Application in Azure AD

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID** (formerly Azure Active Directory)
3. In the left menu, click **App registrations** -> **New registration**
4. Fill in the form:
   - **Name**: Your application name (e.g., "My App")
   - **Supported account types**: Choose based on your needs:
     - *Single tenant*: Only users in your Azure AD directory
     - *Multitenant*: Users from any Azure AD directory
     - *Multitenant + personal*: Azure AD users + personal Microsoft accounts
   - **Redirect URI**: Select **Web** and enter your callback URL:
     - Development: `http://localhost:8080/1.0/OAuth/Callback/microsoft`
     - Production: `https://myapp.com/1.0/OAuth/Callback/microsoft`
5. Click **Register**

## Step 2: Note Your Application (Client) ID

After registration, you'll see the **Overview** page:

1. Copy the **Application (client) ID** -- this is your `ClientID`
2. Copy the **Directory (tenant) ID** -- this is your tenant ID for the issuer URL

## Step 3: Create a Client Secret

1. In your app registration, go to **Certificates & secrets**
2. Under **Client secrets**, click **New client secret**
3. Enter a description (e.g., "Production secret") and choose an expiry period
4. Click **Add**
5. **Copy the secret value immediately** -- it won't be shown again. This is your `ClientSecret`.

## Step 4: Configure API Permissions

1. In your app registration, go to **API permissions**
2. Click **Add a permission** -> **Microsoft Graph** -> **Delegated permissions**
3. Select:
   - `openid`
   - `profile`
   - `email`
4. Click **Add permissions**
5. If you see a **Grant admin consent** button and have admin access, click it

## Step 5: Configure Orator Authentication

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libOratorAuthentication = require('orator-authentication');

let tmpFable = new libFable(
	{
		Product: 'MyApp',
		ProductVersion: '1.0.0',
		APIServerPort: 8080
	});

tmpFable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
tmpFable.serviceManager.addServiceType('Orator', libOrator);
tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

tmpFable.serviceManager.instantiateServiceProvider('Orator');
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		OAuthProviders:
		{
			'microsoft':
			{
				Type: 'openid-connect',
				IssuerURL: 'https://login.microsoftonline.com/YOUR_TENANT_ID/v2.0',
				ClientID: 'YOUR_APPLICATION_CLIENT_ID',
				ClientSecret: 'YOUR_CLIENT_SECRET_VALUE',
				CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/microsoft',
				Scopes: ['openid', 'profile', 'email']
			}
		},
		OAuthPostLoginRedirectURL: '/dashboard'
	});

tmpFable.Orator.startService(
	() =>
	{
		tmpFable.OratorAuthentication.connectRoutes();
		console.log('Server running with Microsoft OAuth on port 8080');
	});
```

> **Important**: The `IssuerURL` must include `/v2.0` at the end. The OIDC discovery document is at `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration`.

### Multi-Tenant Configuration

For multi-tenant applications, use `common` instead of your tenant ID:

```javascript
IssuerURL: 'https://login.microsoftonline.com/common/v2.0'
```

## Step 6: Test the Flow

1. Start your server: `node server.js`
2. Navigate to: `http://localhost:8080/1.0/OAuth/Begin/microsoft`
3. Sign in with your Microsoft account
4. Grant consent for the requested permissions
5. You'll be redirected back to your application
6. Verify: `http://localhost:8080/1.0/CheckSession`

## Microsoft OIDC Claims

After a successful login, these claims are available:

| Claim | Example | Description |
|-------|---------|-------------|
| `sub` | `'AAAAAAAAABBBBBcccc...'` | Microsoft user ID (unique per application + tenant) |
| `name` | `'Alice Smith'` | Full display name |
| `preferred_username` | `'alice@contoso.com'` | User principal name (UPN) |
| `email` | `'alice@contoso.com'` | Email (may differ from UPN for guest users) |
| `given_name` | `'Alice'` | First name |
| `family_name` | `'Smith'` | Last name |
| `oid` | `'00000000-0000-0000-...'` | Azure AD object ID |
| `tid` | `'00000000-0000-0000-...'` | Azure AD tenant ID |

## Moving to Production

1. Update the `CallbackURL` to your production domain
2. Add the production URL to your Azure AD app's **Redirect URIs**
3. Store secrets in environment variables:

```javascript
'microsoft':
{
	Type: 'openid-connect',
	IssuerURL: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
	ClientID: process.env.AZURE_CLIENT_ID,
	ClientSecret: process.env.AZURE_CLIENT_SECRET,
	CallbackURL: process.env.AZURE_CALLBACK_URL || 'http://localhost:8080/1.0/OAuth/Callback/microsoft',
	Scopes: ['openid', 'profile', 'email']
}
```

4. Consider rotating client secrets before they expire and setting a calendar reminder

## Next Steps

- Need Exchange/Graph API access? See [Microsoft MSAL Guide](provider-microsoft-msal.md)
- Want to customize user record creation? See [OAuth User Mapper](oauth-user-mapper.md)
