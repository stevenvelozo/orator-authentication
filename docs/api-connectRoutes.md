# connectRoutes()

Register all authentication routes on the Orator service server. If OAuth providers are configured, OAuth routes are also registered automatically.

## Signature

```javascript
connectRoutes()
```

## Parameters

None.

## Returns

| Value | Type | Meaning |
|-------|------|---------|
| `true` | boolean | Routes were registered successfully |
| `false` | boolean | Orator is not initialized |

## Routes Registered

### Always Registered

| Method | Route | Description |
|--------|-------|-------------|
| GET | `{prefix}Authenticate/:username/:password` | Authenticate via URL params |
| POST | `{prefix}Authenticate` | Authenticate via JSON body |
| GET | `{prefix}CheckSession` | Verify session from cookie |
| GET | `{prefix}Deauthenticate` | Destroy session, clear cookie |
| POST | `{prefix}Deauthenticate` | Destroy session, clear cookie |

### Registered When OAuth Providers Are Configured

| Method | Route | Description |
|--------|-------|-------------|
| GET | `{prefix}OAuth/Providers` | List configured providers |
| GET | `{prefix}OAuth/Begin/:provider` | Start OAuth flow |
| GET | `{prefix}OAuth/Callback/:provider` | Handle OAuth callback |

The default prefix is `/1.0/`.

## Examples

### Basic Usage

```javascript
tmpFable.Orator.startService(
	() =>
	{
		tmpFable.OratorAuthentication.connectRoutes();
		console.log('Authentication routes registered');
	});
```

### With OAuth Providers

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
				CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/google'
			}
		}
	});

tmpFable.Orator.startService(
	() =>
	{
		// This registers both auth routes AND OAuth routes
		tmpFable.OratorAuthentication.connectRoutes();
	});
```

### Custom Route Prefix

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		RoutePrefix: '/api/v2/'
	});

tmpFable.Orator.startService(
	() =>
	{
		tmpFable.OratorAuthentication.connectRoutes();
		// Routes are now at /api/v2/Authenticate, /api/v2/CheckSession, etc.
	});
```

## Notes

- Orator must be initialized and its service started before calling `connectRoutes()`.
- The route prefix always ends with `/` -- if your prefix doesn't include a trailing slash, one is appended automatically.
- OAuth routes are only registered if at least one provider is configured (via constructor options or `addOAuthProvider()`).
- You can call `connectRoutes()` only once. Calling it again will attempt to re-register the same routes, which may cause errors depending on your service server implementation.
