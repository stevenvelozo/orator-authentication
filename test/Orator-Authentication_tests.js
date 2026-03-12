/**
* Unit tests for Orator Authentication
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
		Product: 'OratorAuthentication-Tests',
		ProductVersion: '0.0.0',
		APIServerPort: 0
	});

/**
 * Helper that creates a Fable + Orator + OratorAuthentication harness,
 * starts the service, then calls back with the harness object.
 *
 * @param {object} pFableSettings - Fable settings to merge with defaults.
 * @param {object} pAuthOptions - Options for the OratorAuthentication instance.
 * @param {Function} fCallback - Called with the harness object after the service starts.
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
 * Parse the IPC invoke response. The IPC synthesized response returns
 * JSON-stringified data, so we need to parse it.
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

suite
(
	'Orator Authentication',
	() =>
	{
		suite
		(
			'Object Sanity',
			() =>
			{
				test
				(
					'the class should initialize itself into a happy little object',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth).to.be.an('object', 'OratorAuthentication should initialize as an object.');
						Expect(tmpAuth).to.have.a.property('connectRoutes');
						Expect(tmpAuth.connectRoutes).to.be.a('function');
						Expect(tmpAuth).to.have.a.property('setAuthenticator');
						Expect(tmpAuth.setAuthenticator).to.be.a('function');
						Expect(tmpAuth).to.have.a.property('getSessionForRequest');
						Expect(tmpAuth.getSessionForRequest).to.be.a('function');
						Expect(tmpAuth).to.have.a.property('sessionStore');
						Expect(tmpAuth.sessionStore).to.be.an.instanceOf(Map);

						return fDone();
					}
				);

				test
				(
					'should have default configuration values',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth.routePrefix).to.equal('/1.0/');
						Expect(tmpAuth.cookieName).to.equal('SessionID');
						Expect(tmpAuth.sessionTTL).to.equal(86400000);
						Expect(tmpAuth.cookiePath).to.equal('/');
						Expect(tmpAuth.cookieHttpOnly).to.equal(true);
						Expect(tmpAuth.cookieSecure).to.equal(false);
						Expect(tmpAuth.deniedPasswords).to.deep.equal([]);

						return fDone();
					}
				);

				test
				(
					'should accept configuration via options',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
							{
								RoutePrefix: '/api/v2/',
								CookieName: 'AuthToken',
								SessionTTL: 3600000,
								DeniedPasswords: ['bad1', 'bad2']
							});

						Expect(tmpAuth.routePrefix).to.equal('/api/v2/');
						Expect(tmpAuth.cookieName).to.equal('AuthToken');
						Expect(tmpAuth.sessionTTL).to.equal(3600000);
						Expect(tmpAuth.deniedPasswords).to.deep.equal(['bad1', 'bad2']);

						return fDone();
					}
				);

				test
				(
					'should accept configuration via fable settings fallback',
					(fDone) =>
					{
						let tmpFableSettings = Object.assign({}, defaultFableSettings,
							{
								OratorAuthenticationRoutePrefix: '/auth/',
								OratorAuthenticationCookieName: 'SID',
								OratorAuthenticationSessionTTL: 7200000,
								OratorAuthenticationDeniedPasswords: ['x', 'y']
							});
						let tmpFable = new libFable(tmpFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth.routePrefix).to.equal('/auth/');
						Expect(tmpAuth.cookieName).to.equal('SID');
						Expect(tmpAuth.sessionTTL).to.equal(7200000);
						Expect(tmpAuth.deniedPasswords).to.deep.equal(['x', 'y']);

						return fDone();
					}
				);

				test
				(
					'options should take precedence over fable settings',
					(fDone) =>
					{
						let tmpFableSettings = Object.assign({}, defaultFableSettings,
							{
								OratorAuthenticationCookieName: 'FallbackCookie'
							});
						let tmpFable = new libFable(tmpFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
							{
								CookieName: 'OptionsCookie'
							});

						Expect(tmpAuth.cookieName).to.equal('OptionsCookie');

						return fDone();
					}
				);
			}
		);

		suite
		(
			'Authenticator',
			() =>
			{
				test
				(
					'the default authenticator should accept any username and password',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						tmpAuth._authenticator('anyuser', 'anypass',
							(pError, pUserRecord) =>
							{
								Expect(pError).to.be.null;
								Expect(pUserRecord).to.be.an('object');
								Expect(pUserRecord.LoginID).to.equal('anyuser');
								Expect(pUserRecord.IDUser).to.equal(0);
								return fDone();
							});
					}
				);

				test
				(
					'setAuthenticator should replace the default authenticator',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpCustomCalled = false;
						tmpAuth.setAuthenticator(
							(pUsername, pPassword, fCallback) =>
							{
								tmpCustomCalled = true;
								return fCallback(null, { LoginID: pUsername, IDUser: 42, Custom: true });
							});

						tmpAuth._authenticator('testuser', 'testpass',
							(pError, pUserRecord) =>
							{
								Expect(tmpCustomCalled).to.equal(true);
								Expect(pUserRecord.Custom).to.equal(true);
								Expect(pUserRecord.IDUser).to.equal(42);
								return fDone();
							});
					}
				);

				test
				(
					'setAuthenticator should reject non-function arguments',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpResult = tmpAuth.setAuthenticator('not a function');
						Expect(tmpResult).to.equal(false);

						// Default authenticator should still work
						tmpAuth._authenticator('user', 'pass',
							(pError, pUserRecord) =>
							{
								Expect(pUserRecord.LoginID).to.equal('user');
								return fDone();
							});
					}
				);

				test
				(
					'the custom authenticator should receive the correct username and password',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpCapturedUsername = null;
						let tmpCapturedPassword = null;

						tmpAuth.setAuthenticator(
							(pUsername, pPassword, fCallback) =>
							{
								tmpCapturedUsername = pUsername;
								tmpCapturedPassword = pPassword;
								return fCallback(null, { LoginID: pUsername, IDUser: 1 });
							});

						tmpAuth._authenticator('alice', 's3cret',
							(pError, pUserRecord) =>
							{
								Expect(tmpCapturedUsername).to.equal('alice');
								Expect(tmpCapturedPassword).to.equal('s3cret');
								return fDone();
							});
					}
				);
			}
		);

		suite
		(
			'Route Connection',
			() =>
			{
				test
				(
					'connectRoutes should register auth endpoints on the service server',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								// Verify GET Authenticate
								let tmpAuthHandler = pHarness.orator.serviceServer.router.find('GET', '/1.0/Authenticate/user/pass');
								Expect(tmpAuthHandler).to.be.an('object');
								Expect(tmpAuthHandler).to.have.a.property('handler');

								// Verify POST Authenticate
								let tmpPostAuthHandler = pHarness.orator.serviceServer.router.find('POST', '/1.0/Authenticate');
								Expect(tmpPostAuthHandler).to.be.an('object');
								Expect(tmpPostAuthHandler).to.have.a.property('handler');

								// Verify GET CheckSession
								let tmpCheckHandler = pHarness.orator.serviceServer.router.find('GET', '/1.0/CheckSession');
								Expect(tmpCheckHandler).to.be.an('object');
								Expect(tmpCheckHandler).to.have.a.property('handler');

								// Verify GET Deauthenticate
								let tmpDeauthGetHandler = pHarness.orator.serviceServer.router.find('GET', '/1.0/Deauthenticate');
								Expect(tmpDeauthGetHandler).to.be.an('object');
								Expect(tmpDeauthGetHandler).to.have.a.property('handler');

								// Verify POST Deauthenticate
								let tmpDeauthPostHandler = pHarness.orator.serviceServer.router.find('POST', '/1.0/Deauthenticate');
								Expect(tmpDeauthPostHandler).to.be.an('object');
								Expect(tmpDeauthPostHandler).to.have.a.property('handler');

								return fDone();
							});
					}
				);

				test
				(
					'connectRoutes should use a custom route prefix',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								RoutePrefix: '/api/auth/'
							},
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								let tmpHandler = pHarness.orator.serviceServer.router.find('GET', '/api/auth/Authenticate/user/pass');
								Expect(tmpHandler).to.be.an('object');
								Expect(tmpHandler).to.have.a.property('handler');

								let tmpCheckHandler = pHarness.orator.serviceServer.router.find('GET', '/api/auth/CheckSession');
								Expect(tmpCheckHandler).to.be.an('object');
								Expect(tmpCheckHandler).to.have.a.property('handler');

								return fDone();
							});
					}
				);

				test
				(
					'connectRoutes should return false when Orator is not initialized',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpResult = tmpAuth.connectRoutes();
						Expect(tmpResult).to.equal(false);

						return fDone();
					}
				);
			}
		);

		suite
		(
			'Authentication Flow',
			() =>
			{
				test
				(
					'successful GET authentication should return LoggedIn true and a SessionID',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/testuser/testpass', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(true);
										Expect(tmpData.SessionID).to.be.a('string');
										Expect(tmpData.SessionID.length).to.be.greaterThan(0);
										Expect(tmpData.UserID).to.equal(0); // default authenticator
										Expect(tmpData.UserRecord).to.be.an('object');
										Expect(tmpData.UserRecord.LoginID).to.equal('testuser');
										return fDone();
									});
							});
					}
				);

				test
				(
					'POST authentication should work via _handleAuthentication directly',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								let tmpCapturedData = null;
								let tmpMockResponse =
								{
									send: (pData) => { tmpCapturedData = pData; },
									setHeader: () => {}
								};

								pHarness.auth._handleAuthentication('postuser', 'postpass', tmpMockResponse,
									() =>
									{
										Expect(tmpCapturedData).to.be.an('object');
										Expect(tmpCapturedData.LoggedIn).to.equal(true);
										Expect(tmpCapturedData.SessionID).to.be.a('string');
										Expect(tmpCapturedData.UserRecord.LoginID).to.equal('postuser');
										return fDone();
									});
							});
					}
				);

				test
				(
					'denied password should return LoggedIn false',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								DeniedPasswords: ['abc', 'badpassword', '111']
							},
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/anyuser/abc', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData).to.be.an('object');
										Expect(tmpData.LoggedIn).to.equal(false);

										pHarness.orator.invoke('GET', '/1.0/Authenticate/anyuser/badpassword', null,
											(pError2, pResponseData2) =>
											{
												let tmpData2 = parseResponse(pResponseData2);
												Expect(tmpData2.LoggedIn).to.equal(false);

												pHarness.orator.invoke('GET', '/1.0/Authenticate/anyuser/111', null,
													(pError3, pResponseData3) =>
													{
														let tmpData3 = parseResponse(pResponseData3);
														Expect(tmpData3.LoggedIn).to.equal(false);
														return fDone();
													});
											});
									});
							});
					}
				);

				test
				(
					'denied password via _handleAuthentication should also fail',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								DeniedPasswords: ['abc']
							},
							(pHarness) =>
							{
								let tmpCapturedData = null;
								let tmpMockResponse =
								{
									send: (pData) => { tmpCapturedData = pData; },
									setHeader: () => {}
								};

								pHarness.auth._handleAuthentication('anyuser', 'abc', tmpMockResponse,
									() =>
									{
										Expect(tmpCapturedData).to.be.an('object');
										Expect(tmpCapturedData.LoggedIn).to.equal(false);
										return fDone();
									});
							});
					}
				);

				test
				(
					'custom authenticator rejection should return LoggedIn false',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.setAuthenticator(
									(pUsername, pPassword, fCallback) =>
									{
										if (pUsername === 'admin')
										{
											return fCallback(null, { LoginID: 'admin', IDUser: 1 });
										}
										return fCallback(null, null);
									});

								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/stranger/pass', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData.LoggedIn).to.equal(false);

										pHarness.orator.invoke('GET', '/1.0/Authenticate/admin/pass', null,
											(pError2, pResponseData2) =>
											{
												let tmpData2 = parseResponse(pResponseData2);
												Expect(tmpData2.LoggedIn).to.equal(true);
												Expect(tmpData2.UserID).to.equal(1);
												return fDone();
											});
									});
							});
					}
				);

				test
				(
					'authenticator error should return LoggedIn false',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.setAuthenticator(
									(pUsername, pPassword, fCallback) =>
									{
										return fCallback(new Error('Database unavailable'), null);
									});

								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/user/pass', null,
									(pError, pResponseData) =>
									{
										let tmpData = parseResponse(pResponseData);
										Expect(tmpData.LoggedIn).to.equal(false);
										return fDone();
									});
							});
					}
				);
			}
		);

		suite
		(
			'Session Management',
			() =>
			{
				test
				(
					'CheckSession should return LoggedIn true for a valid session',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/sessionuser/pass', null,
									(pError, pResponseData) =>
									{
										let tmpAuthData = parseResponse(pResponseData);
										Expect(tmpAuthData.LoggedIn).to.equal(true);
										let tmpSessionID = tmpAuthData.SessionID;

										let tmpSession = pHarness.auth.getSessionForRequest(
											{
												headers: { cookie: `SessionID=${tmpSessionID}` }
											});
										Expect(tmpSession).to.be.an('object');
										Expect(tmpSession.SessionID).to.equal(tmpSessionID);
										Expect(tmpSession.UserRecord.LoginID).to.equal('sessionuser');

										return fDone();
									});
							});
					}
				);

				test
				(
					'CheckSession should return LoggedIn false when no cookie is present',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								let tmpSession = pHarness.auth.getSessionForRequest({ headers: {} });
								Expect(tmpSession).to.be.null;

								return fDone();
							});
					}
				);

				test
				(
					'CheckSession should return null for an unknown session ID',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								let tmpSession = pHarness.auth.getSessionForRequest(
									{
										headers: { cookie: 'SessionID=nonexistent-session-id' }
									});
								Expect(tmpSession).to.be.null;

								return fDone();
							});
					}
				);

				test
				(
					'Deauthenticate should clear the session',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/clearme/pass', null,
									(pError, pResponseData) =>
									{
										let tmpAuthData = parseResponse(pResponseData);
										let tmpSessionID = tmpAuthData.SessionID;

										let tmpSession = pHarness.auth.getSessionForRequest(
											{
												headers: { cookie: `SessionID=${tmpSessionID}` }
											});
										Expect(tmpSession).to.not.be.null;

										pHarness.auth._destroySession(tmpSessionID);

										let tmpGoneSession = pHarness.auth.getSessionForRequest(
											{
												headers: { cookie: `SessionID=${tmpSessionID}` }
											});
										Expect(tmpGoneSession).to.be.null;

										return fDone();
									});
							});
					}
				);

				test
				(
					'expired sessions should return null',
					(fDone) =>
					{
						createStartedHarness(null,
							{
								SessionTTL: 1 // 1 millisecond
							},
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/expiring/pass', null,
									(pError, pResponseData) =>
									{
										let tmpAuthData = parseResponse(pResponseData);
										let tmpSessionID = tmpAuthData.SessionID;

										setTimeout(
											() =>
											{
												let tmpSession = pHarness.auth.getSessionForRequest(
													{
														headers: { cookie: `SessionID=${tmpSessionID}` }
													});
												Expect(tmpSession).to.be.null;
												Expect(pHarness.auth.sessionStore.has(tmpSessionID)).to.equal(false);
												return fDone();
											}, 20);
									});
							});
					}
				);

				test
				(
					'multiple sessions should coexist independently',
					(fDone) =>
					{
						createStartedHarness(null, null,
							(pHarness) =>
							{
								pHarness.auth.connectRoutes();

								pHarness.orator.invoke('GET', '/1.0/Authenticate/userA/pass', null,
									(pError1, pResponseA) =>
									{
										let tmpDataA = parseResponse(pResponseA);

										pHarness.orator.invoke('GET', '/1.0/Authenticate/userB/pass', null,
											(pError2, pResponseB) =>
											{
												let tmpDataB = parseResponse(pResponseB);
												Expect(tmpDataA.SessionID).to.not.equal(tmpDataB.SessionID);

												let tmpSessionA = pHarness.auth.getSessionForRequest(
													{
														headers: { cookie: `SessionID=${tmpDataA.SessionID}` }
													});
												let tmpSessionB = pHarness.auth.getSessionForRequest(
													{
														headers: { cookie: `SessionID=${tmpDataB.SessionID}` }
													});

												Expect(tmpSessionA.UserRecord.LoginID).to.equal('userA');
												Expect(tmpSessionB.UserRecord.LoginID).to.equal('userB');

												return fDone();
											});
									});
							});
					}
				);
			}
		);

		suite
		(
			'Cookie Parsing',
			() =>
			{
				test
				(
					'should parse a simple cookie header',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpResult = tmpAuth._parseCookies('SessionID=abc123');
						Expect(tmpResult).to.deep.equal({ SessionID: 'abc123' });

						return fDone();
					}
				);

				test
				(
					'should parse multiple cookies',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpResult = tmpAuth._parseCookies('SessionID=abc123; other=value; third=test');
						Expect(tmpResult).to.deep.equal({ SessionID: 'abc123', other: 'value', third: 'test' });

						return fDone();
					}
				);

				test
				(
					'should handle null or undefined cookie header',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth._parseCookies(null)).to.deep.equal({});
						Expect(tmpAuth._parseCookies(undefined)).to.deep.equal({});
						Expect(tmpAuth._parseCookies('')).to.deep.equal({});

						return fDone();
					}
				);

				test
				(
					'should handle cookies with equals signs in values',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpResult = tmpAuth._parseCookies('token=abc=def=ghi; SessionID=xyz');
						Expect(tmpResult.token).to.equal('abc=def=ghi');
						Expect(tmpResult.SessionID).to.equal('xyz');

						return fDone();
					}
				);

				test
				(
					'getSessionForRequest should handle null and missing headers',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						Expect(tmpAuth.getSessionForRequest(null)).to.be.null;
						Expect(tmpAuth.getSessionForRequest({})).to.be.null;
						Expect(tmpAuth.getSessionForRequest({ headers: {} })).to.be.null;

						return fDone();
					}
				);
			}
		);

		suite
		(
			'Cookie Setting',
			() =>
			{
				test
				(
					'_setSessionCookie should set the correct Set-Cookie header',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpCapturedHeader = null;
						let tmpMockResponse =
						{
							setHeader: (pName, pValue) =>
							{
								tmpCapturedHeader = { name: pName, value: pValue };
							}
						};

						tmpAuth._setSessionCookie(tmpMockResponse, 'test-session-id');

						Expect(tmpCapturedHeader.name).to.equal('Set-Cookie');
						Expect(tmpCapturedHeader.value).to.include('SessionID=test-session-id');
						Expect(tmpCapturedHeader.value).to.include('Path=/');
						Expect(tmpCapturedHeader.value).to.include('HttpOnly');
						Expect(tmpCapturedHeader.value).to.not.include('Secure');

						return fDone();
					}
				);

				test
				(
					'_clearSessionCookie should expire the cookie',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', {});

						let tmpCapturedHeader = null;
						let tmpMockResponse =
						{
							setHeader: (pName, pValue) =>
							{
								tmpCapturedHeader = { name: pName, value: pValue };
							}
						};

						tmpAuth._clearSessionCookie(tmpMockResponse);

						Expect(tmpCapturedHeader.name).to.equal('Set-Cookie');
						Expect(tmpCapturedHeader.value).to.include('SessionID=;');
						Expect(tmpCapturedHeader.value).to.include('Expires=Thu, 01 Jan 1970');

						return fDone();
					}
				);

				test
				(
					'cookie should include Secure flag when configured',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
							{
								CookieSecure: true
							});

						let tmpCapturedHeader = null;
						let tmpMockResponse =
						{
							setHeader: (pName, pValue) =>
							{
								tmpCapturedHeader = { name: pName, value: pValue };
							}
						};

						tmpAuth._setSessionCookie(tmpMockResponse, 'secure-session');

						Expect(tmpCapturedHeader.value).to.include('Secure');

						return fDone();
					}
				);
			}
		);
	}
);
