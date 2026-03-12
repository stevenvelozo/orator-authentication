/**
* Orator Authentication
*
* Server-side cookie-based session authentication service with a pluggable
* authenticator function. Registers Authenticate, CheckSession, and
* Deauthenticate routes on the Orator service server.
*
* The default authenticator accepts any username/password (for development).
* Use setAuthenticator() to plug in real credential verification.
*
* OAuth/OIDC support is available via optional provider backends:
*   - openid-client v6 (any OIDC provider: Google, Okta, Azure AD, etc.)
*   - @azure/msal-node (advanced Microsoft/Exchange scenarios)
* Install these as needed; if absent, OAuth routes are simply not registered.
*
* @author Steven Velozo <steven@velozo.com>
* @license MIT
*/
const libFableServiceProviderBase = require('fable-serviceproviderbase');
const libCrypto = require('crypto');

class OratorAuthentication extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'OratorAuthentication';

		// --- Configuration: options → fable settings → defaults ---
		this.routePrefix = (`RoutePrefix` in this.options) ? this.options.RoutePrefix
			: `OratorAuthenticationRoutePrefix` in this.fable.settings ? this.fable.settings.OratorAuthenticationRoutePrefix
			: '/1.0/';

		this.cookieName = (`CookieName` in this.options) ? this.options.CookieName
			: `OratorAuthenticationCookieName` in this.fable.settings ? this.fable.settings.OratorAuthenticationCookieName
			: 'SessionID';

		this.sessionTTL = (`SessionTTL` in this.options) ? this.options.SessionTTL
			: `OratorAuthenticationSessionTTL` in this.fable.settings ? this.fable.settings.OratorAuthenticationSessionTTL
			: 86400000; // 24 hours

		this.cookiePath = (`CookiePath` in this.options) ? this.options.CookiePath
			: '/';

		this.cookieHttpOnly = (`CookieHttpOnly` in this.options) ? this.options.CookieHttpOnly
			: true;

		this.cookieSecure = (`CookieSecure` in this.options) ? this.options.CookieSecure
			: false;

		this.deniedPasswords = (`DeniedPasswords` in this.options) ? this.options.DeniedPasswords
			: `OratorAuthenticationDeniedPasswords` in this.fable.settings ? this.fable.settings.OratorAuthenticationDeniedPasswords
			: [];

		// --- In-memory session store ---
		this.sessionStore = new Map();

		// --- OAuth Configuration ---
		this.oauthProviders = {};           // Provider name → config
		this.oauthProviderInstances = {};   // Provider name → initialized provider instance
		this._oauthStateStore = new Map();  // State string → { CodeVerifier, Nonce, Provider, CreatedAt }

		this.oauthStateTTL = (`OAuthStateTTL` in this.options) ? this.options.OAuthStateTTL
			: `OratorAuthenticationOAuthStateTTL` in this.fable.settings ? this.fable.settings.OratorAuthenticationOAuthStateTTL
			: 300000; // 5 minutes

		this.oauthPostLoginRedirectURL = (`OAuthPostLoginRedirectURL` in this.options) ? this.options.OAuthPostLoginRedirectURL
			: `OratorAuthenticationOAuthPostLoginRedirectURL` in this.fable.settings ? this.fable.settings.OratorAuthenticationOAuthPostLoginRedirectURL
			: '/';

		// --- Pluggable OAuth user mapper (default: pass claims through) ---
		this._oauthUserMapper = (pProviderName, pClaims, pTokens, fCallback) =>
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

		// Load OAuth providers from options
		if (this.options.OAuthProviders && typeof this.options.OAuthProviders === 'object')
		{
			let tmpProviderNames = Object.keys(this.options.OAuthProviders);
			for (let i = 0; i < tmpProviderNames.length; i++)
			{
				this.oauthProviders[tmpProviderNames[i]] = this.options.OAuthProviders[tmpProviderNames[i]];
			}
		}

		this._oauthStateCleanupInterval = null;

		// --- Pluggable authenticator (default: allow-all) ---
		this._authenticator = (pUsername, pPassword, fCallback) =>
		{
			return fCallback(null, { LoginID: pUsername, IDUser: 0 });
		};
	}

	/**
	 * Replace the authenticator function.
	 *
	 * @param {Function} fAuthenticatorFunction - (pUsername, pPassword, fCallback)
	 *        fCallback signature: (pError, pUserRecord|null)
	 *        Return null pUserRecord to indicate authentication failure.
	 */
	setAuthenticator(fAuthenticatorFunction)
	{
		if (typeof fAuthenticatorFunction !== 'function')
		{
			this.log.error('OratorAuthentication.setAuthenticator(): argument must be a function.');
			return false;
		}
		this._authenticator = fAuthenticatorFunction;
		return true;
	}

	/**
	 * Parse a Cookie header string into a { name: value } object.
	 *
	 * @param {string} pCookieHeader - Raw Cookie header value
	 * @returns {object} Parsed cookies
	 */
	_parseCookies(pCookieHeader)
	{
		let tmpResult = {};

		if (!pCookieHeader || typeof pCookieHeader !== 'string')
		{
			return tmpResult;
		}

		let tmpPairs = pCookieHeader.split(';');

		for (let i = 0; i < tmpPairs.length; i++)
		{
			let tmpPair = tmpPairs[i].trim();
			let tmpEqIndex = tmpPair.indexOf('=');

			if (tmpEqIndex > 0)
			{
				let tmpName = tmpPair.substring(0, tmpEqIndex).trim();
				let tmpValue = tmpPair.substring(tmpEqIndex + 1).trim();
				tmpResult[tmpName] = tmpValue;
			}
		}

		return tmpResult;
	}

	/**
	 * Create a new session for the given user record.
	 *
	 * @param {object} pUserRecord - The authenticated user record
	 * @returns {object} The session object
	 */
	_createSession(pUserRecord)
	{
		let tmpSessionID = this.fable.getUUID();
		let tmpNow = Date.now();

		let tmpSession =
		{
			SessionID: tmpSessionID,
			UserRecord: pUserRecord,
			CreatedAt: tmpNow,
			LastAccess: tmpNow
		};

		this.sessionStore.set(tmpSessionID, tmpSession);

		return tmpSession;
	}

	/**
	 * Destroy a session by its ID.
	 *
	 * @param {string} pSessionID - The session ID to destroy
	 */
	_destroySession(pSessionID)
	{
		this.sessionStore.delete(pSessionID);
	}

	/**
	 * Set the session cookie on the response.
	 *
	 * @param {object} pResponse - The HTTP response object
	 * @param {string} pSessionID - The session ID value
	 */
	_setSessionCookie(pResponse, pSessionID)
	{
		let tmpCookie = `${this.cookieName}=${pSessionID}; Path=${this.cookiePath}`;

		if (this.cookieHttpOnly)
		{
			tmpCookie += '; HttpOnly';
		}
		if (this.cookieSecure)
		{
			tmpCookie += '; Secure';
		}

		if (typeof pResponse.setHeader === 'function')
		{
			pResponse.setHeader('Set-Cookie', tmpCookie);
		}
		else if (typeof pResponse.header === 'function')
		{
			pResponse.header('Set-Cookie', tmpCookie);
		}
	}

	/**
	 * Clear the session cookie on the response by expiring it.
	 *
	 * @param {object} pResponse - The HTTP response object
	 */
	_clearSessionCookie(pResponse)
	{
		let tmpCookie = `${this.cookieName}=; Path=${this.cookiePath}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

		if (this.cookieHttpOnly)
		{
			tmpCookie += '; HttpOnly';
		}
		if (this.cookieSecure)
		{
			tmpCookie += '; Secure';
		}

		if (typeof pResponse.setHeader === 'function')
		{
			pResponse.setHeader('Set-Cookie', tmpCookie);
		}
		else if (typeof pResponse.header === 'function')
		{
			pResponse.header('Set-Cookie', tmpCookie);
		}
	}

	/**
	 * Look up the authenticated session for a request by parsing its Cookie header.
	 * Returns the session object or null if no valid session exists.
	 *
	 * @param {object} pRequest - The HTTP request object
	 * @returns {object|null} The session object or null
	 */
	getSessionForRequest(pRequest)
	{
		if (!pRequest || !pRequest.headers)
		{
			return null;
		}

		let tmpCookies = this._parseCookies(pRequest.headers.cookie);
		let tmpSessionID = tmpCookies[this.cookieName];

		if (!tmpSessionID)
		{
			return null;
		}

		let tmpSession = this.sessionStore.get(tmpSessionID);

		if (!tmpSession)
		{
			return null;
		}

		// Check TTL
		let tmpNow = Date.now();
		if ((tmpNow - tmpSession.CreatedAt) > this.sessionTTL)
		{
			this._destroySession(tmpSessionID);
			return null;
		}

		// Update last access time
		tmpSession.LastAccess = tmpNow;

		return tmpSession;
	}

	/**
	 * Internal: perform authentication logic shared by GET and POST routes.
	 *
	 * @param {string} pUsername - The username
	 * @param {string} pPassword - The password
	 * @param {object} pResponse - The HTTP response object
	 * @param {Function} fNext - The next middleware function
	 */
	_handleAuthentication(pUsername, pPassword, pResponse, fNext)
	{
		// Check denied passwords first
		if (this.deniedPasswords.indexOf(pPassword) >= 0)
		{
			this.log.info(`Authentication denied for user [${pUsername}]: password is in denied list.`);
			pResponse.send({ LoggedIn: false, Error: 'Authentication failed.' });
			return fNext();
		}

		this._authenticator(pUsername, pPassword,
			(pError, pUserRecord) =>
			{
				if (pError || !pUserRecord)
				{
					this.log.info(`Authentication failed for user [${pUsername}].`);
					pResponse.send({ LoggedIn: false, Error: 'Authentication failed.' });
					return fNext();
				}

				let tmpSession = this._createSession(pUserRecord);
				this._setSessionCookie(pResponse, tmpSession.SessionID);

				this.log.info(`User [${pUsername}] authenticated, session [${tmpSession.SessionID}].`);
				pResponse.send(
				{
					LoggedIn: true,
					SessionID: tmpSession.SessionID,
					UserID: pUserRecord.IDUser || 0,
					UserRecord: pUserRecord
				});
				return fNext();
			});
	}

	/**
	 * Internal: perform deauthentication logic shared by GET and POST routes.
	 *
	 * @param {object} pRequest - The HTTP request object
	 * @param {object} pResponse - The HTTP response object
	 * @param {Function} fNext - The next middleware function
	 */
	_handleDeauthentication(pRequest, pResponse, fNext)
	{
		let tmpSession = this.getSessionForRequest(pRequest);

		if (tmpSession)
		{
			this._destroySession(tmpSession.SessionID);
			this.log.info(`Session [${tmpSession.SessionID}] deauthenticated.`);
		}

		this._clearSessionCookie(pResponse);
		pResponse.send({ LoggedIn: false });
		return fNext();
	}

	/**
	 * Register authentication routes on the Orator service server.
	 *
	 * @returns {boolean} True if routes were registered successfully
	 */
	connectRoutes()
	{
		if (!this.fable.Orator)
		{
			this.log.error('OratorAuthentication: Orator must be initialized before connecting routes.');
			return false;
		}

		let tmpServiceServer = this.fable.Orator.serviceServer;
		let tmpPrefix = this.routePrefix;

		// Ensure prefix ends with /
		if (tmpPrefix.charAt(tmpPrefix.length - 1) !== '/')
		{
			tmpPrefix += '/';
		}

		// --- GET /1.0/Authenticate/:username/:password ---
		tmpServiceServer.get(`${tmpPrefix}Authenticate/:username/:password`,
			(pRequest, pResponse, fNext) =>
			{
				let tmpUsername = pRequest.params.username;
				let tmpPassword = pRequest.params.password;

				return this._handleAuthentication(tmpUsername, tmpPassword, pResponse, fNext);
			});

		// --- POST /1.0/Authenticate ---
		tmpServiceServer.post(`${tmpPrefix}Authenticate`,
			(pRequest, pResponse, fNext) =>
			{
				let tmpBody = pRequest.body || {};
				let tmpUsername = tmpBody.UserName || tmpBody.username || '';
				let tmpPassword = tmpBody.Password || tmpBody.password || '';

				if (!tmpUsername)
				{
					pResponse.send({ LoggedIn: false, Error: 'UserName is required.' });
					return fNext();
				}

				return this._handleAuthentication(tmpUsername, tmpPassword, pResponse, fNext);
			});

		// --- GET /1.0/CheckSession ---
		tmpServiceServer.get(`${tmpPrefix}CheckSession`,
			(pRequest, pResponse, fNext) =>
			{
				let tmpSession = this.getSessionForRequest(pRequest);

				if (!tmpSession)
				{
					pResponse.send({ LoggedIn: false });
					return fNext();
				}

				pResponse.send(
				{
					LoggedIn: true,
					SessionID: tmpSession.SessionID,
					UserID: tmpSession.UserRecord.IDUser || 0,
					UserRecord: tmpSession.UserRecord
				});
				return fNext();
			});

		// --- GET /1.0/Deauthenticate ---
		tmpServiceServer.get(`${tmpPrefix}Deauthenticate`,
			(pRequest, pResponse, fNext) =>
			{
				return this._handleDeauthentication(pRequest, pResponse, fNext);
			});

		// --- POST /1.0/Deauthenticate ---
		tmpServiceServer.post(`${tmpPrefix}Deauthenticate`,
			(pRequest, pResponse, fNext) =>
			{
				return this._handleDeauthentication(pRequest, pResponse, fNext);
			});

		this.log.info(`OratorAuthentication: Routes registered at ${tmpPrefix}Authenticate, ${tmpPrefix}CheckSession, ${tmpPrefix}Deauthenticate`);

		// --- OAuth Routes (if providers are configured) ---
		if (Object.keys(this.oauthProviders).length > 0)
		{
			this.connectOAuthRoutes();
		}

		return true;
	}

	// ======================================================================
	// OAuth / OIDC Support
	// ======================================================================

	/**
	 * Replace the OAuth user mapper function.
	 * The mapper converts OIDC claims and tokens into a user record.
	 *
	 * @param {Function} fMapperFunction - (pProviderName, pClaims, pTokens, fCallback)
	 *        fCallback signature: (pError, pUserRecord|null)
	 * @returns {boolean} True if the mapper was replaced
	 */
	setOAuthUserMapper(fMapperFunction)
	{
		if (typeof fMapperFunction !== 'function')
		{
			this.log.error('OratorAuthentication.setOAuthUserMapper(): argument must be a function.');
			return false;
		}
		this._oauthUserMapper = fMapperFunction;
		return true;
	}

	/**
	 * Programmatically add an OAuth provider configuration.
	 *
	 * @param {string} pName - Provider name (e.g., 'microsoft', 'google')
	 * @param {object} pConfig - Provider configuration object
	 * @returns {boolean} True if the provider was added
	 */
	addOAuthProvider(pName, pConfig)
	{
		if (!pName || typeof pName !== 'string')
		{
			this.log.error('OratorAuthentication.addOAuthProvider(): name must be a non-empty string.');
			return false;
		}
		if (!pConfig || typeof pConfig !== 'object')
		{
			this.log.error('OratorAuthentication.addOAuthProvider(): config must be an object.');
			return false;
		}
		this.oauthProviders[pName] = pConfig;
		// Clear any cached instance so it re-initializes with new config
		delete this.oauthProviderInstances[pName];
		return true;
	}

	/**
	 * Get or create an initialized OAuth provider instance.
	 * Lazy-initializes on first use and caches the result.
	 *
	 * @param {string} pName - Provider name
	 * @returns {Promise<object|null>} The provider instance or null
	 */
	async _getOAuthProvider(pName)
	{
		// Return cached instance if already initialized
		if (this.oauthProviderInstances[pName])
		{
			return this.oauthProviderInstances[pName];
		}

		let tmpConfig = this.oauthProviders[pName];
		if (!tmpConfig)
		{
			return null;
		}

		let tmpProviderType = (tmpConfig.Type || 'openid-connect').toLowerCase();
		let tmpProvider = null;

		try
		{
			if (tmpProviderType === 'msal')
			{
				let OAuthProviderMSAL = require('./Orator-Authentication-Provider-MSAL.js');
				tmpProvider = new OAuthProviderMSAL(this.fable, tmpConfig);
			}
			else
			{
				// Default: openid-connect
				let OAuthProviderOIDC = require('./Orator-Authentication-Provider-OIDC.js');
				tmpProvider = new OAuthProviderOIDC(this.fable, tmpConfig);
			}

			await tmpProvider.initialize();
			this.oauthProviderInstances[pName] = tmpProvider;
			return tmpProvider;
		}
		catch (pError)
		{
			this.log.error(`OratorAuthentication: Failed to initialize OAuth provider [${pName}]: ${pError.message}`);
			return null;
		}
	}

	/**
	 * Store OAuth state for the authorization flow.
	 *
	 * @param {string} pState - The state parameter
	 * @param {object} pData - { CodeVerifier, Nonce, Provider }
	 */
	_storeOAuthState(pState, pData)
	{
		pData.CreatedAt = Date.now();
		this._oauthStateStore.set(pState, pData);
	}

	/**
	 * Retrieve and consume OAuth state (one-time use).
	 * Returns null if the state is not found or has expired.
	 *
	 * @param {string} pState - The state parameter
	 * @returns {object|null} The stored data or null
	 */
	_consumeOAuthState(pState)
	{
		let tmpData = this._oauthStateStore.get(pState);
		if (!tmpData)
		{
			return null;
		}

		// Remove immediately (one-time use)
		this._oauthStateStore.delete(pState);

		// Check TTL
		if ((Date.now() - tmpData.CreatedAt) > this.oauthStateTTL)
		{
			return null;
		}

		return tmpData;
	}

	/**
	 * Clean up expired OAuth state entries.
	 */
	_cleanupOAuthState()
	{
		let tmpNow = Date.now();

		for (let [tmpKey, tmpValue] of this._oauthStateStore)
		{
			if ((tmpNow - tmpValue.CreatedAt) > this.oauthStateTTL)
			{
				this._oauthStateStore.delete(tmpKey);
			}
		}
	}

	/**
	 * Start periodic cleanup of expired OAuth state entries.
	 */
	_startOAuthStateCleanup()
	{
		if (this._oauthStateCleanupInterval)
		{
			return;
		}
		// Clean up every 60 seconds
		this._oauthStateCleanupInterval = setInterval(() => this._cleanupOAuthState(), 60000);
		// Allow the process to exit even if the interval is still running
		if (this._oauthStateCleanupInterval.unref)
		{
			this._oauthStateCleanupInterval.unref();
		}
	}

	/**
	 * Perform a redirect response, with fallback for IPC testing.
	 *
	 * @param {object} pResponse - The HTTP response object
	 * @param {string} pURL - The URL to redirect to
	 * @param {Function} fNext - The next middleware function
	 */
	_doRedirect(pResponse, pURL, fNext)
	{
		if (typeof pResponse.redirect === 'function')
		{
			// Restify: res.redirect(statusCode, url, next)
			pResponse.redirect(302, pURL, fNext);
		}
		else
		{
			// IPC or other service servers without redirect support
			if (typeof pResponse.setHeader === 'function')
			{
				pResponse.setHeader('Location', pURL);
			}
			else if (typeof pResponse.header === 'function')
			{
				pResponse.header('Location', pURL);
			}
			pResponse.send({ RedirectURL: pURL });
			return fNext();
		}
	}

	/**
	 * Register OAuth routes on the Orator service server.
	 * Called from connectRoutes() when OAuth providers are configured.
	 *
	 * @returns {boolean} True if routes were registered
	 */
	connectOAuthRoutes()
	{
		if (!this.fable.Orator)
		{
			this.log.error('OratorAuthentication: Orator must be initialized before connecting OAuth routes.');
			return false;
		}

		let tmpProviderNames = Object.keys(this.oauthProviders);
		if (tmpProviderNames.length === 0)
		{
			return false;
		}

		let tmpServiceServer = this.fable.Orator.serviceServer;
		let tmpPrefix = this.routePrefix;

		if (tmpPrefix.charAt(tmpPrefix.length - 1) !== '/')
		{
			tmpPrefix += '/';
		}

		this._startOAuthStateCleanup();

		// --- GET {prefix}OAuth/Providers ---
		tmpServiceServer.get(`${tmpPrefix}OAuth/Providers`,
			(pRequest, pResponse, fNext) =>
			{
				let tmpProviders = [];
				let tmpNames = Object.keys(this.oauthProviders);

				for (let i = 0; i < tmpNames.length; i++)
				{
					let tmpConfig = this.oauthProviders[tmpNames[i]];
					tmpProviders.push(
					{
						Name: tmpNames[i],
						Type: tmpConfig.Type || 'openid-connect',
						BeginURL: `${tmpPrefix}OAuth/Begin/${tmpNames[i]}`
					});
				}

				pResponse.send({ Providers: tmpProviders });
				return fNext();
			});

		// --- GET {prefix}OAuth/Begin/:provider ---
		tmpServiceServer.get(`${tmpPrefix}OAuth/Begin/:provider`,
			(pRequest, pResponse, fNext) =>
			{
				let tmpProviderName = pRequest.params.provider;
				this._handleOAuthBegin(tmpProviderName, pRequest, pResponse, fNext);
			});

		// --- GET {prefix}OAuth/Callback/:provider ---
		tmpServiceServer.get(`${tmpPrefix}OAuth/Callback/:provider`,
			(pRequest, pResponse, fNext) =>
			{
				let tmpProviderName = pRequest.params.provider;
				this._handleOAuthCallback(tmpProviderName, pRequest, pResponse, fNext);
			});

		this.log.info(`OratorAuthentication: OAuth routes registered for providers: ${tmpProviderNames.join(', ')}`);

		return true;
	}

	/**
	 * Handle the OAuth Begin flow: generate state, nonce, PKCE, redirect to provider.
	 *
	 * @param {string} pProviderName - The provider name
	 * @param {object} pRequest - The HTTP request object
	 * @param {object} pResponse - The HTTP response object
	 * @param {Function} fNext - The next middleware function
	 */
	_handleOAuthBegin(pProviderName, pRequest, pResponse, fNext)
	{
		let tmpConfig = this.oauthProviders[pProviderName];

		if (!tmpConfig)
		{
			pResponse.send({ Error: 'Unknown OAuth provider.' });
			return fNext();
		}

		// Generate state, nonce, and PKCE code verifier
		let tmpState = this.fable.getUUID();
		let tmpNonce = this.fable.getUUID();
		let tmpCodeVerifier;

		try
		{
			tmpCodeVerifier = libCrypto.randomBytes(32).toString('base64url');
		}
		catch (pError)
		{
			// Fallback to UUID-based verifier
			tmpCodeVerifier = this.fable.getUUID() + this.fable.getUUID();
		}

		// Store state for callback validation
		this._storeOAuthState(tmpState,
		{
			CodeVerifier: tmpCodeVerifier,
			Nonce: tmpNonce,
			Provider: pProviderName
		});

		// Get or initialize the provider, then build the authorization URL
		this._getOAuthProvider(pProviderName)
			.then(
				(pProvider) =>
				{
					if (!pProvider)
					{
						pResponse.send({ Error: 'OAuth provider could not be initialized. Check server logs.' });
						return fNext();
					}

					return pProvider.buildAuthorizationURL(tmpState, tmpNonce, tmpCodeVerifier);
				})
			.then(
				(pAuthorizationURL) =>
				{
					if (pAuthorizationURL)
					{
						this.log.info(`OratorAuthentication: Redirecting to [${pProviderName}] authorization URL.`);
						return this._doRedirect(pResponse, pAuthorizationURL, fNext);
					}
				})
			.catch(
				(pError) =>
				{
					this.log.error(`OratorAuthentication: OAuth Begin error for [${pProviderName}]: ${pError.message}`);
					pResponse.send({ Error: 'OAuth initialization failed.' });
					return fNext();
				});
	}

	/**
	 * Handle the OAuth Callback flow: validate state, exchange code, create session.
	 *
	 * @param {string} pProviderName - The provider name
	 * @param {object} pRequest - The HTTP request object
	 * @param {object} pResponse - The HTTP response object
	 * @param {Function} fNext - The next middleware function
	 */
	_handleOAuthCallback(pProviderName, pRequest, pResponse, fNext)
	{
		// Extract state and error from query parameters
		// Restify uses pRequest.query, IPC uses pRequest.searchParams
		let tmpQueryParams = pRequest.query || pRequest.searchParams || {};
		let tmpState = tmpQueryParams.state;
		let tmpError = tmpQueryParams.error;

		// Check for error from the provider
		if (tmpError)
		{
			this.log.warn(`OratorAuthentication: OAuth provider [${pProviderName}] returned error: ${tmpError}`);
			pResponse.send({ LoggedIn: false, Error: 'Authentication was denied by the provider.' });
			return fNext();
		}

		if (!tmpState)
		{
			pResponse.send({ LoggedIn: false, Error: 'Missing state parameter.' });
			return fNext();
		}

		// Retrieve and validate the stored state
		let tmpStoredState = this._consumeOAuthState(tmpState);

		if (!tmpStoredState)
		{
			pResponse.send({ LoggedIn: false, Error: 'Invalid or expired state. Please try again.' });
			return fNext();
		}

		if (tmpStoredState.Provider !== pProviderName)
		{
			pResponse.send({ LoggedIn: false, Error: 'Provider mismatch.' });
			return fNext();
		}

		// Reconstruct the full callback URL for the provider library
		let tmpCallbackURL;
		if (pRequest.isSecure && typeof pRequest.isSecure === 'function')
		{
			let tmpProtocol = pRequest.isSecure() ? 'https' : 'http';
			let tmpHost = pRequest.headers.host || 'localhost';
			tmpCallbackURL = `${tmpProtocol}://${tmpHost}${pRequest.url}`;
		}
		else
		{
			// For IPC testing, use the configured CallbackURL base
			let tmpConfig = this.oauthProviders[pProviderName];
			if (tmpConfig && tmpConfig.CallbackURL)
			{
				let tmpBaseURL = new URL(tmpConfig.CallbackURL);
				tmpCallbackURL = `${tmpBaseURL.origin}${pRequest.url}`;
			}
			else
			{
				tmpCallbackURL = `http://localhost${pRequest.url}`;
			}
		}

		this._getOAuthProvider(pProviderName)
			.then(
				(pProvider) =>
				{
					if (!pProvider)
					{
						pResponse.send({ LoggedIn: false, Error: 'OAuth provider unavailable.' });
						return fNext();
					}

					return pProvider.handleCallback(
						tmpCallbackURL,
						tmpState,
						tmpStoredState.Nonce,
						tmpStoredState.CodeVerifier
					);
				})
			.then(
				(pResult) =>
				{
					if (!pResult)
					{
						return; // Already responded via error handler above
					}

					// Map claims to user record via pluggable mapper
					this._oauthUserMapper(pProviderName, pResult.Claims, pResult.Tokens,
						(pMapperError, pUserRecord) =>
						{
							if (pMapperError || !pUserRecord)
							{
								this.log.warn(`OratorAuthentication: OAuth user mapping failed for [${pProviderName}]: ${pMapperError ? pMapperError.message : 'null user record'}`);
								pResponse.send({ LoggedIn: false, Error: 'User mapping failed.' });
								return fNext();
							}

							// Create session using existing infrastructure
							let tmpSession = this._createSession(pUserRecord);

							// Store OAuth tokens on the session for downstream use
							tmpSession.OAuthTokens =
							{
								AccessToken: pResult.Tokens.AccessToken,
								RefreshToken: pResult.Tokens.RefreshToken,
								ExpiresAt: pResult.Tokens.ExpiresAt,
								Provider: pProviderName
							};

							// Set the session cookie
							this._setSessionCookie(pResponse, tmpSession.SessionID);

							this.log.info(`OratorAuthentication: OAuth user [${pUserRecord.LoginID}] authenticated via [${pProviderName}], session [${tmpSession.SessionID}].`);

							// Redirect to post-login URL
							return this._doRedirect(pResponse, this.oauthPostLoginRedirectURL, fNext);
						});
				})
			.catch(
				(pError) =>
				{
					this.log.error(`OratorAuthentication: OAuth Callback error for [${pProviderName}]: ${pError.message}`);
					pResponse.send({ LoggedIn: false, Error: 'Authentication failed.' });
					return fNext();
				});
	}
}

module.exports = OratorAuthentication;
