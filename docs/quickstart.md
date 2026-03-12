# Quick Start

Get a working authenticated API server in under five minutes.

## 1. Install

```bash
npm install fable orator orator-serviceserver-restify orator-authentication
```

## 2. Create Your Server

Create `server.js`:

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libOratorAuthentication = require('orator-authentication');

let tmpFable = new libFable(
	{
		Product: 'MyApp',
		ProductVersion: '1.0.0',
		APIServerPort: 8080
	});

tmpFable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
tmpFable.serviceManager.addServiceType('Orator', libOrator);
tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

tmpFable.serviceManager.instantiateServiceProvider('Orator');
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication');

tmpFable.Orator.startService(
	() =>
	{
		tmpFable.OratorAuthentication.connectRoutes();
		console.log('Server running on http://localhost:8080');
	});
```

## 3. Start and Test

```bash
node server.js
```

The default authenticator accepts any username and password, so you can test immediately:

```bash
# Authenticate
curl http://localhost:8080/1.0/Authenticate/alice/password123
# => {"LoggedIn":true,"SessionID":"...","UserID":0,"UserRecord":{"LoginID":"alice","IDUser":0}}

# Check session (use the SessionID cookie from above)
curl -b "SessionID=<session-id-from-above>" http://localhost:8080/1.0/CheckSession
# => {"LoggedIn":true,"SessionID":"...","UserID":0,"UserRecord":{...}}

# Log out
curl -b "SessionID=<session-id-from-above>" http://localhost:8080/1.0/Deauthenticate
# => {"LoggedIn":false}
```

## 4. Add Real Authentication

Replace the default authenticator with your own credential verification:

```javascript
tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		// Look up the user in your database
		myDatabase.findUser(pUsername,
			(pError, pUser) =>
			{
				if (pError || !pUser)
				{
					return fCallback(null, null); // null = auth failed
				}

				// Verify the password
				if (!verifyPassword(pPassword, pUser.PasswordHash))
				{
					return fCallback(null, null);
				}

				// Return the user record (stored on the session)
				return fCallback(null,
					{
						LoginID: pUser.Username,
						IDUser: pUser.ID,
						NameFirst: pUser.FirstName,
						NameLast: pUser.LastName,
						Email: pUser.Email
					});
			});
	});
```

## 5. Add a Denied Password List

Block known-bad passwords before they reach your authenticator:

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		DeniedPasswords: ['password', '123456', 'abc123', 'letmein']
	});
```

## 6. Add POST-Based Authentication

The POST route is already registered by `connectRoutes()`. Send a JSON body:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"UserName":"alice","Password":"password123"}' \
  http://localhost:8080/1.0/Authenticate
```

## Next Steps

- [Session Management](session-management.md) - Configure session TTL, cookie options, and understand the session lifecycle
- [Pluggable Authenticator](pluggable-authenticator.md) - Learn patterns for database-backed authentication
- [OAuth Overview](oauth-overview.md) - Add Google, Microsoft, or other OAuth/OIDC login
- [Configuration Reference](configuration.md) - Full list of configuration options
