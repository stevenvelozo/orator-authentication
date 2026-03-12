# Orator Authentication

> Server-side cookie-based session authentication with pluggable authenticator and optional OAuth/OIDC support

Orator Authentication is a Fable service provider that adds cookie-based session management to any Orator API server. Plug in your own credential verification function, or use the built-in allow-all authenticator during development. For federated identity, add OAuth 2.0 / OpenID Connect login via any OIDC provider, or use the dedicated MSAL provider for advanced Microsoft/Exchange scenarios.

## Features

- **Cookie-Based Sessions** - Server-side session store with HttpOnly cookies and configurable TTL
- **Pluggable Authenticator** - Replace credential verification without touching routes
- **Zero-Config Defaults** - Works out of the box for development with sensible defaults
- **OAuth 2.0 / OIDC** - Optional federated login via OpenID Connect (Google, Okta, Azure AD, Auth0)
- **Microsoft MSAL** - Dedicated provider for Exchange Online, Graph API, and Azure AD B2C
- **PKCE** - All OAuth flows use Proof Key for Code Exchange for maximum security
- **Fable Integration** - First-class service provider with logging, configuration, and UUID generation

## Quick Start

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libOratorAuthentication = require('orator-authentication');

const _Fable = new libFable({
	Product: 'MyApp',
	ProductVersion: '1.0.0',
	APIServerPort: 8080
});

_Fable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
_Fable.serviceManager.addServiceType('Orator', libOrator);
_Fable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

_Fable.serviceManager.instantiateServiceProvider('Orator');
_Fable.serviceManager.instantiateServiceProvider('OratorAuthentication');

_Fable.Orator.startService(
	() =>
	{
		_Fable.OratorAuthentication.connectRoutes();
		console.log('Server running on port 8080');
	});
```

Test it:

```bash
# Authenticate
curl http://localhost:8080/1.0/Authenticate/alice/password123

# Check session
curl -b "SessionID=<id>" http://localhost:8080/1.0/CheckSession

# Log out
curl -b "SessionID=<id>" http://localhost:8080/1.0/Deauthenticate
```

## Installation

```bash
npm install orator-authentication
```

For OAuth support, install the provider library you need:

```bash
# Any OIDC provider (Google, Okta, Auth0, Azure AD)
npm install openid-client

# Microsoft-specific (Exchange, Graph API, Azure AD B2C)
npm install @azure/msal-node
```

## Plugging In Real Authentication

```javascript
_Fable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		myDatabase.verifyCredentials(pUsername, pPassword,
			(pError, pUser) =>
			{
				if (pError || !pUser)
				{
					return fCallback(null, null); // null = auth failed
				}
				return fCallback(null, {
					LoginID: pUser.Username,
					IDUser: pUser.ID,
					Email: pUser.Email
				});
			});
	});
```

## Adding OAuth Login

```javascript
_Fable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		OAuthProviders:
		{
			'google':
			{
				Type: 'openid-connect',
				IssuerURL: 'https://accounts.google.com',
				ClientID: process.env.GOOGLE_CLIENT_ID,
				ClientSecret: process.env.GOOGLE_CLIENT_SECRET,
				CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/google'
			}
		}
	});
```

Then direct users to `/1.0/OAuth/Begin/google` to start the login flow.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `RoutePrefix` | `'/1.0/'` | URL prefix for all routes |
| `SessionTTL` | `86400000` (24h) | Session time-to-live in milliseconds |
| `CookieName` | `'SessionID'` | Name of the session cookie |
| `CookieHttpOnly` | `true` | HttpOnly flag on cookie |
| `CookieSecure` | `false` | Secure flag on cookie (HTTPS only) |
| `DeniedPasswords` | `[]` | Passwords to reject before authenticator runs |
| `OAuthPostLoginRedirectURL` | `'/'` | Where to redirect after OAuth login |

## Documentation

Full documentation is available in the [`docs`](./docs) folder, or served locally:

- [Quick Start](docs/quickstart.md) - Up and running in five minutes
- [Architecture](docs/architecture.md) - System design and flow diagrams
- [Session Management](docs/session-management.md) - Sessions, TTL, and cookies
- [Pluggable Authenticator](docs/pluggable-authenticator.md) - Custom credential verification
- [Configuration Reference](docs/configuration.md) - All settings with defaults
- [OAuth Overview](docs/oauth-overview.md) - How OAuth/OIDC login works
- [Google Provider](docs/provider-google.md) - Step-by-step Google setup
- [Microsoft Provider](docs/provider-microsoft.md) - Azure AD via OpenID Connect
- [Microsoft MSAL](docs/provider-microsoft-msal.md) - Advanced Microsoft with Exchange/Graph
- [API Reference](docs/api-reference.md) - Every public method

## Related Packages

- [orator](https://github.com/stevenvelozo/orator) - API server abstraction for REST and IPC
- [orator-serviceserver-restify](https://github.com/stevenvelozo/orator-serviceserver-restify) - Restify service server
- [pict-sessionmanager](https://github.com/stevenvelozo/pict-sessionmanager) - Client-side session manager for Pict applications
- [fable](https://github.com/stevenvelozo/fable) - Application services framework
- [meadow](https://github.com/stevenvelozo/meadow) - Data access layer with automatic REST endpoints

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/stevenvelozo/retold/blob/main/docs/contributing.md).
