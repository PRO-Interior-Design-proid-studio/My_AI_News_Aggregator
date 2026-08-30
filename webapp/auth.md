# Auth.md

## Agent Registration

This site uses OAuth 2.0 / OpenID Connect for authentication.

- **Authorization endpoint**: `https://news.proid.studio/api/auth/yandex/login`
- **Token endpoint**: `https://news.proid.studio/api/auth/yandex/callback`
- **Supported grant types**: `authorization_code`
- **Supported identity types**: `yandex_id`, `vk_user_id`, `max_user_id`

## OAuth Protected Resource

- **Resource URL**: `https://news.proid.studio`
- **Authorization servers**: `https://news.proid.studio/.well-known/openid-configuration`
- **Scopes supported**: `openid`, `profile`

## Agent Registration Flow

1. Agent requests `client_id` from the site administrator.
2. Agent redirects user to `/api/auth/yandex/login` with `client_id` and `redirect_uri`.
3. User logs in via Yandex ID (or VK/MAX).
4. Agent receives `code` and exchanges it for an `access_token` at `/api/auth/yandex/callback`.
5. Agent uses `access_token` in `X-Auth-Token` header for API calls.

## Register URI (for OAuth)

- **Register URI**: `https://news.proid.studio/api/auth/register-agent` (contact admin)
- **Supported identity types**: `yandex_id`, `vk_user_id`, `max_user_id`
- **Credential types**: `access_token`
- **Revocation endpoint**: `https://news.proid.studio/api/auth/logout`

---

## OAuth Authorization Server Metadata

The service publishes OAuth Protected Resource Metadata at `/.well-known/oauth-protected-resource` and Authorization Server metadata at `/.well-known/oauth-authorization-server`.

### Protected Resource Metadata

- **Resource**: `https://news.proid.studio`
- **Authorization Servers**: `https://news.proid.studio`
- **Scopes Supported**: `openid`, `profile`
- **Bearer Methods Supported**: `header`

### Authorization Server Metadata

- **Issuer**: `https://news.proid.studio`
- **Token Endpoint**: `https://news.proid.studio/api/auth/yandex/callback`
- **Revocation Endpoint**: `https://news.proid.studio/api/auth/logout`
- **Grant Types Supported**: `authorization_code`

### Agent Authentication

- **Identity Endpoint**: `https://news.proid.studio/api/agent/identity` *(planned)*
- **Claim Endpoint**: `https://news.proid.studio/api/agent/identity/claim` *(planned)*
- **Events Endpoint**: `https://news.proid.studio/api/agent/event/notify` *(planned)*
- **Identity Types Supported**: `identity_assertion`, `anonymous`
- **Identity Assertion Types**: `urn:ietf:params:oauth:token-type:id-jag`, `verified_email`
- **Events Supported**: `https://schemas.workos.com/events/agent/auth/identity/assertion/revoked` *(planned)*