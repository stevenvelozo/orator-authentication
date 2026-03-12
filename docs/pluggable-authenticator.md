# Pluggable Authenticator

## Overview

The authenticator is the function that verifies username/password credentials. By default, Orator Authentication ships with an allow-all authenticator that accepts any credentials -- useful for development, but obviously not for production.

Use `setAuthenticator()` to replace it with your own verification logic.

## Default Authenticator

The built-in authenticator simply echoes back the username:

```javascript
// This is the default -- you don't need to write this
(pUsername, pPassword, fCallback) =>
{
	return fCallback(null, { LoginID: pUsername, IDUser: 0 });
};
```

## Replacing the Authenticator

### Basic Pattern

```javascript
tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		// Your authentication logic here
		// ...

		// Success: return a user record
		return fCallback(null, { LoginID: pUsername, IDUser: 42 });

		// Failure: return null as the second argument
		return fCallback(null, null);

		// Error: return an error as the first argument
		return fCallback(new Error('Database connection failed'), null);
	});
```

### Callback Signature

```
fCallback(pError, pUserRecord)
```

| Argument | Type | Meaning |
|----------|------|---------|
| `pError` | `Error\|null` | Pass an error if something went wrong (database down, etc.) |
| `pUserRecord` | `object\|null` | Pass `null` to indicate authentication failure. Pass an object to indicate success. |

### User Record

The user record can contain any properties you want. Whatever you return is stored on the session and returned to the client via `CheckSession`. Common fields:

| Field | Description |
|-------|-------------|
| `LoginID` | The username or identifier |
| `IDUser` | Numeric user ID |
| `NameFirst` | First name |
| `NameLast` | Last name |
| `FullName` | Display name |
| `Email` | Email address |

## Examples

### Database Lookup

```javascript
tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		tmpFable.DAL.query('SELECT * FROM Users WHERE Username = ?', [pUsername],
			(pError, pResults) =>
			{
				if (pError)
				{
					tmpFable.log.error(`Authentication DB error: ${pError.message}`);
					return fCallback(pError, null);
				}

				if (!pResults || pResults.length === 0)
				{
					return fCallback(null, null);
				}

				let tmpUser = pResults[0];

				if (!bcrypt.compareSync(pPassword, tmpUser.PasswordHash))
				{
					return fCallback(null, null);
				}

				return fCallback(null,
					{
						LoginID: tmpUser.Username,
						IDUser: tmpUser.IDUser,
						NameFirst: tmpUser.NameFirst,
						NameLast: tmpUser.NameLast,
						Email: tmpUser.Email,
						Role: tmpUser.Role
					});
			});
	});
```

### Meadow Integration

If you're using [Meadow](https://github.com/stevenvelozo/meadow) for data access:

```javascript
tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		let tmpFilter = tmpFable.Meadow.fable.newMeadow().query
			.addFilter('Username', pUsername);

		tmpFable.MeadowUsers.doRead(tmpFilter,
			(pError, pQuery, pRecord) =>
			{
				if (pError || !pRecord || pRecord.length === 0)
				{
					return fCallback(null, null);
				}

				let tmpUser = pRecord[0];

				if (tmpUser.Password !== hashPassword(pPassword))
				{
					return fCallback(null, null);
				}

				return fCallback(null,
					{
						LoginID: tmpUser.Username,
						IDUser: tmpUser.IDUser,
						NameFirst: tmpUser.NameFirst,
						NameLast: tmpUser.NameLast,
						Email: tmpUser.Email
					});
			});
	});
```

### Static User List (Testing)

```javascript
let tmpUsers =
{
	'alice': { Password: 'wonderland', IDUser: 1, Role: 'admin' },
	'bob': { Password: 'builder', IDUser: 2, Role: 'user' },
	'charlie': { Password: 'chocolate', IDUser: 3, Role: 'user' }
};

tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		let tmpUser = tmpUsers[pUsername];

		if (!tmpUser || tmpUser.Password !== pPassword)
		{
			return fCallback(null, null);
		}

		return fCallback(null,
			{
				LoginID: pUsername,
				IDUser: tmpUser.IDUser,
				Role: tmpUser.Role
			});
	});
```

## Denied Password List

Before the authenticator is called, the module checks the password against a configurable denied list. If the password matches, authentication is rejected immediately without invoking your authenticator.

```javascript
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		DeniedPasswords: ['password', '123456', 'abc123', 'qwerty', 'letmein']
	});
```

This is useful as a last line of defense against commonly breached passwords, even if your authenticator would otherwise accept them.
