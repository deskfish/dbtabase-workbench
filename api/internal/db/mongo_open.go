package db

import (
	"context"
	"errors"
	"net"
	"net/url"
	"strconv"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func openMongo(ctx context.Context, input ConnectionInput) (*Handle, error) {
	if input.Host == "" || input.Port == 0 {
		return nil, errors.New("host and port are required")
	}
	uri := buildMongoURI(input)
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, errors.New("database connection could not be initialized")
	}
	pingCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err := client.Ping(pingCtx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, errors.New("database connection failed")
	}
	if input.Database == "" {
		input.Database = "admin"
	}
	return &Handle{Driver: MongoDB, Config: input, Mongo: client}, nil
}

func buildMongoURI(input ConnectionInput) string {
	host := net.JoinHostPort(input.Host, strconv.Itoa(int(input.Port)))
	connURL := &url.URL{Scheme: "mongodb", Host: host}
	if input.Database != "" {
		connURL.Path = "/" + input.Database
	}
	if input.User != "" {
		connURL.User = url.UserPassword(input.User, input.Password)
	}
	query := connURL.Query()
	if input.TLSMode == "required" || input.TLSMode == "require" {
		query.Set("tls", "true")
	}
	if input.User != "" {
		query.Set("authSource", "admin")
	}
	connURL.RawQuery = query.Encode()
	return connURL.String()
}
