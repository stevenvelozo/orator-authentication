# OAuth User Mapper

## Overview

The OAuth user mapper converts OIDC claims (the identity information returned by the OAuth provider) into a user record for your application. It runs after a successful OAuth callback, before the session is created.

## Default Mapper

The default mapper extracts standard OIDC claims and returns a basic user record:

```javascript
(pProviderName, pClaims, pTokens, fCallback) =>
{
	return fCallback(null,
		{
			LoginID: pClaims.preferred_username || pClaims.email || pClaims.sub,
			IDUser: 0,
			NameFirst: pClaims.given_name || '',
			NameLast: pClaims.family_name || '',
			FullName: pClaims.name || '',
			Email: pClaims.email || ''
		});
};
```

This works well for applications that don't need to look up or create user records in a database.

## Custom Mapper

Replace the default mapper with `setOAuthUserMapper()`:

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		// Your custom mapping logic
		// ...
		return fCallback(null, userRecord);
	});
```

### Callback Signature

```
fCallback(pError, pUserRecord)
```

| Argument | Type | Meaning |
|----------|------|---------|
| `pError` | `Error\|null` | Pass an error if mapping fails (login will be rejected) |
| `pUserRecord` | `object\|null` | Pass `null` to reject the login. Pass an object to create a session. |

### Arguments Provided to the Mapper

| Argument | Type | Description |
|----------|------|-------------|
| `pProviderName` | string | The name used when registering the provider (e.g., `'google'`, `'microsoft'`) |
| `pClaims` | object | OIDC claims from the ID token (sub, name, email, etc.) |
| `pTokens` | object | Token information: `{ AccessToken, RefreshToken, IDToken, ExpiresAt }` |
| `fCallback` | function | Callback to invoke with the result |

### Standard OIDC Claims

Most providers return these standard claims:

| Claim | Description |
|-------|-------------|
| `sub` | Subject identifier (unique user ID at the provider) |
| `name` | Full display name |
| `given_name` | First name |
| `family_name` | Last name |
| `email` | Email address |
| `preferred_username` | Username or login ID |
| `picture` | Profile picture URL |

Microsoft providers may also include:

| Claim | Description |
|-------|-------------|
| `oid` | Azure AD object ID |
| `tid` | Azure AD tenant ID |

## Examples

### Look Up or Create User in Database

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		let tmpEmail = pClaims.email;

		if (!tmpEmail)
		{
			return fCallback(new Error('No email claim from provider'), null);
		}

		// Look up user by email
		myDatabase.findUserByEmail(tmpEmail,
			(pError, pUser) =>
			{
				if (pError)
				{
					return fCallback(pError, null);
				}

				if (pUser)
				{
					// Existing user -- return their record
					return fCallback(null,
						{
							LoginID: pUser.Username,
							IDUser: pUser.ID,
							NameFirst: pUser.FirstName,
							NameLast: pUser.LastName,
							Email: pUser.Email,
							Role: pUser.Role
						});
				}

				// New user -- create an account
				myDatabase.createUser(
					{
						Username: tmpEmail,
						FirstName: pClaims.given_name || '',
						LastName: pClaims.family_name || '',
						Email: tmpEmail,
						OAuthProvider: pProviderName,
						OAuthSubject: pClaims.sub
					},
					(pCreateError, pNewUser) =>
					{
						if (pCreateError)
						{
							return fCallback(pCreateError, null);
						}

						return fCallback(null,
							{
								LoginID: pNewUser.Username,
								IDUser: pNewUser.ID,
								NameFirst: pNewUser.FirstName,
								NameLast: pNewUser.LastName,
								Email: pNewUser.Email,
								Role: 'user'
							});
					});
			});
	});
```

### Restrict to Specific Domain

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		let tmpEmail = pClaims.email || '';

		if (!tmpEmail.endsWith('@mycompany.com'))
		{
			tmpFable.log.warn(`OAuth login rejected: ${tmpEmail} is not a company email.`);
			return fCallback(null, null); // null user = reject login
		}

		return fCallback(null,
			{
				LoginID: tmpEmail,
				IDUser: 0,
				FullName: pClaims.name || '',
				Email: tmpEmail
			});
	});
```

### Provider-Specific Mapping

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		let tmpUserRecord =
		{
			LoginID: pClaims.email || pClaims.sub,
			IDUser: 0,
			Email: pClaims.email || '',
			FullName: pClaims.name || '',
			Provider: pProviderName
		};

		if (pProviderName === 'microsoft')
		{
			// Microsoft-specific fields
			tmpUserRecord.AzureObjectID = pClaims.oid;
			tmpUserRecord.TenantID = pClaims.tid;
		}
		else if (pProviderName === 'google')
		{
			// Google-specific fields
			tmpUserRecord.GoogleSubject = pClaims.sub;
			tmpUserRecord.ProfilePicture = pClaims.picture;
		}

		return fCallback(null, tmpUserRecord);
	});
```

### Access Token Passthrough

Store the access token on the user record if you need it for downstream API calls:

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		return fCallback(null,
			{
				LoginID: pClaims.email || pClaims.sub,
				IDUser: 0,
				FullName: pClaims.name || '',
				Email: pClaims.email || '',
				// Note: OAuthTokens are also stored separately on the session
				// by the module itself. This is for if you want to include
				// specific token data in your user record.
				HasExchangeAccess: pTokens.AccessToken ? true : false
			});
	});
```
