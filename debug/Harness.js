/**
* Orator Authentication Debug Harness
*
* Starts a Restify server on port 8765 with authentication routes
* using the default allow-all authenticator, for manual testing.
*
* Usage: npm start   (or node debug/Harness.js)
*
* Test with:
*   curl http://localhost:8765/1.0/Authenticate/testuser/anything
*   curl -X POST -H "Content-Type: application/json" -d '{"UserName":"testuser","Password":"anything"}' http://localhost:8765/1.0/Authenticate
*   curl -b "SessionID=<sid>" http://localhost:8765/1.0/CheckSession
*   curl http://localhost:8765/1.0/Deauthenticate
*
* OAuth (if configured):
*   Open http://localhost:8765/1.0/OAuth/Providers in a browser
*   Open http://localhost:8765/1.0/OAuth/Begin/{provider} to start OAuth flow
*
* @author Steven Velozo <steven@velozo.com>
*/

const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');

const libOratorAuthentication = require('../source/Orator-Authentication.js');

let tmpFable = new libFable(
	{
		Product: 'OratorAuthentication-DebugHarness',
		ProductVersion: '1.0.0',
		APIServerPort: 8765,
		LogLevel: 5
	});

tmpFable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
tmpFable.serviceManager.addServiceType('Orator', libOrator);
tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

tmpFable.serviceManager.instantiateServiceProvider('Orator');
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		DeniedPasswords: ['abc', 'badpassword', '111']
	});

tmpFable.Orator.startService(
	(pError) =>
	{
		if (pError)
		{
			tmpFable.log.error(`Error starting Orator: ${pError}`);
			return;
		}

		tmpFable.OratorAuthentication.connectRoutes();

		tmpFable.log.info('=== Orator Authentication Debug Harness ===');
		tmpFable.log.info(`Server running on port 8765`);
		tmpFable.log.info(`Authenticate:    http://localhost:8765/1.0/Authenticate/{user}/{pass}`);
		tmpFable.log.info(`POST Auth:       curl -X POST -H "Content-Type: application/json" -d '{"UserName":"user","Password":"pass"}' http://localhost:8765/1.0/Authenticate`);
		tmpFable.log.info(`CheckSession:    http://localhost:8765/1.0/CheckSession`);
		tmpFable.log.info(`Deauthenticate:  http://localhost:8765/1.0/Deauthenticate`);
		tmpFable.log.info(`Denied passwords: abc, badpassword, 111`);
		tmpFable.log.info('');
		tmpFable.log.info('--- OAuth: Not configured (see comments in this file to enable) ---');
	});

// --- Optional: OAuth Configuration ---
// To test OAuth login, uncomment one or more provider blocks below and
// fill in your client credentials from the provider's developer console.
//
// Google (OpenID Connect):
//
// tmpFable.OratorAuthentication.addOAuthProvider('google',
//     {
//         Type: 'openid-connect',
//         IssuerURL: 'https://accounts.google.com',
//         ClientID: 'your-google-client-id.apps.googleusercontent.com',
//         ClientSecret: 'your-google-client-secret',
//         CallbackURL: 'http://localhost:8765/1.0/OAuth/Callback/google',
//         Scopes: ['openid', 'profile', 'email']
//     });
//
// Microsoft / Azure AD (via MSAL — for Exchange/Graph access):
//
// tmpFable.OratorAuthentication.addOAuthProvider('microsoft',
//     {
//         Type: 'msal',
//         ClientID: 'your-azure-app-client-id',
//         ClientSecret: 'your-azure-client-secret',
//         Authority: 'https://login.microsoftonline.com/your-tenant-id',
//         CallbackURL: 'http://localhost:8765/1.0/OAuth/Callback/microsoft',
//         Scopes: ['openid', 'profile', 'email']
//     });
//
// Microsoft / Azure AD (via OpenID Connect — simpler, no MSAL dependency):
//
// tmpFable.OratorAuthentication.addOAuthProvider('microsoft',
//     {
//         Type: 'openid-connect',
//         IssuerURL: 'https://login.microsoftonline.com/your-tenant-id/v2.0',
//         ClientID: 'your-azure-app-client-id',
//         ClientSecret: 'your-azure-client-secret',
//         CallbackURL: 'http://localhost:8765/1.0/OAuth/Callback/microsoft',
//         Scopes: ['openid', 'profile', 'email']
//     });
