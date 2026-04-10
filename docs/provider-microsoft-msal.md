# Microsoft MSAL (Exchange / Graph API)

Step-by-step guide to adding Microsoft login with the MSAL provider for advanced scenarios including Exchange Online email access, Microsoft Graph API, and Azure AD B2C.

## When to Use MSAL vs OpenID Connect

| Need | Provider |
|------|----------|
| Just login (name, email) | [OpenID Connect](provider-microsoft.md) |
| Read/send Exchange emails | **MSAL** (this guide) |
| Access Microsoft Graph API | **MSAL** (this guide) |
| Azure AD B2C | **MSAL** (this guide) |
| Calendar, OneDrive, Teams | **MSAL** (this guide) |
| Token caching / auto-refresh | **MSAL** (this guide) |

## Prerequisites

- A Microsoft Azure account
- An Orator application with `orator-authentication` installed
- The `@azure/msal-node` library: `npm install @azure/msal-node`

## Step 1: Register an Application in Azure AD

1. Go to the [Azure Portal](https://portal.azure.com/)
2. Navigate to **Microsoft Entra ID** -> **App registrations** -> **New registration**
3. Fill in:
   - **Name**: Your application name
   - **Supported account types**: Choose based on your needs
   - **Redirect URI**: Select **Web**, enter:
     - Development: `http://localhost:8080/1.0/OAuth/Callback/microsoft`
     - Production: `https://myapp.com/1.0/OAuth/Callback/microsoft`
4. Click **Register**
5. Copy the **Application (client) ID** and **Directory (tenant) ID**

## Step 2: Create a Client Secret

1. Go to **Certificates & secrets** -> **New client secret**
2. Enter a description and choose an expiry
3. Click **Add**
4. **Copy the secret value immediately**

## Step 3: Configure API Permissions for Exchange / Graph

This is where MSAL differs from basic OIDC -- you can request specific Microsoft Graph permissions.

1. Go to **API permissions** -> **Add a permission** -> **Microsoft Graph**
2. Select **Delegated permissions**
3. Add the permissions you need:

### For Email Access (Exchange Online)

| Permission | Description |
|-----------|-------------|
| `openid` | Sign in and read user profile |
| `profile` | View basic profile |
| `email` | View email address |
| `Mail.Read` | Read user's email |
| `Mail.Send` | Send email as the user |
| `Mail.ReadWrite` | Read and write user's email |

### For Calendar Access

| Permission | Description |
|-----------|-------------|
| `Calendars.Read` | Read user's calendars |
| `Calendars.ReadWrite` | Read and write calendars |

### For OneDrive Access

| Permission | Description |
|-----------|-------------|
| `Files.Read` | Read user's files |
| `Files.ReadWrite` | Read and write user's files |

### For Teams Access

| Permission | Description |
|-----------|-------------|
| `Chat.Read` | Read user's chats |
| `ChannelMessage.Read.All` | Read channel messages |

4. Click **Add permissions**
5. Click **Grant admin consent for [your organization]** (requires admin privileges)

> **Important**: Some permissions (like `Mail.Read`) require admin consent. If you don't have admin access, ask your Azure AD administrator to grant consent.

## Step 4: Configure Orator Authentication with MSAL

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
				Type: 'msal',
				ClientID: 'YOUR_APPLICATION_CLIENT_ID',
				ClientSecret: 'YOUR_CLIENT_SECRET_VALUE',
				Authority: 'https://login.microsoftonline.com/YOUR_TENANT_ID',
				CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/microsoft',
				Scopes: ['openid', 'profile', 'email', 'Mail.Read']
			}
		},
		OAuthPostLoginRedirectURL: '/inbox'
	});

tmpFable.Orator.startService(
	() =>
	{
		tmpFable.OratorAuthentication.connectRoutes();
		console.log('Server running with Microsoft MSAL on port 8080');
	});
```

### Key Differences from OpenID Connect

| Setting | OIDC | MSAL |
|---------|------|------|
| `Type` | `'openid-connect'` | `'msal'` |
| Endpoint | `IssuerURL` (with `/v2.0`) | `Authority` (without `/v2.0`) |
| Library | `openid-client` | `@azure/msal-node` |
| Scopes | Standard OIDC only | Microsoft Graph permissions too |

## Step 5: Use the Access Token to Call Graph API

After OAuth login, the access token is stored on the session. Use it to call Microsoft Graph:

```javascript
// Add a route to read the user's emails
tmpFable.Orator.serviceServer.get('/api/emails',
	(pRequest, pResponse, fNext) =>
	{
		let tmpSession = tmpFable.OratorAuthentication.getSessionForRequest(pRequest);

		if (!tmpSession || !tmpSession.OAuthTokens)
		{
			pResponse.send(401, { Error: 'Microsoft OAuth session required' });
			return fNext();
		}

		let tmpAccessToken = tmpSession.OAuthTokens.AccessToken;

		// Call Microsoft Graph API
		fetch('https://graph.microsoft.com/v1.0/me/messages?$top=10&$select=subject,from,receivedDateTime',
			{
				headers:
				{
					'Authorization': `Bearer ${tmpAccessToken}`,
					'Content-Type': 'application/json'
				}
			})
			.then((pGraphResponse) =>
			{
				if (!pGraphResponse.ok)
				{
					throw new Error(`Graph API error: ${pGraphResponse.status}`);
				}
				return pGraphResponse.json();
			})
			.then((pData) =>
			{
				pResponse.send(
					{
						Emails: pData.value.map((pEmail) =>
						{
							return {
								Subject: pEmail.subject,
								From: pEmail.from.emailAddress.address,
								ReceivedAt: pEmail.receivedDateTime
							};
						})
					});
				return fNext();
			})
			.catch((pError) =>
			{
				tmpFable.log.error(`Graph API error: ${pError.message}`);
				pResponse.send(500, { Error: 'Failed to fetch emails' });
				return fNext();
			});
	});
```

## Step 6: Send Email via Graph API

```javascript
tmpFable.Orator.serviceServer.post('/api/send-email',
	(pRequest, pResponse, fNext) =>
	{
		let tmpSession = tmpFable.OratorAuthentication.getSessionForRequest(pRequest);

		if (!tmpSession || !tmpSession.OAuthTokens)
		{
			pResponse.send(401, { Error: 'Microsoft OAuth session required' });
			return fNext();
		}

		let tmpBody = pRequest.body || {};
		let tmpAccessToken = tmpSession.OAuthTokens.AccessToken;

		let tmpMessage =
		{
			message:
			{
				subject: tmpBody.Subject,
				body:
				{
					contentType: 'Text',
					content: tmpBody.Body
				},
				toRecipients:
				[
					{
						emailAddress: { address: tmpBody.To }
					}
				]
			}
		};

		fetch('https://graph.microsoft.com/v1.0/me/sendMail',
			{
				method: 'POST',
				headers:
				{
					'Authorization': `Bearer ${tmpAccessToken}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(tmpMessage)
			})
			.then((pGraphResponse) =>
			{
				if (pGraphResponse.status === 202)
				{
					pResponse.send({ Sent: true });
				}
				else
				{
					pResponse.send(500, { Error: 'Failed to send email' });
				}
				return fNext();
			})
			.catch((pError) =>
			{
				pResponse.send(500, { Error: pError.message });
				return fNext();
			});
	});
```

## Complete Example: Email Dashboard Application

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libOratorAuthentication = require('orator-authentication');

let tmpFable = new libFable(
	{
		Product: 'EmailDashboard',
		ProductVersion: '1.0.0',
		APIServerPort: 8080
	});

tmpFable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
tmpFable.serviceManager.addServiceType('Orator', libOrator);
tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

tmpFable.serviceManager.instantiateServiceProvider('Orator');
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		SessionTTL: 28800000, // 8 hours
		OAuthProviders:
		{
			'microsoft':
			{
				Type: 'msal',
				ClientID: process.env.AZURE_CLIENT_ID,
				ClientSecret: process.env.AZURE_CLIENT_SECRET,
				Authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
				CallbackURL: process.env.AZURE_CALLBACK_URL || 'http://localhost:8080/1.0/OAuth/Callback/microsoft',
				Scopes: ['openid', 'profile', 'email', 'Mail.Read', 'Mail.Send', 'Calendars.Read']
			}
		},
		OAuthPostLoginRedirectURL: '/dashboard'
	});

// Custom user mapper: restrict to company domain
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		let tmpEmail = pClaims.email || pClaims.preferred_username || '';

		if (!tmpEmail.endsWith('@mycompany.com'))
		{
			return fCallback(null, null); // Reject non-company users
		}

		return fCallback(null,
			{
				LoginID: tmpEmail,
				IDUser: 0,
				FullName: pClaims.name || '',
				Email: tmpEmail,
				AzureObjectID: pClaims.oid,
				TenantID: pClaims.tid
			});
	});

tmpFable.Orator.startService(
	() =>
	{
		tmpFable.OratorAuthentication.connectRoutes();
		tmpFable.log.info('Email Dashboard running on port 8080');
	});
```

## MSAL Claims

The MSAL provider normalizes Microsoft's response to match the standard claims format:

| Claim | Description |
|-------|-------------|
| `sub` | `uniqueId` from MSAL (or `homeAccountId`) |
| `name` | Account display name |
| `email` | Account username (UPN) |
| `preferred_username` | Account username |
| `oid` | Azure AD object ID |
| `tid` | Azure AD tenant ID |
| `given_name` | First name (from ID token claims, if available) |
| `family_name` | Last name (from ID token claims, if available) |

## Troubleshooting

### "AADSTS65001: The user or administrator has not consented"

An admin needs to grant consent for the requested permissions. Go to **API permissions** in Azure Portal and click **Grant admin consent**.

### "AADSTS700016: Application not found in the directory"

The `ClientID` or `Authority` (tenant ID) is incorrect. Double-check both values.

### Access token doesn't have expected permissions

Make sure:
1. The permissions are listed in **API permissions**
2. Admin consent has been granted
3. The scopes are included in your `Scopes` configuration array

### "CompactToken parsing failed"

The access token may have expired. MSAL manages token refresh internally for cached tokens, but the access token stored on the session has a fixed expiry. Check `session.OAuthTokens.ExpiresAt` and re-authenticate if expired.
