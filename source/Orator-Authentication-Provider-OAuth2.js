/**
 * Orator Authentication — Generic OAuth 2.0 Provider
 *
 * Handles plain OAuth 2.0 servers that do NOT expose OIDC discovery — most
 * notably GitHub, but the same configuration shape works for any vendor that
 * implements the RFC 6749 authorization code grant plus a userinfo-style
 * HTTP endpoint (GitLab, Bitbucket, Discord, Reddit, …).
 *
 * Unlike the OIDC provider, there is no discovery document and no ID token.
 * Authorization URL, token URL, and userinfo URL are supplied explicitly in
 * config; user identity comes back as plain JSON from the userinfo endpoint
 * and is mapped into the same { sub, email, name, preferred_username,
 * given_name, family_name } "claims" shape the existing user mapper accepts.
 *
 * No new dependencies — uses the global `fetch` shipped with Node 18+.
 *
 * @author Steven Velozo <steven@velozo.com>
 * @license MIT
 */

const libCrypto = require('crypto');

class OAuthProviderOAuth2
{
	constructor(pFable, pConfig)
	{
		this.fable = pFable;
		this.log = pFable.log;
		this.config = pConfig;

		this._initialized = false;
	}

	/**
	 * Validate the required configuration. There is no remote discovery step,
	 * so this is a synchronous check wrapped as a promise to satisfy the
	 * shared provider interface in Orator-Authentication.js.
	 *
	 * @returns {Promise<void>}
	 */
	async initialize()
	{
		let tmpRequired = ['ClientID', 'ClientSecret', 'AuthorizationURL', 'TokenURL', 'UserInfoURL', 'CallbackURL'];
		for (let i = 0; i < tmpRequired.length; i++)
		{
			if (!this.config[tmpRequired[i]])
			{
				throw new Error(`OAuthProviderOAuth2: ${tmpRequired[i]} is required.`);
			}
		}

		if (typeof fetch !== 'function')
		{
			throw new Error('OAuthProviderOAuth2: requires Node 18+ (global fetch).');
		}

		this._initialized = true;
		this.log.info(`OAuthProviderOAuth2: Initialized for [${this.config.AuthorizationURL}].`);
	}

	/**
	 * Build the authorization URL that the user should be redirected to.
	 *
	 * PKCE is optional for plain OAuth 2.0; GitHub for example does not yet
	 * require it (as of mid-2026). We still include the challenge by default
	 * — providers that ignore it are fine, and providers that honor it gain
	 * the extra protection. Set config.UsePKCE = false to disable.
	 *
	 * @param {string} pState - CSRF protection state parameter
	 * @param {string} pNonce - Unused for plain OAuth2 (no ID token)
	 * @param {string} pCodeVerifier - PKCE code verifier
	 * @returns {Promise<string>} The authorization URL string
	 */
	async buildAuthorizationURL(pState, pNonce, pCodeVerifier)
	{
		if (!this._initialized)
		{
			throw new Error('OAuthProviderOAuth2: Not initialized.');
		}

		let tmpURL = new URL(this.config.AuthorizationURL);
		tmpURL.searchParams.set('client_id', this.config.ClientID);
		tmpURL.searchParams.set('redirect_uri', this.config.CallbackURL);
		tmpURL.searchParams.set('response_type', 'code');
		tmpURL.searchParams.set('state', pState);

		let tmpScopes = this.config.Scopes;
		if (Array.isArray(tmpScopes) && tmpScopes.length > 0)
		{
			let tmpSeparator = this.config.ScopeSeparator || ' ';
			tmpURL.searchParams.set('scope', tmpScopes.join(tmpSeparator));
		}

		let tmpUsePKCE = (this.config.UsePKCE === undefined) ? true : !!this.config.UsePKCE;
		if (tmpUsePKCE && pCodeVerifier)
		{
			let tmpChallenge = libCrypto
				.createHash('sha256')
				.update(pCodeVerifier)
				.digest('base64url');
			tmpURL.searchParams.set('code_challenge', tmpChallenge);
			tmpURL.searchParams.set('code_challenge_method', 'S256');
		}

		// Allow callers to inject vendor-specific extras (e.g. GitHub's `allow_signup=false`).
		if (this.config.ExtraAuthorizationParameters && typeof this.config.ExtraAuthorizationParameters === 'object')
		{
			let tmpExtraKeys = Object.keys(this.config.ExtraAuthorizationParameters);
			for (let i = 0; i < tmpExtraKeys.length; i++)
			{
				tmpURL.searchParams.set(tmpExtraKeys[i], String(this.config.ExtraAuthorizationParameters[tmpExtraKeys[i]]));
			}
		}

		return tmpURL.href;
	}

	/**
	 * Handle the OAuth provider callback: exchange the authorization code for an
	 * access token, then fetch the user profile.
	 *
	 * @param {string} pCallbackURL - The full callback URL including query params
	 * @param {string} pState - The expected state parameter (already verified upstream)
	 * @param {string} pNonce - Unused for OAuth2
	 * @param {string} pCodeVerifier - The PKCE code verifier
	 * @returns {Promise<object>} { Claims, Tokens }
	 */
	async handleCallback(pCallbackURL, pState, pNonce, pCodeVerifier)
	{
		if (!this._initialized)
		{
			throw new Error('OAuthProviderOAuth2: Not initialized.');
		}

		let tmpCallbackURL = new URL(pCallbackURL);
		let tmpCode = tmpCallbackURL.searchParams.get('code');
		if (!tmpCode)
		{
			throw new Error('OAuthProviderOAuth2: Callback URL is missing the authorization code.');
		}

		let tmpTokenSet = await this._exchangeCodeForToken(tmpCode, pCodeVerifier);
		let tmpProfile = await this._fetchUserProfile(tmpTokenSet.access_token);
		let tmpClaims = this._mapProfileToClaims(tmpProfile, tmpTokenSet);

		return (
		{
			Claims: tmpClaims,
			Tokens:
			{
				AccessToken: tmpTokenSet.access_token,
				RefreshToken: tmpTokenSet.refresh_token || null,
				IDToken: null,
				ExpiresAt: tmpTokenSet.expires_in ? (Date.now() + (tmpTokenSet.expires_in * 1000)) : null
			}
		});
	}

	/**
	 * POST the authorization code back to the provider's token endpoint.
	 */
	async _exchangeCodeForToken(pCode, pCodeVerifier)
	{
		let tmpForm = new URLSearchParams();
		tmpForm.set('grant_type', 'authorization_code');
		tmpForm.set('code', pCode);
		tmpForm.set('redirect_uri', this.config.CallbackURL);
		tmpForm.set('client_id', this.config.ClientID);
		tmpForm.set('client_secret', this.config.ClientSecret);

		let tmpUsePKCE = (this.config.UsePKCE === undefined) ? true : !!this.config.UsePKCE;
		if (tmpUsePKCE && pCodeVerifier)
		{
			tmpForm.set('code_verifier', pCodeVerifier);
		}

		let tmpResponse = await fetch(this.config.TokenURL,
			{
				method: 'POST',
				headers:
				{
					'Accept': 'application/json',
					'Content-Type': 'application/x-www-form-urlencoded',
					'User-Agent': this.config.UserAgent || 'orator-authentication'
				},
				body: tmpForm.toString()
			});

		if (!tmpResponse.ok)
		{
			let tmpText = await tmpResponse.text();
			throw new Error(`OAuthProviderOAuth2: Token exchange failed (${tmpResponse.status}): ${tmpText}`);
		}

		// Most providers return JSON; GitHub historically defaulted to form-encoded
		// but honors `Accept: application/json` (which we send above), so JSON is safe.
		let tmpBody = await tmpResponse.json();
		if (tmpBody.error)
		{
			throw new Error(`OAuthProviderOAuth2: Token endpoint error [${tmpBody.error}]: ${tmpBody.error_description || ''}`);
		}
		if (!tmpBody.access_token)
		{
			throw new Error('OAuthProviderOAuth2: Token endpoint did not return an access_token.');
		}
		return tmpBody;
	}

	/**
	 * Fetch the user profile from the provider's userinfo endpoint, plus the
	 * optional second-call email endpoint (GitHub returns no email in /user
	 * when the user has marked their primary email private — the address must
	 * come from /user/emails).
	 */
	async _fetchUserProfile(pAccessToken)
	{
		let tmpHeaders =
		{
			'Authorization': `${this.config.TokenType || 'Bearer'} ${pAccessToken}`,
			'Accept': 'application/json',
			'User-Agent': this.config.UserAgent || 'orator-authentication'
		};

		let tmpResponse = await fetch(this.config.UserInfoURL, { headers: tmpHeaders });
		if (!tmpResponse.ok)
		{
			let tmpText = await tmpResponse.text();
			throw new Error(`OAuthProviderOAuth2: UserInfo fetch failed (${tmpResponse.status}): ${tmpText}`);
		}
		let tmpProfile = await tmpResponse.json();

		if (this.config.EmailURL && !tmpProfile.email)
		{
			try
			{
				let tmpEmailResponse = await fetch(this.config.EmailURL, { headers: tmpHeaders });
				if (tmpEmailResponse.ok)
				{
					let tmpEmails = await tmpEmailResponse.json();
					if (Array.isArray(tmpEmails) && tmpEmails.length > 0)
					{
						// Prefer the primary verified address; fall back to first verified.
						let tmpPrimary = tmpEmails.find((e) => e.primary && e.verified);
						let tmpVerified = tmpEmails.find((e) => e.verified);
						let tmpPicked = tmpPrimary || tmpVerified || tmpEmails[0];
						if (tmpPicked && tmpPicked.email)
						{
							tmpProfile.email = tmpPicked.email;
						}
					}
				}
			}
			catch (pErr)
			{
				this.log.warn('OAuthProviderOAuth2: Email endpoint fetch failed: ' + pErr.message);
			}
		}

		return tmpProfile;
	}

	/**
	 * Translate the provider's idiosyncratic profile shape into the OIDC-style
	 * claims object the upstream user mapper expects. Field names are taken
	 * from config.ProfileFieldMap (so each provider configures its own); the
	 * defaults match GitHub.
	 */
	_mapProfileToClaims(pProfile, pTokenSet)
	{
		let tmpMap = this.config.ProfileFieldMap ||
			{
				sub: 'id',
				preferred_username: 'login',
				name: 'name',
				email: 'email',
				picture: 'avatar_url'
			};

		let tmpClaims = {};
		let tmpKeys = Object.keys(tmpMap);
		for (let i = 0; i < tmpKeys.length; i++)
		{
			let tmpTarget = tmpKeys[i];
			let tmpSource = tmpMap[tmpTarget];
			if (tmpSource && Object.prototype.hasOwnProperty.call(pProfile, tmpSource))
			{
				tmpClaims[tmpTarget] = pProfile[tmpSource];
			}
		}

		// Coerce sub to a string so downstream mappers don't have to guard for
		// numeric IDs (GitHub returns a number; spec says string).
		if (tmpClaims.sub !== undefined && tmpClaims.sub !== null)
		{
			tmpClaims.sub = String(tmpClaims.sub);
		}

		// Split a single "name" into given/family for mappers that expect them.
		if (tmpClaims.name && !tmpClaims.given_name)
		{
			let tmpParts = String(tmpClaims.name).trim().split(/\s+/);
			tmpClaims.given_name = tmpParts[0] || '';
			tmpClaims.family_name = tmpParts.length > 1 ? tmpParts.slice(1).join(' ') : '';
		}

		// Surface the raw profile so user mappers can reach provider-specific fields.
		tmpClaims._RawProfile = pProfile;

		return tmpClaims;
	}
}

module.exports = OAuthProviderOAuth2;
