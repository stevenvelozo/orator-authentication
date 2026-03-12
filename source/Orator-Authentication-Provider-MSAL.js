/**
 * Orator Authentication — MSAL Provider
 *
 * Wraps @azure/msal-node for Microsoft identity platform (Azure AD, M365, Exchange).
 * CJS-compatible; uses regular require().
 *
 * Use this provider when customers need advanced Microsoft features such as
 * Exchange Online access, Microsoft Graph API tokens, or Azure AD B2C.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libCrypto = require('crypto');

class OAuthProviderMSAL
{
	constructor(pFable, pConfig)
	{
		this.fable = pFable;
		this.log = pFable.log;
		this.config = pConfig;

		this._initialized = false;
		this._msalClient = null;
	}

	/**
	 * Initialize the MSAL ConfidentialClientApplication.
	 *
	 * @returns {Promise<void>}
	 */
	initialize()
	{
		if (!this.config.ClientID)
		{
			throw new Error('OAuthProviderMSAL: ClientID is required.');
		}
		if (!this.config.ClientSecret)
		{
			throw new Error('OAuthProviderMSAL: ClientSecret is required.');
		}

		let libMSAL = require('@azure/msal-node');

		let tmpAuthority = this.config.Authority
			|| `https://login.microsoftonline.com/${this.config.TenantID || 'common'}`;

		let tmpMSALConfig =
		{
			auth:
			{
				clientId: this.config.ClientID,
				authority: tmpAuthority,
				clientSecret: this.config.ClientSecret
			},
			system:
			{
				loggerOptions:
				{
					logLevel: 0 // Error only
				}
			}
		};

		this._msalClient = new libMSAL.ConfidentialClientApplication(tmpMSALConfig);
		this._initialized = true;
		this.log.info(`OAuthProviderMSAL: Initialized for authority [${tmpAuthority}].`);

		return Promise.resolve();
	}

	/**
	 * Build the authorization URL that the user should be redirected to.
	 *
	 * @param {string} pState - CSRF protection state parameter
	 * @param {string} pNonce - OpenID Connect nonce
	 * @param {string} pCodeVerifier - PKCE code verifier
	 * @returns {Promise<string>} The authorization URL string
	 */
	async buildAuthorizationURL(pState, pNonce, pCodeVerifier)
	{
		if (!this._initialized)
		{
			throw new Error('OAuthProviderMSAL: Not initialized. Call initialize() first.');
		}

		// Calculate PKCE code challenge
		let tmpCodeChallenge = libCrypto.createHash('sha256').update(pCodeVerifier).digest('base64url');

		let tmpAuthCodeUrlParameters =
		{
			scopes: this.config.Scopes || ['openid', 'profile', 'email'],
			redirectUri: this.config.CallbackURL,
			state: pState,
			nonce: pNonce,
			codeChallenge: tmpCodeChallenge,
			codeChallengeMethod: 'S256'
		};

		let tmpURL = await this._msalClient.getAuthCodeUrl(tmpAuthCodeUrlParameters);
		return tmpURL;
	}

	/**
	 * Handle the callback from Microsoft after user authentication.
	 * Exchanges the authorization code for tokens and normalizes the response.
	 *
	 * @param {string} pCallbackURL - The full callback URL including query params
	 * @param {string} pState - The expected state parameter (validated by caller)
	 * @param {string} pNonce - The expected nonce
	 * @param {string} pCodeVerifier - The PKCE code verifier
	 * @returns {Promise<object>} { Claims, Tokens }
	 */
	async handleCallback(pCallbackURL, pState, pNonce, pCodeVerifier)
	{
		if (!this._initialized)
		{
			throw new Error('OAuthProviderMSAL: Not initialized. Call initialize() first.');
		}

		// Extract authorization code from the callback URL
		let tmpURL = new URL(pCallbackURL);
		let tmpCode = tmpURL.searchParams.get('code');

		if (!tmpCode)
		{
			throw new Error('OAuthProviderMSAL: No authorization code in callback URL.');
		}

		let tmpTokenRequest =
		{
			code: tmpCode,
			scopes: this.config.Scopes || ['openid', 'profile', 'email'],
			redirectUri: this.config.CallbackURL,
			codeVerifier: pCodeVerifier
		};

		let tmpResponse = await this._msalClient.acquireTokenByCode(tmpTokenRequest);

		// Normalize MSAL response to match OIDC provider output format
		let tmpClaims =
		{
			sub: tmpResponse.uniqueId || (tmpResponse.account ? tmpResponse.account.homeAccountId : ''),
			name: tmpResponse.account ? tmpResponse.account.name : '',
			email: tmpResponse.account ? tmpResponse.account.username : '',
			preferred_username: tmpResponse.account ? tmpResponse.account.username : '',
			oid: tmpResponse.uniqueId,
			tid: tmpResponse.tenantId
		};

		// Merge any ID token claims if available
		if (tmpResponse.idTokenClaims)
		{
			if (tmpResponse.idTokenClaims.given_name)
			{
				tmpClaims.given_name = tmpResponse.idTokenClaims.given_name;
			}
			if (tmpResponse.idTokenClaims.family_name)
			{
				tmpClaims.family_name = tmpResponse.idTokenClaims.family_name;
			}
		}

		return (
		{
			Claims: tmpClaims,
			Tokens:
			{
				AccessToken: tmpResponse.accessToken,
				RefreshToken: null, // MSAL manages refresh tokens internally
				IDToken: tmpResponse.idToken || null,
				ExpiresAt: tmpResponse.expiresOn ? tmpResponse.expiresOn.getTime() : null
			}
		});
	}
}

module.exports = OAuthProviderMSAL;
