# OAuth / OIDC Overview

## What It Does

OAuth support allows your users to log in with an external identity provider (Google, Microsoft, Okta, Auth0, etc.) instead of a username and password. After the user authenticates with the provider, the module creates a local session identically to a password login -- the `CheckSession` endpoint works the same way regardless of how the user authenticated.

## How It Works

The module implements the [OAuth 2.0 Authorization Code Flow](https://oauth.net/2/grant-types/authorization-code/) with [PKCE](https://oauth.net/2/pkce/) (Proof Key for Code Exchange). This is the recommended flow for server-rendered applications.

### The Three OAuth Routes

When providers are configured, `connectRoutes()` automatically registers three additional routes:

| Route | Description |
|-------|-------------|
| `GET /1.0/OAuth/Providers` | Lists configured providers (name, type, begin URL). No secrets exposed. |
| `GET /1.0/OAuth/Begin/:provider` | Starts the OAuth flow: generates PKCE + state, redirects to provider. |
| `GET /1.0/OAuth/Callback/:provider` | Handles the callback: validates state, exchanges code, creates session. |

### Flow Summary

1. Your frontend directs the user to `/1.0/OAuth/Begin/google`
2. The module generates PKCE parameters and a state token, stores them, and redirects to Google
3. The user authenticates at Google and grants consent
4. Google redirects back to `/1.0/OAuth/Callback/google?code=...&state=...`
5. The module validates the state, exchanges the code for tokens, maps claims to a user record, creates a session, sets the cookie, and redirects to the post-login URL
6. Your frontend calls `/1.0/CheckSession` and gets back the user record, just like a password login

## Provider Types

### OpenID Connect (`openid-client`)

Uses the [openid-client](https://www.npmjs.com/package/openid-client) library (v6, ESM-only, OpenID Certified). Works with any provider that publishes a standard OIDC discovery document:

- Google
- Microsoft Azure AD
- Okta
- Auth0
- Keycloak
- Any OIDC-compliant provider

```bash
npm install openid-client
```

### MSAL (`@azure/msal-node`)

Uses Microsoft's official [MSAL Node](https://www.npmjs.com/package/@azure/msal-node) library. Provides deeper Microsoft integration:

- Token caching and automatic refresh
- Microsoft-specific scopes (Mail.Read, Calendars.ReadWrite, etc.)
- Azure AD B2C support
- Multi-tenant applications

```bash
npm install @azure/msal-node
```

## Optional Dependencies

Both libraries are **optional peer dependencies**. They are not installed by default. If you don't need OAuth, you don't install them and the module works identically as a username/password session manager.

If you configure an OAuth provider but the corresponding library is not installed, the module logs an error and the OAuth routes return an error response -- but the rest of the module continues to work normally.

## Configuring Providers

### Via Constructor Options

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		OAuthProviders:
		{
			'google':
			{
				Type: 'openid-connect',
				IssuerURL: 'https://accounts.google.com',
				ClientID: 'your-client-id',
				ClientSecret: 'your-client-secret',
				CallbackURL: 'https://myapp.com/1.0/OAuth/Callback/google'
			}
		}
	});
```

### Via `addOAuthProvider()` (Programmatic)

```javascript
tmpFable.OratorAuthentication.addOAuthProvider('google',
	{
		Type: 'openid-connect',
		IssuerURL: 'https://accounts.google.com',
		ClientID: 'your-client-id',
		ClientSecret: 'your-client-secret',
		CallbackURL: 'https://myapp.com/1.0/OAuth/Callback/google'
	});
```

Note: If using `addOAuthProvider()` after `connectRoutes()` has already been called, you must call `connectOAuthRoutes()` again to register the new provider's routes.

## User Mapping

After a successful OAuth login, the module receives OIDC claims (sub, name, email, etc.) and needs to convert them into a user record for your application. The default mapper extracts standard OIDC claims:

```javascript
// Default mapper output:
{
	LoginID: claims.preferred_username || claims.email || claims.sub,
	IDUser: 0,
	NameFirst: claims.given_name || '',
	NameLast: claims.family_name || '',
	FullName: claims.name || '',
	Email: claims.email || ''
}
```

For custom mapping (e.g., looking up or creating users in your database), use `setOAuthUserMapper()`. See [OAuth User Mapper](oauth-user-mapper.md) for details.

## Security

- **PKCE** is always enabled (S256 code challenge)
- **State parameter** is a UUID with 5-minute TTL, consumed on use (one-time)
- **Nonce** is generated per flow for ID token validation
- **OAuth tokens** are stored on the server-side session, never exposed via `CheckSession`

## Next Steps

- [Google Provider Guide](provider-google.md) - Step-by-step Google setup
- [Microsoft Provider Guide](provider-microsoft.md) - Azure AD via OpenID Connect
- [Microsoft MSAL Guide](provider-microsoft-msal.md) - Advanced Microsoft with Exchange/Graph
- [OAuth User Mapper](oauth-user-mapper.md) - Custom claim-to-user mapping
