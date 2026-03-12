# Session Management

## How Sessions Work

When a user authenticates (via username/password or OAuth), the module creates a server-side session object and stores it in an in-memory `Map`. The session ID is sent to the client as an `HttpOnly` cookie. On subsequent requests, the cookie is parsed and the session is looked up.

### Session Object Structure

```javascript
{
	SessionID: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
	UserRecord:
	{
		LoginID: 'alice',
		IDUser: 42,
		NameFirst: 'Alice',
		NameLast: 'Smith',
		Email: 'alice@example.com'
	},
	CreatedAt: 1709856000000,
	LastAccess: 1709856300000,

	// Only present for OAuth sessions:
	OAuthTokens:
	{
		AccessToken: 'eyJ...',
		RefreshToken: 'eyJ...',
		ExpiresAt: 1709859600000,
		Provider: 'microsoft'
	}
}
```

### What Gets Returned to the Client

The `CheckSession` endpoint returns only `LoggedIn`, `SessionID`, `UserID`, and `UserRecord`. **OAuth tokens are never exposed** through the `CheckSession` response. If your server-side code needs the tokens (e.g., to call Microsoft Graph), access them directly from the session store.

## Session TTL

Sessions expire after a configurable time-to-live. When a session is older than the TTL, `getSessionForRequest()` automatically destroys it and returns `null`.

```javascript
// Default: 24 hours (86400000 ms)
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		SessionTTL: 3600000 // 1 hour
	});
```

The TTL is checked against `CreatedAt`, not `LastAccess`. This means a session will expire at a fixed time after creation regardless of activity.

## Cookie Configuration

| Option | Default | Description |
|--------|---------|-------------|
| `CookieName` | `'SessionID'` | Name of the session cookie |
| `CookiePath` | `'/'` | Path scope for the cookie |
| `CookieHttpOnly` | `true` | Prevent JavaScript access to the cookie |
| `CookieSecure` | `false` | Only send cookie over HTTPS |

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		CookieName: 'AppSession',
		CookiePath: '/api/',
		CookieHttpOnly: true,
		CookieSecure: true  // Enable for production HTTPS deployments
	});
```

## Accessing Sessions Programmatically

Use `getSessionForRequest()` in your own route handlers to check authentication:

```javascript
tmpFable.Orator.serviceServer.get('/api/protected-resource',
	(pRequest, pResponse, fNext) =>
	{
		let tmpSession = tmpFable.OratorAuthentication.getSessionForRequest(pRequest);

		if (!tmpSession)
		{
			pResponse.send(401, { Error: 'Not authenticated' });
			return fNext();
		}

		// Session is valid -- use the user record
		pResponse.send(
			{
				Message: `Hello, ${tmpSession.UserRecord.LoginID}!`,
				UserID: tmpSession.UserRecord.IDUser
			});
		return fNext();
	});
```

## Accessing OAuth Tokens Server-Side

For OAuth sessions, the tokens are stored on the session object. Access them in your server-side code for API calls to the provider:

```javascript
tmpFable.Orator.serviceServer.get('/api/my-emails',
	(pRequest, pResponse, fNext) =>
	{
		let tmpSession = tmpFable.OratorAuthentication.getSessionForRequest(pRequest);

		if (!tmpSession || !tmpSession.OAuthTokens)
		{
			pResponse.send(401, { Error: 'OAuth session required' });
			return fNext();
		}

		// Use the access token to call Microsoft Graph
		let tmpAccessToken = tmpSession.OAuthTokens.AccessToken;

		fetch('https://graph.microsoft.com/v1.0/me/messages',
			{
				headers: { Authorization: `Bearer ${tmpAccessToken}` }
			})
			.then((pGraphResponse) => pGraphResponse.json())
			.then((pData) => { pResponse.send(pData); return fNext(); })
			.catch((pError) => { pResponse.send(500, { Error: pError.message }); return fNext(); });
	});
```

## Session Store Notes

The session store is an in-memory `Map`. This means:

- **Fast** - No external dependencies, O(1) lookups
- **Simple** - No configuration, no connection strings
- **Ephemeral** - Sessions are lost when the process restarts
- **Single-Process** - Sessions are not shared across cluster workers or multiple instances

For production deployments requiring session persistence or multi-instance sharing, implement a custom session store by replacing the internal `sessionStore` map or by using `getSessionForRequest()` as middleware in front of your own storage.
