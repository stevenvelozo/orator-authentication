# getSessionForRequest()

Look up the authenticated session for a request by parsing its Cookie header. This is the method to use in your own route handlers to check if a request is authenticated.

## Signature

```javascript
getSessionForRequest(pRequest)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pRequest` | `object` | The HTTP request object (must have `headers.cookie`) |

## Returns

| Value | Type | Meaning |
|-------|------|---------|
| Session object | `object` | Valid, non-expired session found |
| `null` | `null` | No session, no cookie, expired, or invalid |

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

## Examples

### Protect a Route

```javascript
tmpFable.Orator.serviceServer.get('/api/profile',
	(pRequest, pResponse, fNext) =>
	{
		let tmpSession = tmpFable.OratorAuthentication.getSessionForRequest(pRequest);

		if (!tmpSession)
		{
			pResponse.send(401, { Error: 'Authentication required' });
			return fNext();
		}

		pResponse.send(
			{
				UserID: tmpSession.UserRecord.IDUser,
				Name: tmpSession.UserRecord.LoginID,
				Email: tmpSession.UserRecord.Email
			});
		return fNext();
	});
```

### Authentication Middleware

Create a reusable middleware function:

```javascript
function requireAuth(pRequest, pResponse, fNext)
{
	let tmpSession = tmpFable.OratorAuthentication.getSessionForRequest(pRequest);

	if (!tmpSession)
	{
		pResponse.send(401, { Error: 'Authentication required' });
		return fNext(false); // Stop the middleware chain
	}

	// Attach session to request for downstream handlers
	pRequest.session = tmpSession;
	return fNext();
}

// Use the middleware
tmpFable.Orator.serviceServer.get('/api/data', requireAuth,
	(pRequest, pResponse, fNext) =>
	{
		// pRequest.session is guaranteed to exist here
		pResponse.send({ Data: 'protected content', User: pRequest.session.UserRecord });
		return fNext();
	});
```

### Check for OAuth Tokens

```javascript
tmpFable.Orator.serviceServer.get('/api/emails',
	(pRequest, pResponse, fNext) =>
	{
		let tmpSession = tmpFable.OratorAuthentication.getSessionForRequest(pRequest);

		if (!tmpSession)
		{
			pResponse.send(401, { Error: 'Not authenticated' });
			return fNext();
		}

		if (!tmpSession.OAuthTokens || tmpSession.OAuthTokens.Provider !== 'microsoft')
		{
			pResponse.send(403, { Error: 'Microsoft OAuth login required for email access' });
			return fNext();
		}

		// Use tmpSession.OAuthTokens.AccessToken to call Graph API
		// ...
	});
```

## Behavior

1. Parses the `Cookie` header from the request
2. Looks up the session cookie value in the session store
3. If the session exists, checks the TTL against `CreatedAt`
4. If expired, destroys the session and returns `null`
5. If valid, updates `LastAccess` and returns the session object

## Notes

- Returns `null` if `pRequest` is falsy or has no `headers` property.
- The TTL check compares `Date.now() - session.CreatedAt` against `sessionTTL`. Sessions expire at a fixed time after creation, regardless of activity.
- Calling this method updates `LastAccess` on the session (useful for auditing, but not used for TTL calculation).
- OAuth tokens on the session are available for server-side API calls but are never returned by the `CheckSession` route.
