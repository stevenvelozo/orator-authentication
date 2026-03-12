# Google OAuth (OpenID Connect)

Step-by-step guide to adding Google login to your application.

## Prerequisites

- A Google Cloud Platform account
- An Orator application with `orator-authentication` installed
- The `openid-client` library: `npm install openid-client`

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** in the top bar, then **New Project**
3. Enter a project name (e.g., "My App Authentication") and click **Create**
4. Wait for the project to be created, then select it

## Step 2: Configure the OAuth Consent Screen

1. In the left navigation, go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type (unless you have a Google Workspace org)
3. Click **Create**
4. Fill in the required fields:
   - **App name**: Your application's name
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click **Save and Continue**
6. On the **Scopes** page, click **Add or Remove Scopes**
7. Select these scopes:
   - `openid`
   - `email`
   - `profile`
8. Click **Update**, then **Save and Continue**
9. On the **Test users** page, add your email for testing (required while in "Testing" status)
10. Click **Save and Continue**, then **Back to Dashboard**

## Step 3: Create OAuth Client Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application** as the application type
4. Enter a name (e.g., "My App Web Client")
5. Under **Authorized redirect URIs**, add your callback URL:
   - Development: `http://localhost:8080/1.0/OAuth/Callback/google`
   - Production: `https://myapp.com/1.0/OAuth/Callback/google`
6. Click **Create**
7. A dialog will show your **Client ID** and **Client Secret** -- save both securely

## Step 4: Configure Orator Authentication

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libOratorAuthentication = require('orator-authentication');

let tmpFable = new libFable(
	{
		Product: 'MyApp',
		ProductVersion: '1.0.0',
		APIServerPort: 8080
	});

tmpFable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
tmpFable.serviceManager.addServiceType('Orator', libOrator);
tmpFable.serviceManager.addServiceType('OratorAuthentication', libOratorAuthentication);

tmpFable.serviceManager.instantiateServiceProvider('Orator');
tmpFable.serviceManager.instantiateServiceProvider('OratorAuthentication',
	{
		OAuthProviders:
		{
			'google':
			{
				Type: 'openid-connect',
				IssuerURL: 'https://accounts.google.com',
				ClientID: 'your-client-id.apps.googleusercontent.com',
				ClientSecret: 'your-client-secret',
				CallbackURL: 'http://localhost:8080/1.0/OAuth/Callback/google',
				Scopes: ['openid', 'profile', 'email']
			}
		},
		OAuthPostLoginRedirectURL: '/dashboard'
	});

tmpFable.Orator.startService(
	() =>
	{
		tmpFable.OratorAuthentication.connectRoutes();
		console.log('Server running with Google OAuth on port 8080');
	});
```

## Step 5: Test the Flow

1. Start your server: `node server.js`
2. Open your browser to: `http://localhost:8080/1.0/OAuth/Providers`
   - You should see: `{"Providers":[{"Name":"google","Type":"openid-connect","BeginURL":"/1.0/OAuth/Begin/google"}]}`
3. Navigate to: `http://localhost:8080/1.0/OAuth/Begin/google`
4. You'll be redirected to Google's login page
5. Sign in and grant consent
6. You'll be redirected back to your application at the `OAuthPostLoginRedirectURL`
7. Verify the session: `curl -b cookies.txt http://localhost:8080/1.0/CheckSession`

## Step 6: Add a Login Button

In your frontend HTML:

```html
<a href="/1.0/OAuth/Begin/google" class="login-button">
	Sign in with Google
</a>
```

Or dynamically fetch providers:

```javascript
fetch('/1.0/OAuth/Providers')
	.then(function(pResponse) { return pResponse.json(); })
	.then(function(pData)
	{
		pData.Providers.forEach(function(pProvider)
		{
			let tmpLink = document.createElement('a');
			tmpLink.href = pProvider.BeginURL;
			tmpLink.textContent = 'Sign in with ' + pProvider.Name;
			document.getElementById('login-buttons').appendChild(tmpLink);
		});
	});
```

## Google OIDC Claims

After a successful login, the following claims are available in the user mapper:

| Claim | Example | Description |
|-------|---------|-------------|
| `sub` | `'110169484474386276334'` | Google user ID (stable, unique) |
| `name` | `'Alice Smith'` | Full display name |
| `given_name` | `'Alice'` | First name |
| `family_name` | `'Smith'` | Last name |
| `email` | `'alice@gmail.com'` | Email address |
| `email_verified` | `true` | Whether email is verified |
| `picture` | `'https://lh3.google...'` | Profile photo URL |

## Moving to Production

1. In the Google Cloud Console, go to **OAuth consent screen** and click **Publish App**
2. Update the `CallbackURL` to your production domain
3. Add the production callback URL to **Authorized redirect URIs** in your OAuth client
4. Store `ClientID` and `ClientSecret` in environment variables, not in source code:

```javascript
'google':
{
	Type: 'openid-connect',
	IssuerURL: 'https://accounts.google.com',
	ClientID: process.env.GOOGLE_CLIENT_ID,
	ClientSecret: process.env.GOOGLE_CLIENT_SECRET,
	CallbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8080/1.0/OAuth/Callback/google',
	Scopes: ['openid', 'profile', 'email']
}
```
