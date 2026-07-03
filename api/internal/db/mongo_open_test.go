package db

import "testing"

func TestBuildMongoURIIncludesDatabaseAndAuthSource(t *testing.T) {
	uri := buildMongoURI(ConnectionInput{
		Driver:   MongoDB,
		Host:     "192.168.6.100",
		Port:     27017,
		Database: "channel-hub",
		User:     "root",
		Password: "root",
	})
	if uri == "" {
		t.Fatal("empty uri")
	}
	if want := "authSource=admin"; !contains(uri, want) {
		t.Fatalf("uri %q missing %q", uri, want)
	}
	if want := "channel-hub"; !contains(uri, want) {
		t.Fatalf("uri %q missing database path %q", uri, want)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
	 if s[i:i+len(sub)] == sub {
		 return i
	 }
	}
	return -1
}
