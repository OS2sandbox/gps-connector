package auth

import (
	"context"
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
)

type Claims struct {
	Sub        string `json:"sub"`
	CVR        string `json:"cvr"`
	IDP        string `json:"idp"`
	Privileges string `json:"privileges"`
}

type Privileges struct {
	XMLName xml.Name `xml:"PrivilegeList"`
	URNs    []string `xml:"PrivilegeGroup>Privilege"`
}

func (p Privileges) Has(urn string) bool {
	return slices.Contains(p.URNs, urn)
}

type ctxKey int

const (
	claimsKey ctxKey = iota
	privilegesKey
)

func ClaimsFromContext(ctx context.Context) (Claims, bool) {
	c, ok := ctx.Value(claimsKey).(Claims)
	return c, ok
}

func PrivilegesFromContext(ctx context.Context) (Privileges, bool) {
	p, ok := ctx.Value(privilegesKey).(Privileges)
	return p, ok
}

func decodePrivileges(b64 string) (Privileges, error) {
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return Privileges{}, fmt.Errorf("base64 decode: %w", err)
	}

	var p Privileges
	if err := xml.Unmarshal(raw, &p); err != nil {
		return Privileges{}, fmt.Errorf("xml unmarshal: %w", err)
	}
	return p, nil
}

func Middleware(verifier *oidc.IDTokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := r.Header.Get("Authorization")
			if !strings.HasPrefix(h, "Bearer ") {
				http.Error(w, "missing bearer token", http.StatusUnauthorized)
				return
			}
			rawToken := strings.TrimPrefix(h, "Bearer ")
			idToken, err := verifier.Verify(r.Context(), rawToken)
			if err != nil {
				http.Error(w, "invalid token "+err.Error(), http.StatusUnauthorized)
				return
			}
			var c Claims
			if err := idToken.Claims(&c); err != nil {
				http.Error(w, "claim parsing failed "+err.Error(), http.StatusInternalServerError)
				return
			}
			privs, err := decodePrivileges(c.Privileges)
			if err != nil {
				http.Error(w, "privileges decode: "+err.Error(), http.StatusForbidden)
				return
			}

			ctx := context.WithValue(r.Context(), claimsKey, c)
			ctx = context.WithValue(ctx, privilegesKey, privs)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
