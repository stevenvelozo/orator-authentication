# setSessionContextResolver()

Install a resolver that lets an authenticated session be re-pointed at a different
"context" without a fresh login. Once a resolver is set, the provider serves
`POST {routePrefix}Session/Context/:ContextKey`, which swaps the session's
`UserRecord` for whatever the resolver returns.

The provider stays schema-agnostic: it knows only an opaque context key (a route
parameter string) and the user record the resolver hands back. The consuming app
decides what a context is. A multi-tenant app maps the context key to a tenant and
returns the caller's persona in that tenant; the resolver is also where the
membership check lives.

## Signature

```javascript
setSessionContextResolver(fResolverFunction)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fResolverFunction` | `Function` | The resolver function to use |

### Resolver Function Signature

```javascript
(pCurrentUserRecord, pContextKey, fCallback) => { ... }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pCurrentUserRecord` | `object` | The session's current user record |
| `pContextKey` | `string` | The `:ContextKey` route parameter |
| `fCallback` | `Function` | Callback: `(pError, pUserRecord\|null)` |

Return a user record to switch the session into that context. Return `null` to
refuse the switch (the session is left untouched); this is how a membership or
authorization check rejects a context the caller may not enter.

## The route

Registered by `connectRoutes()` whether or not a resolver is set, but inert until
one is:

```
POST {routePrefix}Session/Context/:ContextKey
```

Responses (HTTP 200 with a body flag, matching the other auth routes):

| Body | Meaning |
|------|---------|
| `{ Switched: true, SessionID, UserID, UserRecord }` | Re-pointed; `UserRecord` is the new context |
| `{ Switched: false, Error: 'Context not permitted.' }` | Resolver returned `null` |
| `{ Switched: false, Error: 'Not authenticated.' }` | No cookie session |
| `{ Switched: false, Error: 'Context switching is not supported for token sessions.' }` | Bearer-token session |
| `{ Switched: false, Error: 'Session context switching is not enabled.' }` | No resolver installed |

## Notes

- Only cookie sessions can be switched. They live in the in-memory session store
  by reference, so replacing `UserRecord` persists for every later request on that
  session. Bearer-token sessions are ephemeral (never stored) and are scoped to
  their own context by design, so they are refused.
- The resolver receives the *current* record, so it can read the caller's identity
  (for example a global account id carried on the record) to decide which records
  they may switch into.
- If you run more than one server instance, the in-memory session store must be
  shared or sticky for a switch on one instance to be seen by the others. This is
  a pre-existing property of the cookie session store, not specific to this route.

## Example

```javascript
// The resolver: look up the caller's persona in the requested tenant. Returning
// null (no active membership) refuses the switch.
oratorAuthentication.setSessionContextResolver((pCurrentUserRecord, pContextKey, fCallback) =>
{
	let tmpIDAccount = pCurrentUserRecord.IDAccount;
	let tmpIDTenant = parseInt(pContextKey, 10);
	myDataLayer.findActivePersona(tmpIDAccount, tmpIDTenant, (pError, pPersona) =>
	{
		if (pError || !pPersona) { return fCallback(pError || null, null); }
		return fCallback(null, sanitize(pPersona));
	});
});
```

```bash
curl -b cookies.txt -X POST http://localhost:8080/1.0/Session/Context/42
# { "Switched": true, "UserRecord": { ... persona in tenant 42 ... } }
```

## See Also

- [setOAuthUserMapper()](api-setOAuthUserMapper.md) - resolve the record at login
- [getSessionForRequest()](api-getSessionForRequest.md) - read the current session
- [Session Management](session-management.md)
