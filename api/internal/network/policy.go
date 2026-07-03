package network

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"strings"
)

var ErrDestinationDenied = errors.New("database destination is not allowed")

type Policy struct {
	AllowedCIDRs    []netip.Prefix
	AllowedPorts    map[uint16]struct{}
	AllowedSuffixes []string
	Resolve         func(context.Context, string) ([]netip.Addr, error)
}

func (p Policy) Validate(ctx context.Context, host string, port uint16) ([]netip.Addr, error) {
	if port == 0 {
		return nil, fmt.Errorf("%w: port %d", ErrDestinationDenied, port)
	}
	if len(p.AllowedPorts) > 0 {
		if _, ok := p.AllowedPorts[port]; !ok {
			return nil, fmt.Errorf("%w: port %d", ErrDestinationDenied, port)
		}
	}
	host = strings.TrimSpace(strings.TrimSuffix(host, "."))
	if host == "" {
		return nil, fmt.Errorf("%w: empty host", ErrDestinationDenied)
	}

	addresses, err := p.resolve(ctx, host)
	if err != nil {
		return nil, fmt.Errorf("resolve database host: %w", err)
	}
	if len(addresses) == 0 {
		return nil, fmt.Errorf("%w: host resolved to no addresses", ErrDestinationDenied)
	}
	if len(p.AllowedSuffixes) > 0 && !p.suffixAllowed(host) && net.ParseIP(host) == nil {
		return nil, fmt.Errorf("%w: domain suffix", ErrDestinationDenied)
	}
	for _, address := range addresses {
		if address.IsUnspecified() || address.IsLoopback() || address.IsMulticast() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() {
			return nil, fmt.Errorf("%w: special address", ErrDestinationDenied)
		}
		if len(p.AllowedCIDRs) > 0 && !containedByAny(address, p.AllowedCIDRs) {
			return nil, fmt.Errorf("%w: address outside allowlist", ErrDestinationDenied)
		}
	}
	return addresses, nil
}

func (p Policy) resolve(ctx context.Context, host string) ([]netip.Addr, error) {
	if address, err := netip.ParseAddr(host); err == nil {
		return []netip.Addr{address.Unmap()}, nil
	}
	if p.Resolve != nil {
		return p.Resolve(ctx, host)
	}
	return net.DefaultResolver.LookupNetIP(ctx, "ip", host)
}

func (p Policy) suffixAllowed(host string) bool {
	if len(p.AllowedSuffixes) == 0 {
		return true
	}
	host = strings.ToLower(host)
	for _, suffix := range p.AllowedSuffixes {
		suffix = strings.ToLower(strings.TrimSpace(suffix))
		if suffix != "" && (host == strings.TrimPrefix(suffix, ".") || strings.HasSuffix(host, suffix)) {
			return true
		}
	}
	return false
}

func containedByAny(address netip.Addr, prefixes []netip.Prefix) bool {
	address = address.Unmap()
	for _, prefix := range prefixes {
		if prefix.Contains(address) {
			return true
		}
	}
	return false
}
