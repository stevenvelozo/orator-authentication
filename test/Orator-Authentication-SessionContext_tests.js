/**
 * Session context-switch tests for orator-authentication.
 *
 * The Session/Context primitive re-points an already-authenticated cookie
 * session at a different opaque "context" (a tenant persona, in the consuming
 * app) by delegating to a consumer-supplied resolver. The provider itself stays
 * schema-agnostic: it knows only the context key and whatever record the
 * resolver returns.
 */
const Chai = require('chai');
const Expect = Chai.expect;

const libFable = require('fable');
const libOrator = require('orator');
const libOratorAuthentication = require('../source/Orator-Authentication.js');

function makeAuth(pAuthOptions, fCallback)
{
	let tmpFable = new libFable({ Product: 'OratorAuthSessionContextTest', LogStreams: [{ level: 'error', streamtype: 'process.stdout' }] });
	tmpFable.serviceManager.addServiceType('Orator', libOrator);
	tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);
	let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
	let tmpAuth = tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication', pAuthOptions || {});
	tmpOrator.startService(() => fCallback(tmpAuth));
}

// Minimal response double: the handler calls pResponse.send(body) once.
function makeResponse()
{
	return { Sent: null, send: function (pBody) { this.Sent = pBody; } };
}

suite('Orator Authentication - Session Context Switch', () =>
{
	test('setSessionContextResolver is exposed and validates its argument', (fDone) =>
	{
		makeAuth({}, (pAuth) =>
		{
			Expect(pAuth.setSessionContextResolver).to.be.a('function');
			Expect(pAuth.setSessionContextResolver('not a function')).to.equal(false);
			Expect(pAuth.setSessionContextResolver(() => {})).to.equal(true);
			return fDone();
		});
	});

	test('a permitted switch re-points the stored session at the resolved record', (fDone) =>
	{
		makeAuth({}, (pAuth) =>
		{
			pAuth.setSessionContextResolver((pCurrent, pContextKey, fCb) =>
			{
				// Resolver owns validation; here we only allow context '3'.
				if (pContextKey === '3') { return fCb(null, { IDUser: 20, IDCustomer: 3, IDAccount: pCurrent.IDAccount }); }
				return fCb(null, null);
			});

			let tmpSession = pAuth._createSession({ IDUser: 10, IDCustomer: 1, IDAccount: 5 });
			let tmpRequest = { headers: {}, params: { ContextKey: '3' }, UserSession: tmpSession };
			let tmpResponse = makeResponse();

			pAuth._handleSessionContextSwitch(tmpRequest, tmpResponse, () =>
			{
				Expect(tmpResponse.Sent.Switched).to.equal(true);
				Expect(tmpResponse.Sent.UserRecord.IDUser).to.equal(20);
				Expect(tmpResponse.Sent.UserRecord.IDCustomer).to.equal(3);
				// The account followed the persona through the resolver.
				Expect(tmpResponse.Sent.UserRecord.IDAccount).to.equal(5);
				// The change persists in the store (cookie sessions are by reference).
				Expect(pAuth.sessionStore.get(tmpSession.SessionID).UserRecord.IDUser).to.equal(20);
				return fDone();
			});
		});
	});

	test('a rejected switch leaves the session unchanged', (fDone) =>
	{
		makeAuth({}, (pAuth) =>
		{
			pAuth.setSessionContextResolver((pCurrent, pContextKey, fCb) => fCb(null, null));

			let tmpSession = pAuth._createSession({ IDUser: 10, IDCustomer: 1, IDAccount: 5 });
			let tmpRequest = { headers: {}, params: { ContextKey: '999' }, UserSession: tmpSession };
			let tmpResponse = makeResponse();

			pAuth._handleSessionContextSwitch(tmpRequest, tmpResponse, () =>
			{
				Expect(tmpResponse.Sent.Switched).to.equal(false);
				Expect(pAuth.sessionStore.get(tmpSession.SessionID).UserRecord.IDCustomer).to.equal(1);
				return fDone();
			});
		});
	});

	test('a token (ephemeral) session cannot be switched', (fDone) =>
	{
		makeAuth({}, (pAuth) =>
		{
			pAuth.setSessionContextResolver((pCurrent, pContextKey, fCb) => fCb(null, { IDUser: 20 }));

			let tmpRequest = { headers: {}, params: { ContextKey: '3' }, UserSession: { SessionID: 'token', ViaToken: true, UserRecord: { IDUser: 7 } } };
			let tmpResponse = makeResponse();

			pAuth._handleSessionContextSwitch(tmpRequest, tmpResponse, () =>
			{
				Expect(tmpResponse.Sent.Switched).to.equal(false);
				Expect(String(tmpResponse.Sent.Error)).to.contain('token');
				return fDone();
			});
		});
	});

	test('an unauthenticated request is rejected', (fDone) =>
	{
		makeAuth({}, (pAuth) =>
		{
			pAuth.setSessionContextResolver((pCurrent, pContextKey, fCb) => fCb(null, { IDUser: 20 }));

			let tmpRequest = { headers: {}, params: { ContextKey: '3' }, UserSession: {} };
			let tmpResponse = makeResponse();

			pAuth._handleSessionContextSwitch(tmpRequest, tmpResponse, () =>
			{
				Expect(tmpResponse.Sent.Switched).to.equal(false);
				return fDone();
			});
		});
	});

	test('the route is inert until a resolver is installed', (fDone) =>
	{
		makeAuth({}, (pAuth) =>
		{
			let tmpSession = pAuth._createSession({ IDUser: 10, IDCustomer: 1 });
			let tmpRequest = { headers: {}, params: { ContextKey: '3' }, UserSession: tmpSession };
			let tmpResponse = makeResponse();

			pAuth._handleSessionContextSwitch(tmpRequest, tmpResponse, () =>
			{
				Expect(tmpResponse.Sent.Switched).to.equal(false);
				Expect(String(tmpResponse.Sent.Error)).to.contain('not enabled');
				return fDone();
			});
		});
	});
});
