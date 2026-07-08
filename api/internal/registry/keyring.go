package registry

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

type Keyring struct {
	keys   map[string][]byte
	active string
}

func ParseKeyring(encoded, active string) (*Keyring, error) {
	keys := make(map[string][]byte)
	for _, entry := range strings.Split(encoded, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		keyID, value, ok := strings.Cut(entry, ":")
		if !ok || strings.TrimSpace(keyID) == "" || strings.TrimSpace(value) == "" {
			return nil, fmt.Errorf("invalid credential key entry")
		}
		decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(value))
		if err != nil {
			return nil, fmt.Errorf("decode credential key %s: %w", keyID, err)
		}
		if len(decoded) != 32 {
			return nil, fmt.Errorf("credential key %s must decode to 32 bytes", keyID)
		}
		keys[strings.TrimSpace(keyID)] = decoded
	}
	if _, ok := keys[active]; !ok {
		return nil, fmt.Errorf("active credential key %q is not configured", active)
	}
	return &Keyring{keys: keys, active: active}, nil
}

func (k *Keyring) Seal(connectionID string, secret Secret) (SealedSecret, error) {
	key, ok := k.keys[k.active]
	if !ok {
		return SealedSecret{}, fmt.Errorf("active credential key %q is not configured", k.active)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return SealedSecret{}, fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return SealedSecret{}, fmt.Errorf("create gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return SealedSecret{}, fmt.Errorf("generate nonce: %w", err)
	}
	plaintext, err := json.Marshal(secret)
	if err != nil {
		return SealedSecret{}, fmt.Errorf("marshal secret: %w", err)
	}
	ciphertext := gcm.Seal(append([]byte{}, nonce...), nonce, plaintext, []byte(connectionID))
	return SealedSecret{KeyID: k.active, Ciphertext: ciphertext}, nil
}

func (k *Keyring) Open(connectionID, keyID string, ciphertext []byte) (Secret, error) {
	key, ok := k.keys[keyID]
	if !ok {
		return Secret{}, fmt.Errorf("credential key %q is not configured", keyID)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return Secret{}, fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return Secret{}, fmt.Errorf("create gcm: %w", err)
	}
	if len(ciphertext) < gcm.NonceSize() {
		return Secret{}, fmt.Errorf("ciphertext too short")
	}
	nonce := ciphertext[:gcm.NonceSize()]
	payload := ciphertext[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, payload, []byte(connectionID))
	if err != nil {
		return Secret{}, fmt.Errorf("open secret: %w", err)
	}
	var secret Secret
	if err := json.Unmarshal(plaintext, &secret); err != nil {
		return Secret{}, fmt.Errorf("decode secret: %w", err)
	}
	return secret, nil
}
