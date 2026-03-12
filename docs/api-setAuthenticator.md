# setAuthenticator()

Replace the username/password authenticator function.

## Signature

```javascript
setAuthenticator(fAuthenticatorFunction)
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fAuthenticatorFunction` | `Function` | The authenticator function to use |

### Authenticator Function Signature

```javascript
(pUsername, pPassword, fCallback) => { ... }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pUsername` | `string` | The username from the request |
| `pPassword` | `string` | The password from the request |
| `fCallback` | `Function` | Callback: `(pError, pUserRecord)` |

### Callback Parameters

| Parameter | Type | Meaning |
|-----------|------|---------|
| `pError` | `Error\|null` | An error (e.g., database down). Causes auth failure. |
| `pUserRecord` | `object\|null` | `null` = auth failure. Object = auth success (stored on session). |

## Returns

| Value | Type | Meaning |
|-------|------|---------|
| `true` | boolean | Authenticator was replaced |
| `false` | boolean | Argument was not a function |

## Examples

### Basic Usage

```javascript
tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		if (pUsername === 'admin' && pPassword === 'secret')
		{
			return fCallback(null, { LoginID: 'admin', IDUser: 1, Role: 'admin' });
		}
		return fCallback(null, null);
	});
```

### Database Lookup

```javascript
tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		db.query('SELECT * FROM Users WHERE username = ?', [pUsername],
			(pError, pRows) =>
			{
				if (pError)
				{
					return fCallback(pError, null);
				}
				if (!pRows.length || !bcrypt.compareSync(pPassword, pRows[0].hash))
				{
					return fCallback(null, null);
				}
				return fCallback(null,
					{
						LoginID: pRows[0].username,
						IDUser: pRows[0].id,
						Email: pRows[0].email
					});
			});
	});
```

### Error Handling

```javascript
// Invalid argument -- logs error, returns false
let tmpResult = tmpFable.OratorAuthentication.setAuthenticator('not a function');
// tmpResult === false
```

## Notes

- The authenticator is called after the denied password check. If the password is in the denied list, your authenticator is never invoked.
- The default authenticator accepts any credentials and returns `{ LoginID: username, IDUser: 0 }`.
- The user record you return is stored on the session exactly as-is and returned to the client via `CheckSession`.
