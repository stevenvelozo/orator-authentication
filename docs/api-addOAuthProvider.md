# addOAuthProvider()

Programmatically register an OAuth provider configuration.

## Signature

```javascript
addOAuthProvider(pName, pConfig)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `pName` | `string` | Provider name (e.g., `'google'`, `'microsoft'`) |
| `pConfig` | `object` | Provider configuration object |

### Configuration for OpenID Connect

```javascript
{
	Type: 'openid-connect',
	IssuerURL: 'https://accounts.google.com',
	ClientID: 'your-client-id',
	ClientSecret: 'your-client-secret',
	CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/google',
	Scopes: ['openid', 'profile', 'email']   // optional, these are the defaults
}
```

### Configuration for MSAL

```javascript
{
	Type: 'msal',
	ClientID: 'your-azure-client-id',
	ClientSecret: 'your-azure-client-secret',
	Authority: 'https://login.microsoftonline.com/your-tenant-id',
	CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/microsoft',
	Scopes: ['openid', 'profile', 'email', 'Mail.Read']
}
```

## Returns

| Value | Type | Meaning |
|-------|------|---------|
| `true` | boolean | Provider was registered |
| `false` | boolean | Invalid name or config |

## Examples

### Add a Provider Before Starting

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication');

tmpFable.OratorAuthentication.addOAuthProvider('google',
	{
		Type: 'openid-connect',
		IssuerURL: 'https://accounts.google.com',
		ClientID: process.env.GOOGLE_CLIENT_ID,
		ClientSecret: process.env.GOOGLE_CLIENT_SECRET,
		CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/google'
	});

// Now call connectRoutes() -- OAuth routes will be registered automatically
tmpFable.OratorAuthentication.connectRoutes();
```

### Add Multiple Providers

```javascript
tmpFable.OratorAuthentication.addOAuthProvider('google',
	{
		Type: 'openid-connect',
		IssuerURL: 'https://accounts.google.com',
		ClientID: process.env.GOOGLE_CLIENT_ID,
		ClientSecret: process.env.GOOGLE_CLIENT_SECRET,
		CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/google'
	});

tmpFable.OratorAuthentication.addOAuthProvider('microsoft',
	{
		Type: 'msal',
		ClientID: process.env.AZURE_CLIENT_ID,
		ClientSecret: process.env.AZURE_CLIENT_SECRET,
		Authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
		CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/microsoft',
		Scopes: ['openid', 'profile', 'email', 'Mail.Read']
	});
```

### Replace an Existing Provider

Calling `addOAuthProvider()` with the same name replaces the configuration and clears the cached provider instance:

```javascript
// Initial config
tmpFable.OratorAuthentication.addOAuthProvider('microsoft', { ... });

// Update config (e.g., rotated secret)
tmpFable.OratorAuthentication.addOAuthProvider('microsoft',
	{
		Type: 'msal',
		ClientID: process.env.AZURE_CLIENT_ID,
		ClientSecret: process.env.NEW_AZURE_CLIENT_SECRET,
		Authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
		CallbackURL: process.env.AZURE_CALLBACK_URL
	});
```

## Notes

- Providers can also be passed via constructor options in `OAuthProviders`. `addOAuthProvider()` is an alternative for programmatic registration.
- If called after `connectRoutes()`, you must call `connectOAuthRoutes()` manually to register routes for the new provider.
- The provider instance is lazily initialized on the first OAuth Begin request -- `addOAuthProvider()` itself does not require the `openid-client` or `@azure/msal-node` libraries to be installed.
- Provider names are case-sensitive. The name is used in the URL: `/1.0/OAuth/Begin/{name}`.
