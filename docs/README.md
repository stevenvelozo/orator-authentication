# Orator Authentication

> Server-side cookie-based session authentication with pluggable authenticator and optional OAuth/OIDC support

Orator Authentication is a Fable service provider that adds cookie-based session management to any Orator API server. It ships with a default allow-all authenticator for rapid development, and provides a clean `setAuthenticator()` hook for plugging in real credential verification against your own data store.

For customers requiring federated identity, optional OAuth 2.0 / OpenID Connect login is supported via two provider backends -- generic OIDC (any provider) and Microsoft MSAL (for advanced Exchange/Graph scenarios). Both are optional peer dependencies; if not installed, the module works identically as a username/password session manager.

## Features

- **Cookie-Based Sessions** - Server-side session store with HttpOnly cookies and configurable TTL
- **Pluggable Authenticator** - Replace the credential verification function without touching routes
- **Zero-Config Defaults** - Works out of the box with sensible defaults for development
- **OAuth 2.0 / OIDC** - Optional federated login via OpenID Connect (Google, Okta, Azure AD, Auth0, etc.)
- **Microsoft MSAL** - Dedicated provider for Exchange Online, Microsoft Graph, and Azure AD B2C
- **PKCE Always On** - All OAuth flows use Proof Key for Code Exchange for maximum security
- **Pluggable User Mapper** - Convert OIDC claims to your application's user record format
- **Denied Password List** - Block known-bad passwords before they reach your authenticator
- **REST and IPC** - Works with Restify HTTP servers and Orator's in-process IPC for testing
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

This registers three route families on your server:

| Route | Method | Description |
|-------|--------|-------------|
| `/1.0/Authenticate/:username/:password` | GET | Authenticate via URL params |
| `/1.0/Authenticate` | POST | Authenticate via JSON body |
| `/1.0/CheckSession` | GET | Verify session from cookie |
| `/1.0/Deauthenticate` | GET, POST | Destroy the current session |

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

## Documentation

| Guide | Description |
|-------|-------------|
| [Quick Start](quickstart.md) | Installation, setup, and first authenticated request in under five minutes |
| [Architecture](architecture.md) | System design, session lifecycle, and OAuth flow diagrams |
| [Session Management](session-management.md) | How sessions work, TTL, cookie options, and the session store |
| [Pluggable Authenticator](pluggable-authenticator.md) | Replacing the default authenticator with real credential verification |
| [Configuration Reference](configuration.md) | Every configuration option with defaults and examples |
| [OAuth Overview](oauth-overview.md) | How OAuth/OIDC login works with this module |
| [Google Provider Guide](provider-google.md) | Step-by-step Google OIDC setup with token walkthrough |
| [Microsoft Provider Guide](provider-microsoft.md) | Azure AD setup via OpenID Connect |
| [Microsoft MSAL Guide](provider-microsoft-msal.md) | Advanced Microsoft setup for Exchange/Graph access |
| [OAuth User Mapper](oauth-user-mapper.md) | Mapping OIDC claims to your application's user records |
| [Full API Reference](api-reference.md) | Every public method with signatures and examples |

## Related Packages

- [orator](https://github.com/stevenvelozo/orator) - API server abstraction for REST and IPC
- [orator-serviceserver-restify](https://github.com/stevenvelozo/orator-serviceserver-restify) - Restify service server
- [pict-sessionmanager](https://github.com/stevenvelozo/pict-sessionmanager) - Client-side session manager for Pict applications
- [fable](https://github.com/stevenvelozo/fable) - Application services framework
- [meadow](https://github.com/stevenvelozo/meadow) - Data access layer with automatic REST endpoints
