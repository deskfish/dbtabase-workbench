package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"dbworkbench/api/internal/config"
	database "dbworkbench/api/internal/db"
	"dbworkbench/api/internal/httpapi"
	"dbworkbench/api/internal/network"
	"dbworkbench/api/internal/query"
	"dbworkbench/api/internal/session"
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}
	policy := network.Policy{AllowedCIDRs: cfg.AllowedCIDRs, AllowedPorts: cfg.AllowedPorts, AllowedSuffixes: cfg.AllowedSuffixes}
	sessions := session.NewStore(30 * time.Minute)
	queries := query.NewService(query.Limits{Timeout: cfg.QueryTimeout, PageSize: cfg.PageSize, MaxRows: cfg.MaxRows})
	transactions := query.NewTransactionService(5 * time.Minute)
	server := &http.Server{
		Addr: cfg.Address,
		Handler: httpapi.NewRouter(httpapi.Dependencies{
			Sessions: sessions,
			ValidateDestination: func(ctx context.Context, host string, port uint16) error {
				_, err := policy.Validate(ctx, host, port)
				return err
			},
			OpenConnection: database.Open,
			Queries:        queries,
			Transactions:   transactions,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("database workbench API listening on %s", cfg.Address)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
