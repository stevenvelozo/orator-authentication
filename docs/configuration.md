# Configuration Reference

Orator Authentication accepts configuration through two mechanisms:

1. **Constructor Options** - Passed when instantiating the service provider (highest priority)
2. **Fable Settings** - Read from `fable.settings` with `OratorAuthentication*` prefix

Constructor options take precedence over Fable settings.

## Core Settings

| Option | Fable Setting | Default | Description |
|--------|---------------|---------|-------------|
| `RoutePrefix` | `OratorAuthenticationRoutePrefix` | `'/1.0/'` | URL prefix for all authentication routes |
| `CookieName` | `OratorAuthenticationCookieName` | `'SessionID'` | Name of the session cookie |
| `SessionTTL` | `OratorAuthenticationSessionTTL` | `86400000` (24h) | Session time-to-live in milliseconds |
| `CookiePath` | — | `'/'` | Path scope for the session cookie |
| `CookieHttpOnly` | — | `true` | Set HttpOnly flag on cookie |
| `CookieSecure` | — | `false` | Set Secure flag on cookie (HTTPS only) |
| `DeniedPasswords` | `OratorAuthenticationDeniedPasswords` | `[]` | Array of passwords to reject immediately |

## OAuth Settings

| Option | Fable Setting | Default | Description |
|--------|---------------|---------|-------------|
| `OAuthStateTTL` | `OratorAuthenticationOAuthStateTTL` | `300000` (5m) | OAuth state parameter TTL in milliseconds |
| `OAuthPostLoginRedirectURL` | `OratorAuthenticationOAuthPostLoginRedirectURL` | `'/'` | URL to redirect to after successful OAuth login |
| `OAuthProviders` | — | `{}` | Map of provider name → provider configuration |

## OAuth Provider Configuration

Each entry in `OAuthProviders` is keyed by a provider name and contains:

### OpenID Connect Provider (`Type: 'openid-connect'`)

| Field | Required | Description |
|-------|----------|-------------|
| `Type` | Yes | Must be `'openid-connect'` |
| `IssuerURL` | Yes | OIDC issuer URL (e.g., `'https://accounts.google.com'`) |
| `ClientID` | Yes | OAuth client ID from the provider's developer console |
| `ClientSecret` | Yes | OAuth client secret |
| `CallbackURL` | Yes | Full callback URL registered with the provider |
| `Scopes` | No | Array of scopes (default: `['openid', 'profile', 'email']`) |

### MSAL Provider (`Type: 'msal'`)

| Field | Required | Description |
|-------|----------|-------------|
| `Type` | Yes | Must be `'msal'` |
| `ClientID` | Yes | Azure AD application (client) ID |
| `ClientSecret` | Yes | Azure AD client secret |
| `Authority` | No | Authority URL (default: `'https://login.microsoftonline.com/common'`) |
| `TenantID` | No | Azure AD tenant ID (used if `Authority` is not set) |
| `CallbackURL` | Yes | Full callback URL registered in Azure portal |
| `Scopes` | No | Array of scopes (default: `['openid', 'profile', 'email']`) |

## Example Configurations

### Minimal (Development)

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication');
```

Uses all defaults: allow-all authenticator, 24-hour sessions, no OAuth.

### Production Username/Password

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		SessionTTL: 7200000,       // 2 hours
		CookieSecure: true,        // HTTPS only
		DeniedPasswords: ['password', '123456', 'abc123']
	});
```

### With OAuth Providers

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		SessionTTL: 28800000,      // 8 hours
		CookieSecure: true,
		OAuthPostLoginRedirectURL: '/dashboard',
		OAuthProviders:
		{
			'google':
			{
				Type: 'openid-connect',
				IssuerURL: 'https://accounts.google.com',
				ClientID: 'your-google-client-id.apps.googleusercontent.com',
				ClientSecret: 'your-google-client-secret',
				CallbackURL: 'https://myapp.com/1.0/OAuth/Callback/google',
				Scopes: ['openid', 'profile', 'email']
			},
			'microsoft':
			{
				Type: 'msal',
				ClientID: 'your-azure-client-id',
				ClientSecret: 'your-azure-client-secret',
				Authority: 'https://login.microsoftonline.com/your-tenant-id',
				CallbackURL: 'https://myapp.com/1.0/OAuth/Callback/microsoft',
				Scopes: ['openid', 'profile', 'email', 'Mail.Read']
			}
		}
	});
```

### Via Fable Settings

```javascript
let tmpFable = new libFable(
	{
		Product: 'MyApp',
		ProductVersion: '1.0.0',
		APIServerPort: 8080,

		OratorAuthenticationRoutePrefix: '/api/v2/',
		OratorAuthenticationSessionTTL: 3600000,
		OratorAuthenticationCookieName: 'AppSession'
	});

// No options needed -- reads from Fable settings
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication');
```
