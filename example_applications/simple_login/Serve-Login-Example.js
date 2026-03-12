/**
* Orator Authentication — Simple Login Example
*
* Starts a Restify server on port 9060 with authentication routes
* and serves a single-page login/logout UI.
*
* Built-in users:  admin, jdoe, bsmith
* Denied passwords: abc, badpassword, 111
*
* Usage: npm start   (or node Serve-Login-Example.js)
*
* @author Steven Velozo <steven@velozo.com>
*/

const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libOratorAuthentication = require('orator-authentication');

const libFS = require('fs');
const libPath = require('path');

// --- Built-in user list (stable across restarts) ---
const _Users =
{
	'admin':  { IDUser: 1, LoginID: 'admin',  NameFirst: 'Admin',  NameLast: 'User',  FullName: 'Admin User'  },
	'jdoe':   { IDUser: 2, LoginID: 'jdoe',   NameFirst: 'Jane',   NameLast: 'Doe',   FullName: 'Jane Doe'   },
	'bsmith': { IDUser: 3, LoginID: 'bsmith', NameFirst: 'Bob',    NameLast: 'Smith', FullName: 'Bob Smith'  }
};

let tmpFable = new libFable(
	{
		Product: 'OratorAuthentication-LoginExample',
		ProductVersion: '0.0.1',
		APIServerPort: 9060,
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

// Plug in a custom authenticator that checks the built-in user list.
// Any password is accepted — only denied passwords or unknown LoginIDs fail.
tmpFable.OratorAuthentication.setAuthenticator(
	(pUsername, pPassword, fCallback) =>
	{
		let tmpUser = _Users[pUsername];
		if (tmpUser)
		{
			tmpFable.log.info(`Login example authenticator: User [${pUsername}] found.`);
			return fCallback(null, tmpUser);
		}
		tmpFable.log.info(`Login example authenticator: User [${pUsername}] not found.`);
		return fCallback(null, null);
	});

tmpFable.Orator.startService(
	(pError) =>
	{
		if (pError)
		{
			tmpFable.log.error(`Error starting Orator: ${pError}`);
			return;
		}

		// Enable body parsing for POST routes
		tmpFable.OratorServiceServer.server.use(tmpFable.OratorServiceServer.bodyParser());

		// Connect auth routes
		tmpFable.OratorAuthentication.connectRoutes();

		// Serve the static HTML page at /
		tmpFable.OratorServiceServer.get('/',
			(pRequest, pResponse, fNext) =>
			{
				let tmpHTMLPath = libPath.join(__dirname, 'html', 'index.html');
				let tmpHTML = libFS.readFileSync(tmpHTMLPath, 'utf8');
				pResponse.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				pResponse.write(tmpHTML);
				pResponse.end();
				return fNext();
			});

		tmpFable.log.info('=== Orator Authentication — Simple Login Example ===');
		tmpFable.log.info(`Open in browser:  http://localhost:9060/`);
		tmpFable.log.info(`Built-in users:   admin, jdoe, bsmith`);
		tmpFable.log.info(`Denied passwords: abc, badpassword, 111`);
	});
