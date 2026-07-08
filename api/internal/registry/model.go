package registry

import (
	"encoding/json"
	"errors"
)

type Connection struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Kind        string          `json:"kind"`
	Driver      string          `json:"driver"`
	Scope       string          `json:"scope"`
	OwnerUserID string          `json:"ownerUserId,omitempty"`
	TeamID      string          `json:"teamId,omitempty"`
	Endpoint    json.RawMessage `json:"endpoint"`
	Config      json.RawMessage `json:"config"`
	HasSecret   bool            `json:"hasSecret"`
}

type Secret struct {
	Username   string `json:"username"`
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"privateKey,omitempty"`
	Passphrase string `json:"passphrase,omitempty"`
}

func (s Secret) empty() bool {
	return s.Username == "" && s.Password == "" && s.PrivateKey == "" && s.Passphrase == ""
}

type SaveInput struct {
	Connection Connection `json:"connection"`
	Secret     *Secret    `json:"secret,omitempty"`
}

type SealedSecret struct {
	KeyID      string
	Ciphertext []byte
}

var ErrForbidden = errors.New("forbidden")
