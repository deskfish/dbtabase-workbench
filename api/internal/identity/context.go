package identity

import "context"

type contextKey string

const (
	principalContextKey    contextKey = "identity.principal"
	loginSessionContextKey contextKey = "identity.loginSession"
)

func WithPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalContextKey, principal)
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalContextKey).(Principal)
	return principal, ok
}

func WithLoginSession(ctx context.Context, session LoginSession) context.Context {
	return context.WithValue(ctx, loginSessionContextKey, session)
}

func LoginSessionFromContext(ctx context.Context) (LoginSession, bool) {
	session, ok := ctx.Value(loginSessionContextKey).(LoginSession)
	return session, ok
}
