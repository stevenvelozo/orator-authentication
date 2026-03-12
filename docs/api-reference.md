# API Reference

Complete reference for all public methods and properties of `OratorAuthentication`.

## Service Registration

Orator Authentication is a Fable service provider. Register it with the service manager:

```javascript
const libOratorAuthentication = require('orator-authentication');

tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', options);
```

After instantiation, access it as `tmpFable.OratorAuthentication`.

---

## Methods

### Core Authentication

| Method | Description | Details |
|--------|-------------|---------|
| [`connectRoutes()`](api-connectRoutes.md) | Register all authentication routes on the Orator service server | [Details](api-connectRoutes.md) |
| [`setAuthenticator(fn)`](api-setAuthenticator.md) | Replace the username/password authenticator function | [Details](api-setAuthenticator.md) |
| [`getSessionForRequest(request)`](api-getSessionForRequest.md) | Look up the authenticated session from a request's cookie | [Details](api-getSessionForRequest.md) |

### OAuth / OIDC

| Method | Description | Details |
|--------|-------------|---------|
| [`addOAuthProvider(name, config)`](api-addOAuthProvider.md) | Programmatically register an OAuth provider | [Details](api-addOAuthProvider.md) |
| [`setOAuthUserMapper(fn)`](api-setOAuthUserMapper.md) | Replace the OAuth claims-to-user-record mapper | [Details](api-setOAuthUserMapper.md) |
| `connectOAuthRoutes()` | Register OAuth routes (called automatically by `connectRoutes()`) | See below |

---

## Properties

### Configuration

| Property | Type | Description |
|----------|------|-------------|
| `routePrefix` | string | URL prefix for routes (default: `'/1.0/'`) |
| `cookieName` | string | Session cookie name (default: `'SessionID'`) |
| `sessionTTL` | number | Session TTL in ms (default: `86400000`) |
| `cookiePath` | string | Cookie path scope (default: `'/'`) |
| `cookieHttpOnly` | boolean | HttpOnly cookie flag (default: `true`) |
| `cookieSecure` | boolean | Secure cookie flag (default: `false`) |
| `deniedPasswords` | array | Passwords to reject immediately |
| `oauthStateTTL` | number | OAuth state TTL in ms (default: `300000`) |
| `oauthPostLoginRedirectURL` | string | Post-OAuth-login redirect (default: `'/'`) |

### State

| Property | Type | Description |
|----------|------|-------------|
| `sessionStore` | Map | In-memory session store (SessionID → session object) |
| `oauthProviders` | object | Registered provider configurations (name → config) |
| `oauthProviderInstances` | object | Initialized provider instances (name → provider) |

---

## Routes Registered

### By `connectRoutes()`

| Method | Route | Handler |
|--------|-------|---------|
| GET | `{prefix}Authenticate/:username/:password` | Authenticate via URL params |
| POST | `{prefix}Authenticate` | Authenticate via JSON body (`{ UserName, Password }`) |
| GET | `{prefix}CheckSession` | Return session if valid cookie present |
| GET | `{prefix}Deauthenticate` | Destroy session, clear cookie |
| POST | `{prefix}Deauthenticate` | Destroy session, clear cookie |

### By `connectOAuthRoutes()` (when providers configured)

| Method | Route | Handler |
|--------|-------|---------|
| GET | `{prefix}OAuth/Providers` | List providers `[{ Name, Type, BeginURL }]` |
| GET | `{prefix}OAuth/Begin/:provider` | Start OAuth flow, redirect to provider |
| GET | `{prefix}OAuth/Callback/:provider` | Handle callback, create session, redirect |

---

## Response Formats

### Successful Authentication

```json
{
	"LoggedIn": true,
	"SessionID": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
	"UserID": 42,
	"UserRecord": {
		"LoginID": "alice",
		"IDUser": 42,
		"NameFirst": "Alice",
		"NameLast": "Smith"
	}
}
```

### Failed Authentication

```json
{
	"LoggedIn": false,
	"Error": "Authentication failed."
}
```

### CheckSession (Valid)

```json
{
	"LoggedIn": true,
	"SessionID": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
	"UserID": 42,
	"UserRecord": {
		"LoginID": "alice",
		"IDUser": 42
	}
}
```

### CheckSession (No Session)

```json
{
	"LoggedIn": false
}
```

### Deauthenticate

```json
{
	"LoggedIn": false
}
```

### OAuth Providers List

```json
{
	"Providers": [
		{
			"Name": "google",
			"Type": "openid-connect",
			"BeginURL": "/1.0/OAuth/Begin/google"
		},
		{
			"Name": "microsoft",
			"Type": "msal",
			"BeginURL": "/1.0/OAuth/Begin/microsoft"
		}
	]
}
```

---

## Internal Methods

These methods are used internally and are not intended for direct use, but are documented for completeness:

| Method | Description |
|--------|-------------|
| `_parseCookies(cookieHeader)` | Parse a `Cookie` header into key-value pairs |
| `_createSession(userRecord)` | Create a new session and store it |
| `_destroySession(sessionID)` | Remove a session from the store |
| `_setSessionCookie(response, sessionID)` | Set the session cookie on a response |
| `_clearSessionCookie(response)` | Clear the session cookie (expire it) |
| `_handleAuthentication(username, password, response, next)` | Core auth logic (shared by GET/POST) |
| `_handleDeauthentication(request, response, next)` | Core logout logic |
| `_getOAuthProvider(name)` | Lazy-init and cache a provider instance |
| `_storeOAuthState(state, data)` | Store OAuth state for callback validation |
| `_consumeOAuthState(state)` | Retrieve and delete state (one-time use) |
| `_cleanupOAuthState()` | Purge expired state entries |
| `_startOAuthStateCleanup()` | Start 60-second cleanup interval |
| `_doRedirect(response, url, next)` | Send 302 redirect (with IPC fallback) |
| `_handleOAuthBegin(provider, request, response, next)` | Generate PKCE + redirect to provider |
| `_handleOAuthCallback(provider, request, response, next)` | Validate state, exchange code, create session |
