package network

import (
	"context"
	"net/netip"
	"testing"
)

func TestPolicyAllowsConfiguredAddressAndPort(t *testing.T) {
	p := Policy{
		AllowedCIDRs: []netip.Prefix{netip.MustParsePrefix("10.20.0.0/16")},
		AllowedPorts: map[uint16]struct{}{3306: {}},
		Resolve: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("10.20.3.4")}, nil
		},
	}
	addresses, err := p.Validate(context.Background(), "db.internal", 3306)
	if err != nil {
		t.Fatal(err)
	}
	if len(addresses) != 1 || addresses[0].String() != "10.20.3.4" {
		t.Fatalf("addresses = %v", addresses)
	}
}

func TestPolicyRejectsCloudMetadataAddress(t *testing.T) {
	p := Policy{
		AllowedCIDRs: []netip.Prefix{netip.MustParsePrefix("0.0.0.0/0")},
		AllowedPorts: map[uint16]struct{}{3306: {}},
		Resolve: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("169.254.169.254")}, nil
		},
	}
	if _, err := p.Validate(context.Background(), "metadata.invalid", 3306); err == nil {
		t.Fatal("expected metadata address rejection")
	}
}

func TestPolicyRejectsAnyResolvedAddressOutsideAllowlist(t *testing.T) {
	p := Policy{
		AllowedCIDRs: []netip.Prefix{netip.MustParsePrefix("10.20.0.0/16")},
		AllowedPorts: map[uint16]struct{}{5432: {}},
		Resolve: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("10.20.1.2"), netip.MustParseAddr("8.8.8.8")}, nil
		},
	}
	if _, err := p.Validate(context.Background(), "rebinding.invalid", 5432); err == nil {
		t.Fatal("expected mixed DNS result rejection")
	}
}

func TestPolicyRejectsDisallowedPort(t *testing.T) {
	p := Policy{AllowedPorts: map[uint16]struct{}{3306: {}}}
	if _, err := p.Validate(context.Background(), "10.20.1.2", 22); err == nil {
		t.Fatal("expected port rejection")
	}
}
