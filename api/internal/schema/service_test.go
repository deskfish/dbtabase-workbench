package schema

import (
	"testing"
	"time"
)

func TestPreviewTokenRejectsTamperAndDrift(t *testing.T) {
	s := NewService("secret", time.Minute)
	before := Table{Schema: "public", Name: "t", Columns: []Column{{Name: "id", Type: "int"}}}
	p, e := s.Preview("postgres", "session/connection/public/t", before, []Operation{{Kind: "drop_column", Name: "id"}})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = s.verify(p.Token + "x"); e != ErrInvalidToken {
		t.Fatalf("tamper=%v", e)
	}
	if _, e = s.Execute(nil, nil, "session/connection/public/t", "different", p.Token, true); e != ErrStructureDrift {
		t.Fatalf("drift=%v", e)
	}
}
