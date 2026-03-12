/**
 * Orator Authentication — OpenID Connect Provider
 *
 * Wraps openid-client v6 (ESM-only) for generic OIDC provider support.
 * Uses dynamic import() since the Retold ecosystem is CommonJS.
 *
 * Supports any standard OIDC provider: Google, Okta, Auth0, Azure AD, Keycloak, etc.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libCrypto = require('crypto');

class OAuthProviderOIDC
{
	constructor(pFable, pConfig)
	{
		this.fable = pFable;
		this.log = pFable.log;
		this.config = pConfig;

		this._initialized = false;
		this._openidClient = null;    // Module reference (loaded via dynamic import)
		this._clientConfig = null;    // Client configuration from discovery
	}

	/**
	 * Initialize the provider by discovering the OIDC issuer metadata.
	 * Must be called before buildAuthorizationURL or handleCallback.
	 *
	 * @returns {Promise<void>}
	 */
	async initialize()
	{
		if (!this.config.IssuerURL)
		{
			throw new Error('OAuthProviderOIDC: IssuerURL is required.');
		}
		if (!this.config.ClientID)
		{
			throw new Error('OAuthProviderOIDC: ClientID is required.');
		}

		// Dynamic import of ESM-only openid-client v6
		this._openidClient = await import('openid-client');

		// openid-client v6: discovery(issuerUrl, clientId, clientSecret?, clientAuth?, options?)
		this._clientConfig = await this._openidClient.discovery(
			new URL(this.config.IssuerURL),
			this.config.ClientID,
			this.config.ClientSecret
		);

		this._initialized = true;
		this.log.info(`OAuthProviderOIDC: Initialized for issuer [${this.config.IssuerURL}].`);
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
			throw new Error('OAuthProviderOIDC: Not initialized. Call initialize() first.');
		}

		// Calculate PKCE code challenge from the verifier
		let tmpCodeChallenge = await this._openidClient.calculatePKCECodeChallenge(pCodeVerifier);

		let tmpParameters =
		{
			redirect_uri: this.config.CallbackURL,
			scope: (this.config.Scopes || ['openid', 'profile', 'email']).join(' '),
			state: pState,
			nonce: pNonce,
			code_challenge: tmpCodeChallenge,
			code_challenge_method: 'S256'
		};

		let tmpURL = this._openidClient.buildAuthorizationUrl(this._clientConfig, tmpParameters);
		return tmpURL.href;
	}

	/**
	 * Handle the callback from the OIDC provider after user authentication.
	 * Exchanges the authorization code for tokens and extracts user claims.
	 *
	 * @param {string} pCallbackURL - The full callback URL including query params
	 * @param {string} pState - The expected state parameter
	 * @param {string} pNonce - The expected nonce
	 * @param {string} pCodeVerifier - The PKCE code verifier
	 * @returns {Promise<object>} { Claims, Tokens }
	 */
	async handleCallback(pCallbackURL, pState, pNonce, pCodeVerifier)
	{
		if (!this._initialized)
		{
			throw new Error('OAuthProviderOIDC: Not initialized. Call initialize() first.');
		}

		let tmpCurrentURL = new URL(pCallbackURL);

		// openid-client v6: authorizationCodeGrant(config, currentUrl, checks)
		let tmpTokenSet = await this._openidClient.authorizationCodeGrant(
			this._clientConfig,
			tmpCurrentURL,
			{
				pkceCodeVerifier: pCodeVerifier,
				expectedState: pState,
				expectedNonce: pNonce
			}
		);

		// Extract claims from the ID token
		let tmpClaims = tmpTokenSet.claims();

		return (
		{
			Claims: tmpClaims,
			Tokens:
			{
				AccessToken: tmpTokenSet.access_token,
				RefreshToken: tmpTokenSet.refresh_token || null,
				IDToken: tmpTokenSet.id_token || null,
				ExpiresAt: tmpTokenSet.expires_at ? (tmpTokenSet.expires_at * 1000) : null
			}
		});
	}
}

module.exports = OAuthProviderOIDC;
