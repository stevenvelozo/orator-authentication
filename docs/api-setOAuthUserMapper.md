# setOAuthUserMapper()

Replace the OAuth user mapper function that converts OIDC claims and tokens into a user record.

## Signature

```javascript
setOAuthUserMapper(fMapperFunction)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fMapperFunction` | `Function` | The mapper function to use |

### Mapper Function Signature

```javascript
(pProviderName, pClaims, pTokens, fCallback) => { ... }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pProviderName` | `string` | Provider name (e.g., `'google'`, `'microsoft'`) |
| `pClaims` | `object` | OIDC claims from the ID token |
| `pTokens` | `object` | Token information (see below) |
| `fCallback` | `Function` | Callback: `(pError, pUserRecord)` |

### Claims Object (pClaims)

Standard OIDC claims, plus any provider-specific claims:

```javascript
{
	sub: '110169484474386276334',
	name: 'Alice Smith',
	given_name: 'Alice',
	family_name: 'Smith',
	email: 'alice@example.com',
	preferred_username: 'alice@example.com',
	// Microsoft-specific:
	oid: '00000000-0000-0000-0000-000000000000',
	tid: '00000000-0000-0000-0000-000000000000'
}
```

### Tokens Object (pTokens)

```javascript
{
	AccessToken: 'eyJ...',       // OAuth access token
	RefreshToken: 'eyJ...',      // Refresh token (null for MSAL)
	IDToken: 'eyJ...',           // Raw ID token JWT
	ExpiresAt: 1709859600000     // Token expiry timestamp (ms)
}
```

### Callback Parameters

| Parameter | Type | Meaning |
|-----------|------|---------|
| `pError` | `Error\|null` | An error. Causes login to fail. |
| `pUserRecord` | `object\|null` | `null` = reject login. Object = create session with this record. |

## Returns

| Value | Type | Meaning |
|-------|------|---------|
| `true` | boolean | Mapper was replaced |
| `false` | boolean | Argument was not a function |

## Examples

### Look Up or Create User

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		let tmpEmail = pClaims.email;

		db.findUserByEmail(tmpEmail,
			(pError, pUser) =>
			{
				if (pUser)
				{
					return fCallback(null,
						{
							LoginID: pUser.username,
							IDUser: pUser.id,
							Email: pUser.email,
							Role: pUser.role
						});
				}

				// Auto-create account
				db.createUser({ email: tmpEmail, name: pClaims.name },
					(pCreateError, pNewUser) =>
					{
						if (pCreateError)
						{
							return fCallback(pCreateError, null);
						}
						return fCallback(null,
							{
								LoginID: pNewUser.username,
								IDUser: pNewUser.id,
								Email: pNewUser.email,
								Role: 'user'
							});
					});
			});
	});
```

### Domain Restriction

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		if (!pClaims.email || !pClaims.email.endsWith('@mycompany.com'))
		{
			return fCallback(null, null); // Reject
		}
		return fCallback(null,
			{
				LoginID: pClaims.email,
				IDUser: 0,
				FullName: pClaims.name || '',
				Email: pClaims.email
			});
	});
```

### Provider-Aware Mapping

```javascript
tmpFable.OratorAuthentication.setOAuthUserMapper(
	(pProviderName, pClaims, pTokens, fCallback) =>
	{
		let tmpRecord =
		{
			LoginID: pClaims.email || pClaims.sub,
			IDUser: 0,
			Email: pClaims.email || '',
			FullName: pClaims.name || ''
		};

		if (pProviderName === 'microsoft')
		{
			tmpRecord.AzureOID = pClaims.oid;
		}

		return fCallback(null, tmpRecord);
	});
```

## Notes

- The mapper is called after the provider successfully exchanges the authorization code for tokens.
- If the mapper returns `null` as the user record, the OAuth login is rejected and the user sees an error.
- The user record returned by the mapper is stored on the session exactly as-is.
- The default mapper extracts `preferred_username`, `email`, `given_name`, `family_name`, `name`, and `sub`.
