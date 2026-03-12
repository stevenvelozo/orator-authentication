/**
* Unit tests for Orator Authentication — OAuth/OIDC Support
*
* Tests the OAuth state management, user mapping, route registration,
* and full flow using mock providers (no real OIDC interaction needed).
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

const Chai = require("chai");
const Expect = Chai.expect;

const libFable = require('fable');
const libOrator = require('orator');
const libOratorAuthentication = require('../source/Orator-Authentication.js');

const defaultFableSettings = (
	{
		Product: 'OratorAuthentication-OAuthTests',
		ProductVersion: '0.0.0',
		APIServerPort: 0
	});

/**
 * Helper that creates a Fable + Orator + OratorAuthentication harness,
 * starts the service, then calls back with the harness object.
 */
function createStartedHarness(pFableSettings, pAuthOptions, fCallback)
{
	let tmpFableSettings = Object.assign({}, defaultFableSettings, pFableSettings || {});
	let tmpFable = new libFable(tmpFableSettings);

	tmpFable.serviceManager.addServiceType('Orator', libOrator);
	tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

	let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
	let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', pAuthOptions || {});

	let tmpResult = (
		{
			fable: tmpFable,
			orator: tmpOrator,
			auth: tmpAuth
		});

	tmpOrator.startService(
		() =>
		{
			return fCallback(tmpResult);
		});
}

/**
 * Parse the IPC invoke response.
 */
function parseResponse(pResponseData)
{
	if (typeof pResponseData === 'string')
	{
		try { return JSON.parse(pResponseData); }
		catch (e) { return pResponseData; }
	}
	return pResponseData;
}

/**
 * Create a mock OAuth provider that simulates the OIDC provider interface
 * without needing real network access.
 */
function createMockProvider(pOptions)
{
	let tmpOptions = pOptions || {};

	return (
	{
		_initialized: true,

		initialize: function()
		{
			return Promise.resolve();
		},

		buildAuthorizationURL: function(pState, pNonce, pCodeVerifier)
		{
			if (tmpOptions.buildError)
			{
				return Promise.reject(new Error(tmpOptions.buildError));
			}
			let tmpURL = `https://mock-provider.example.com/authorize?state=${pState}&nonce=${pNonce}&client_id=mock-client`;
			return Promise.resolve(tmpURL);
		},

		handleCallback: function(pCallbackURL, pState, pNonce, pCodeVerifier)
		{
			if (tmpOptions.callbackError)
			{
				return Promise.reject(new Error(tmpOptions.callbackError));
			}
			return Promise.resolve(
			{
				Claims:
				{
					sub: 'mock-user-123',
					name: tmpOptions.userName || 'Mock User',
					email: tmpOptions.email || 'mock@example.com',
					preferred_username: tmpOptions.preferredUsername || 'mockuser',
					given_name: tmpOptions.givenName || 'Mock',
					family_name: tmpOptions.familyName || 'User'
				},
				Tokens:
				{
					AccessToken: 'mock-access-token-abc123',
					RefreshToken: tmpOptions.refreshToken || null,
					IDToken: 'mock-id-token-xyz789',
					ExpiresAt: Date.now() + 3600000
				}
			});
		}
	});
}


suite
(
	'Orator Authentication — OAuth',
	() =>
	{
		suite
		(
			'OAuth Configuration',
			() =>
			{
				test
				(
					'should initialize with empty OAuth providers by default',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth.oauthProviders).to.be.an('object');
						Expect(Object.keys(tmpAuth.oauthProviders)).to.have.length(0);
						Expect(tmpAuth.oauthProviderInstances).to.be.an('object');
						Expect(tmpAuth._oauthStateStore).to.be.an.instanceOf(Map);
						Expect(tmpAuth.oauthStateTTL).to.equal(300000);
						Expect(tmpAuth.oauthPostLoginRedirectURL).to.equal('/');

						return fDone();
					}
				);

				test
				(
					'should accept OAuthProviders in options',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
							{
								OAuthProviders:
								{
									'google':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://accounts.google.com',
										ClientID: 'test-client-id',
										ClientSecret: 'test-client-secret',
										CallbackURL: 'http://localhost:9999/callback',
										Scopes: ['openid', 'profile']
									},
									'microsoft':
									{
										Type: 'msal',
										ClientID: 'ms-client-id',
										ClientSecret: 'ms-secret',
										Authority: 'https://login.microsoftonline.com/common',
										CallbackURL: 'http://localhost:9999/ms-callback'
									}
								}
							});

						Expect(Object.keys(tmpAuth.oauthProviders)).to.have.length(2);
						Expect(tmpAuth.oauthProviders).to.have.property('google');
						Expect(tmpAuth.oauthProviders).to.have.property('microsoft');
						Expect(tmpAuth.oauthProviders.google.Type).to.equal('openid-connect');
						Expect(tmpAuth.oauthProviders.microsoft.Type).to.equal('msal');

						return fDone();
					}
				);

				test
				(
					'should accept OAuthStateTTL and OAuthPostLoginRedirectURL in options',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
							{
								OAuthStateTTL: 60000,
								OAuthPostLoginRedirectURL: '/dashboard'
							});

						Expect(tmpAuth.oauthStateTTL).to.equal(60000);
						Expect(tmpAuth.oauthPostLoginRedirectURL).to.equal('/dashboard');

						return fDone();
					}
				);

				test
				(
					'addOAuthProvider should add a provider configuration',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpResult = tmpAuth.addOAuthProvider('okta',
							{
								Type: 'openid-connect',
								IssuerURL: 'https://dev-12345.okta.com',
								ClientID: 'okta-client',
								ClientSecret: 'okta-secret',
								CallbackURL: 'http://localhost:9999/okta-callback'
							});

						Expect(tmpResult).to.equal(true);
						Expect(tmpAuth.oauthProviders).to.have.property('okta');
						Expect(tmpAuth.oauthProviders.okta.ClientID).to.equal('okta-client');

						return fDone();
					}
				);

				test
				(
					'addOAuthProvider should reject invalid arguments',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth.addOAuthProvider('', {})).to.equal(false);
						Expect(tmpAuth.addOAuthProvider(null, {})).to.equal(false);
						Expect(tmpAuth.addOAuthProvider('name', null)).to.equal(false);
						Expect(tmpAuth.addOAuthProvider('name', 'not-an-object')).to.equal(false);

						return fDone();
					}
				);
			}
		);

		suite
		(
			'OAuth User Mapper',
			() =>
			{
				test
				(
					'setOAuthUserMapper should replace the default mapper',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpCustomCalled = false;
						let tmpResult = tmpAuth.setOAuthUserMapper(
							(pProviderName, pClaims, pTokens, fCallback) =>
							{
								tmpCustomCalled = true;
								return fCallback(null, { LoginID: pClaims.email, IDUser: 99 });
							});

						Expect(tmpResult).to.equal(true);

						tmpAuth._oauthUserMapper('test', { email: 'test@example.com' }, {},
							(pError, pUserRecord) =>
							{
								Expect(tmpCustomCalled).to.equal(true);
								Expect(pUserRecord.LoginID).to.equal('test@example.com');
								Expect(pUserRecord.IDUser).to.equal(99);
								return fDone();
							});
					}
				);

				test
				(
					'setOAuthUserMapper should reject non-function arguments',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth.setOAuthUserMapper('not a function')).to.equal(false);
						Expect(tmpAuth.setOAuthUserMapper(null)).to.equal(false);

						return fDone();
					}
				);

				test
				(
					'the default mapper should extract standard OIDC claims',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpClaims =
						{
							sub: 'user-123',
							name: 'Jane Doe',
							email: 'jane@example.com',
							preferred_username: 'jdoe',
							given_name: 'Jane',
							family_name: 'Doe'
						};

						tmpAuth._oauthUserMapper('test-provider', tmpClaims, {},
							(pError, pUserRecord) =>
							{
								Expect(pError).to.be.null;
								Expect(pUserRecord).to.be.an('object');
								Expect(pUserRecord.LoginID).to.equal('jdoe'); // preferred_username first
								Expect(pUserRecord.IDUser).to.equal(0);
								Expect(pUserRecord.NameFirst).to.equal('Jane');
								Expect(pUserRecord.NameLast).to.equal('Doe');
								Expect(pUserRecord.FullName).to.equal('Jane Doe');
								Expect(pUserRecord.Email).to.equal('jane@example.com');
								return fDone();
							});
					}
				);

				test
				(
					'the default mapper should handle missing optional claims',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						// Only sub claim available
						let tmpClaims = { sub: 'minimal-user' };

						tmpAuth._oauthUserMapper('test-provider', tmpClaims, {},
							(pError, pUserRecord) =>
							{
								Expect(pError).to.be.null;
								Expect(pUserRecord.LoginID).to.equal('minimal-user'); // falls back to sub
								Expect(pUserRecord.NameFirst).to.equal('');
								Expect(pUserRecord.NameLast).to.equal('');
								Expect(pUserRecord.FullName).to.equal('');
								Expect(pUserRecord.Email).to.equal('');
								return fDone();
							});
					}
				);
			}
		);

		suite
		(
			'OAuth State Store',
			() =>
			{
				test
				(
					'_storeOAuthState and _consumeOAuthState should round-trip',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						tmpAuth._storeOAuthState('test-state-123',
							{
								CodeVerifier: 'test-verifier',
								Nonce: 'test-nonce',
								Provider: 'google'
							});

						let tmpResult = tmpAuth._consumeOAuthState('test-state-123');
						Expect(tmpResult).to.be.an('object');
						Expect(tmpResult.CodeVerifier).to.equal('test-verifier');
						Expect(tmpResult.Nonce).to.equal('test-nonce');
						Expect(tmpResult.Provider).to.equal('google');
						Expect(tmpResult.CreatedAt).to.be.a('number');

						return fDone();
					}
				);

				test
				(
					'_consumeOAuthState should return null for unknown state',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpResult = tmpAuth._consumeOAuthState('nonexistent-state');
						Expect(tmpResult).to.be.null;

						return fDone();
					}
				);

				test
				(
					'_consumeOAuthState should consume state (one-time use)',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						tmpAuth._storeOAuthState('consume-test',
							{
								CodeVerifier: 'v',
								Nonce: 'n',
								Provider: 'p'
							});

						let tmpFirst = tmpAuth._consumeOAuthState('consume-test');
						Expect(tmpFirst).to.not.be.null;

						let tmpSecond = tmpAuth._consumeOAuthState('consume-test');
						Expect(tmpSecond).to.be.null;

						return fDone();
					}
				);

				test
				(
					'_consumeOAuthState should return null for expired state',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
							{
								OAuthStateTTL: 1 // 1 millisecond
							});

						tmpAuth._storeOAuthState('expired-test',
							{
								CodeVerifier: 'v',
								Nonce: 'n',
								Provider: 'p'
							});

						setTimeout(
							() =>
							{
								let tmpResult = tmpAuth._consumeOAuthState('expired-test');
								Expect(tmpResult).to.be.null;
								return fDone();
							}, 20);
					}
				);

				test
				(
					'_cleanupOAuthState should remove expired entries',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
							{
								OAuthStateTTL: 1 // 1 millisecond
							});

						tmpAuth._storeOAuthState('cleanup-1',
							{ CodeVerifier: 'v', Nonce: 'n', Provider: 'p' });
						tmpAuth._storeOAuthState('cleanup-2',
							{ CodeVerifier: 'v', Nonce: 'n', Provider: 'p' });

						Expect(tmpAuth._oauthStateStore.size).to.equal(2);

						setTimeout(
							() =>
							{
								tmpAuth._cleanupOAuthState();
								Expect(tmpAuth._oauthStateStore.size).to.equal(0);
								return fDone();
							}, 20);
					}
				);
			}
		);

		suite
		(
			'OAuth Route Registration',
			() =>
			{
				test
				(
					'connectRoutes should register OAuth routes when providers are configured',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mockprovider':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/callback'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								// Verify OAuth routes exist
								let tmpProvidersHandler = pHarness.orator.serviceServer.router.find('GET', '/1.0/OAuth/Providers');
								Expect(tmpProvidersHandler).to.be.an('object');
								Expect(tmpProvidersHandler).to.have.a.property('handler');

								let tmpBeginHandler = pHarness.orator.serviceServer.router.find('GET', '/1.0/OAuth/Begin/mockprovider');
								Expect(tmpBeginHandler).to.be.an('object');
								Expect(tmpBeginHandler).to.have.a.property('handler');

								let tmpCallbackHandler = pHarness.orator.serviceServer.router.find('GET', '/1.0/OAuth/Callback/mockprovider');
								Expect(tmpCallbackHandler).to.be.an('object');
								Expect(tmpCallbackHandler).to.have.a.property('handler');

								return fDone();
							});
					}
				);

				test
				(
					'connectRoutes should NOT register OAuth routes when no providers configured',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								let tmpProvidersHandler = pHarness.orator.serviceServer.router.find('GET', '/1.0/OAuth/Providers');
								// When no OAuth providers are configured, the route should not exist.
								// router.find() returns null or an object without handler for unknown routes.
								let tmpHasHandler = (tmpProvidersHandler && tmpProvidersHandler.handler) ? true : false;
								Expect(tmpHasHandler).to.equal(false);

								return fDone();
							});
					}
				);

				test
				(
					'OAuth/Providers should list configured providers without exposing secrets',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'google':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://accounts.google.com',
										ClientID: 'secret-client-id',
										ClientSecret: 'super-secret',
										CallbackURL: 'http://localhost/callback'
									},
									'microsoft':
									{
										Type: 'msal',
										ClientID: 'ms-secret',
										ClientSecret: 'ms-super-secret',
										Authority: 'https://login.microsoftonline.com/common',
										CallbackURL: 'http://localhost/ms-callback'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/OAuth/Providers', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.Providers).to.be.an('array');
										Expect(tmpData.Providers).to.have.length(2);

										let tmpGoogle = tmpData.Providers.find((p) => p.Name === 'google');
										Expect(tmpGoogle).to.be.an('object');
										Expect(tmpGoogle.Type).to.equal('openid-connect');
										Expect(tmpGoogle.BeginURL).to.include('OAuth/Begin/google');

										let tmpMicrosoft = tmpData.Providers.find((p) => p.Name === 'microsoft');
										Expect(tmpMicrosoft).to.be.an('object');
										Expect(tmpMicrosoft.Type).to.equal('msal');

										// Ensure no secrets are exposed
										let tmpResponseStr = JSON.stringify(tmpData);
										Expect(tmpResponseStr).to.not.include('super-secret');
										Expect(tmpResponseStr).to.not.include('secret-client-id');
										Expect(tmpResponseStr).to.not.include('ms-super-secret');

										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Begin should return error for unknown provider',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'google':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://accounts.google.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost/callback'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/OAuth/Begin/nonexistent', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.Error).to.equal('Unknown OAuth provider.');
										return fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'OAuth Flow (mocked provider)',
			() =>
			{
				test
				(
					'OAuth/Begin should store state and return redirect URL via mock provider',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/1.0/OAuth/Callback/mock'
									}
								}
							},
							(pHarness) =>
							{
								// Inject mock provider directly
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();

								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/OAuth/Begin/mock', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.RedirectURL).to.be.a('string');
										Expect(tmpData.RedirectURL).to.include('mock-provider.example.com/authorize');
										Expect(tmpData.RedirectURL).to.include('state=');
										Expect(tmpData.RedirectURL).to.include('nonce=');
										Expect(tmpData.RedirectURL).to.include('client_id=mock-client');

										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Callback should exchange code and create session via mock provider',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/1.0/OAuth/Callback/mock'
									}
								}
							},
							(pHarness) =>
							{
								// Inject mock provider
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();

								pHarness.auth.connectRoutes();

								// Pre-store a state entry
								let tmpState = 'test-state-for-callback';
								pHarness.auth._storeOAuthState(tmpState,
								{
									CodeVerifier: 'test-code-verifier',
									Nonce: 'test-nonce',
									Provider: 'mock'
								});

								// Simulate callback with state and code in query params
								pHarness.orator.invoke('GET', `/1.0/OAuth/Callback/mock?code=mock-auth-code&state=${tmpState}`, null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');

										// Should redirect to post-login URL
										Expect(tmpData.RedirectURL).to.equal('/');

										// Verify session was created
										Expect(pHarness.auth.sessionStore.size).to.be.greaterThan(0);

										// Find the session and verify it has OAuth tokens
										let tmpSessions = Array.from(pHarness.auth.sessionStore.values());
										let tmpOAuthSession = tmpSessions.find((s) => s.OAuthTokens);
										Expect(tmpOAuthSession).to.be.an('object');
										Expect(tmpOAuthSession.OAuthTokens.AccessToken).to.equal('mock-access-token-abc123');
										Expect(tmpOAuthSession.OAuthTokens.Provider).to.equal('mock');
										Expect(tmpOAuthSession.UserRecord.LoginID).to.equal('mockuser');
										Expect(tmpOAuthSession.UserRecord.FullName).to.equal('Mock User');
										Expect(tmpOAuthSession.UserRecord.Email).to.equal('mock@example.com');

										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Callback with missing state should return error',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/callback'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();
								pHarness.auth.connectRoutes();

								// Callback without state parameter
								pHarness.orator.invoke('GET', '/1.0/OAuth/Callback/mock?code=some-code', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(false);
										Expect(tmpData.Error).to.include('Missing state');
										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Callback with invalid state should return error',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/callback'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();
								pHarness.auth.connectRoutes();

								// Callback with unknown state
								pHarness.orator.invoke('GET', '/1.0/OAuth/Callback/mock?code=some-code&state=bogus-state', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(false);
										Expect(tmpData.Error).to.include('Invalid or expired state');
										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Callback with provider error should return error',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/callback'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();
								pHarness.auth.connectRoutes();

								// Callback with error from provider
								pHarness.orator.invoke('GET', '/1.0/OAuth/Callback/mock?error=access_denied&error_description=User+denied+access', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(false);
										Expect(tmpData.Error).to.include('denied by the provider');
										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Callback with provider mismatch should return error',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/callback'
									},
									'other':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://other.example.com',
										ClientID: 'test2',
										ClientSecret: 'test2',
										CallbackURL: 'http://localhost:9999/callback2'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();
								pHarness.auth.oauthProviderInstances['other'] = createMockProvider();
								pHarness.auth.connectRoutes();

								// Store state for 'mock' provider
								let tmpState = 'mismatch-state';
								pHarness.auth._storeOAuthState(tmpState,
								{
									CodeVerifier: 'v',
									Nonce: 'n',
									Provider: 'mock' // stored for 'mock'
								});

								// But callback comes in for 'other'
								pHarness.orator.invoke('GET', `/1.0/OAuth/Callback/other?code=code&state=${tmpState}`, null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(false);
										Expect(tmpData.Error).to.include('Provider mismatch');
										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Callback with mock provider error should return authentication failed',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/1.0/OAuth/Callback/mock'
									}
								}
							},
							(pHarness) =>
							{
								// Inject a mock provider that throws on callback
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider(
								{
									callbackError: 'Token exchange failed'
								});
								pHarness.auth.connectRoutes();

								let tmpState = 'error-state';
								pHarness.auth._storeOAuthState(tmpState,
								{
									CodeVerifier: 'v',
									Nonce: 'n',
									Provider: 'mock'
								});

								pHarness.orator.invoke('GET', `/1.0/OAuth/Callback/mock?code=code&state=${tmpState}`, null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(false);
										Expect(tmpData.Error).to.equal('Authentication failed.');
										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth/Callback with custom user mapper should use the custom mapper',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/1.0/OAuth/Callback/mock'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider(
								{
									email: 'custom@example.com',
									userName: 'Custom User'
								});

								// Set custom mapper
								pHarness.auth.setOAuthUserMapper(
									(pProviderName, pClaims, pTokens, fCallback) =>
									{
										return fCallback(null,
										{
											LoginID: `custom-${pClaims.email}`,
											IDUser: 42,
											FullName: `MAPPED: ${pClaims.name}`,
											Email: pClaims.email
										});
									});

								pHarness.auth.connectRoutes();

								let tmpState = 'mapper-state';
								pHarness.auth._storeOAuthState(tmpState,
								{
									CodeVerifier: 'v',
									Nonce: 'n',
									Provider: 'mock'
								});

								pHarness.orator.invoke('GET', `/1.0/OAuth/Callback/mock?code=code&state=${tmpState}`, null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.RedirectURL).to.equal('/');

										// Verify custom mapper was used
										let tmpSessions = Array.from(pHarness.auth.sessionStore.values());
										let tmpOAuthSession = tmpSessions.find((s) => s.OAuthTokens);
										Expect(tmpOAuthSession.UserRecord.LoginID).to.equal('custom-custom@example.com');
										Expect(tmpOAuthSession.UserRecord.IDUser).to.equal(42);
										Expect(tmpOAuthSession.UserRecord.FullName).to.equal('MAPPED: Custom User');

										return fDone();
									});
							});
					}
				);

				test
				(
					'OAuth session should be retrievable via CheckSession',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/1.0/OAuth/Callback/mock'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();
								pHarness.auth.connectRoutes();

								let tmpState = 'session-check-state';
								pHarness.auth._storeOAuthState(tmpState,
								{
									CodeVerifier: 'v',
									Nonce: 'n',
									Provider: 'mock'
								});

								pHarness.orator.invoke('GET', `/1.0/OAuth/Callback/mock?code=code&state=${tmpState}`, null,
									(pError, pResponseData) =>
									{
										// Find the session ID
										let tmpSessions = Array.from(pHarness.auth.sessionStore.values());
										let tmpOAuthSession = tmpSessions.find((s) => s.OAuthTokens);
										Expect(tmpOAuthSession).to.be.an('object');

										let tmpSessionID = tmpOAuthSession.SessionID;

										// Verify via getSessionForRequest (simulating CheckSession)
										let tmpSession = pHarness.auth.getSessionForRequest(
										{
											headers: { cookie: `SessionID=${tmpSessionID}` }
										});
										Expect(tmpSession).to.be.an('object');
										Expect(tmpSession.SessionID).to.equal(tmpSessionID);
										Expect(tmpSession.UserRecord.LoginID).to.equal('mockuser');
										Expect(tmpSession.UserRecord.Email).to.equal('mock@example.com');

										// Verify OAuthTokens are on the session object
										Expect(tmpSession.OAuthTokens).to.be.an('object');
										Expect(tmpSession.OAuthTokens.AccessToken).to.equal('mock-access-token-abc123');
										Expect(tmpSession.OAuthTokens.Provider).to.equal('mock');

										return fDone();
									});
							});
					}
				);

				test
				(
					'existing username/password auth should still work alongside OAuth',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								OAuthProviders:
								{
									'mock':
									{
										Type: 'openid-connect',
										IssuerURL: 'https://mock.example.com',
										ClientID: 'test',
										ClientSecret: 'test',
										CallbackURL: 'http://localhost:9999/callback'
									}
								}
							},
							(pHarness) =>
							{
								pHarness.auth.oauthProviderInstances['mock'] = createMockProvider();
								pHarness.auth.connectRoutes();

								// Test regular username/password auth still works
								pHarness.orator.invoke('GET', '/1.0/Authenticate/regularuser/pass', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(true);
										Expect(tmpData.SessionID).to.be.a('string');
										Expect(tmpData.UserRecord.LoginID).to.equal('regularuser');

										// Verify session does NOT have OAuthTokens
										let tmpSession = pHarness.auth.getSessionForRequest(
										{
											headers: { cookie: `SessionID=${tmpData.SessionID}` }
										});
										Expect(tmpSession).to.be.an('object');
										Expect(tmpSession.OAuthTokens).to.be.undefined;

										return fDone();
									});
							});
					}
				);
			}
		);
	}
);
