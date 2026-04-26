/**
 * Orator Authentication — Beacon credential provider
 *
 * Validates username/password by dispatching an AUTH_Login work item
 * across an ultravisor-style beacon mesh. Credentials never travel
 * through orator-authentication's own user store; the auth beacon
 * (or whatever speaks the same dispatch contract) is the source of
 * truth for identity.
 *
 * Why this lives in orator-authentication
 * =======================================
 * orator-authentication already owns the cookie-session lifecycle,
 * the /Authenticate / CheckSession / Deauthenticate routes, and the
 * setAuthenticator hook. All that's missing for "credentials come
 * from a beacon" is the small adapter that knows the AUTH_Login
 * dispatch shape and the user-record translation. Putting the adapter
 * here means every orator-authentication consumer — not just
 * ultravisor — can flip a config flag and start delegating to a
 * mesh auth beacon.
 *
 * The provider is intentionally NOT coupled to ultravisor:
 *
 *   - It takes a generic `Dispatcher` callable in its config. The
 *     dispatcher's job is to send a (capability, action, settings)
 *     tuple wherever the auth beacon lives and resolve with the
 *     beacon's Outputs. ultravisor wraps its bridge; a different
 *     mesh-style host (or even a static stub for tests) can provide
 *     a different dispatcher.
 *
 *   - It targets the AUTH_* action contract defined by the
 *     ultravisor-auth-beacon module's Authentication capability:
 *
 *       AUTH_Login → { Success, UserContext: { UserID, Username, Roles }, ... }
 *
 *     Other dispatch flavors can be supported by pointing the
 *     Dispatcher at whatever does the right shape.
 *
 * Config:
 *   {
 *     Dispatcher: async function(pCapability, pAction, pSettings)
 *                 → Promise<{ Outputs: { Success, UserContext, ... } } | null>
 *     Capability: 'Authentication',         // optional, override action target
 *     LoginAction: 'AUTH_Login',            // optional, override action name
 *     UserRecordMapper: function(pUserContext) → user record   // optional
 *   }
 *
 * Default UserRecordMapper produces the shape orator-authentication
 * already expects: `{ LoginID, IDUser, Roles, NameFirst, NameLast,
 * FullName, Email }`. Override to surface custom fields from your
 * provider's UserContext.
 */

const DEFAULT_CAPABILITY = 'Authentication';
const DEFAULT_LOGIN_ACTION = 'AUTH_Login';

function _defaultUserRecordMapper(pUserContext, pUsername)
{
	let tmpCtx = pUserContext || {};
	return {
		LoginID: tmpCtx.Username || pUsername || '',
		IDUser: tmpCtx.UserID || 0,
		Roles: Array.isArray(tmpCtx.Roles) ? tmpCtx.Roles.slice() : [],
		NameFirst: tmpCtx.NameFirst || '',
		NameLast: tmpCtx.NameLast || '',
		FullName: tmpCtx.FullName || tmpCtx.Username || '',
		Email: tmpCtx.Email || ''
	};
}

class BeaconAuthenticatorProvider
{
	constructor(pFable, pConfig)
	{
		this.fable = pFable;
		this.log = (pFable && pFable.log) || console;
		pConfig = pConfig || {};
		if (typeof pConfig.Dispatcher !== 'function')
		{
			throw new Error('BeaconAuthenticatorProvider: Dispatcher (function) is required');
		}
		this._Dispatcher = pConfig.Dispatcher;
		this._Capability = pConfig.Capability || DEFAULT_CAPABILITY;
		this._LoginAction = pConfig.LoginAction || DEFAULT_LOGIN_ACTION;
		this._Mapper = (typeof pConfig.UserRecordMapper === 'function')
			? pConfig.UserRecordMapper
			: _defaultUserRecordMapper;
	}

	/**
	 * orator-authentication's setAuthenticator contract:
	 *   (pUsername, pPassword, fCallback) where fCallback is
	 *   (pError, pUserRecordOrNull). Returning null on the second
	 *   arg signals "credentials rejected" and orator-auth's
	 *   /Authenticate route returns 401 to the client.
	 *
	 * We invert async → callback here so the Dispatcher can be either
	 * a Promise-returning function or a regular function returning a
	 * resolved value.
	 */
	authenticate(pUsername, pPassword, fCallback)
	{
		let tmpSettings = { Username: pUsername, Password: pPassword };
		Promise.resolve()
			.then(() => this._Dispatcher(this._Capability, this._LoginAction, tmpSettings))
			.then((pResult) =>
			{
				// Accept either {Outputs: {...}} (the beacon-dispatch
				// envelope) or the bare outputs themselves. Lets the
				// dispatcher unwrap or pass through depending on its
				// own preferences.
				let tmpOutputs = (pResult && pResult.Outputs) || pResult || {};
				if (!tmpOutputs.Success)
				{
					return fCallback(null, null);
				}
				let tmpRecord = this._Mapper(tmpOutputs.UserContext, pUsername);
				return fCallback(null, tmpRecord);
			})
			.catch((pErr) =>
			{
				this.log.warn
					? this.log.warn('BeaconAuthenticatorProvider: dispatch failed: ' + (pErr && pErr.message))
					: null;
				return fCallback(pErr || new Error('Beacon authenticator dispatch failed'));
			});
	}

	/**
	 * Convenience getter so consumers that already have a provider
	 * instance can pass `provider.authenticator` directly to
	 * setAuthenticator().
	 */
	get authenticator()
	{
		return this.authenticate.bind(this);
	}
}

module.exports = BeaconAuthenticatorProvider;
