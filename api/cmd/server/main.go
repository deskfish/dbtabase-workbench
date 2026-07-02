package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dbworkbench/api/internal/config"
	database "dbworkbench/api/internal/db"
	"dbworkbench/api/internal/httpapi"
	"dbworkbench/api/internal/network"
	"dbworkbench/api/internal/query"
	"dbworkbench/api/internal/registry"
	"dbworkbench/api/internal/schema"
	"dbworkbench/api/internal/session"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--healthcheck" {
		response, err := http.Get("http://127.0.0.1:8080/health/ready")
		if err != nil || response.StatusCode != http.StatusOK {
			os.Exit(1)
		}
		_ = response.Body.Close()
		return
	}
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}
	policy := network.Policy{AllowedCIDRs: cfg.AllowedCIDRs, AllowedPorts: cfg.AllowedPorts, AllowedSuffixes: cfg.AllowedSuffixes}
	sessions := session.NewStore(30 * time.Minute)
	queries := query.NewService(query.Limits{Timeout: cfg.QueryTimeout, PageSize: cfg.PageSize, MaxRows: cfg.MaxRows})
	transactions := query.NewTransactionService(5 * time.Minute)
	schemaSecret := cfg.RegistrySecret
	if schemaSecret == "" {
		schemaSecret = "database-workbench-ephemeral-schema-secret"
	}
	schemaService := schema.NewService(schemaSecret, 10*time.Minute)
	var registryStore *registry.Store
	if cfg.RegistrySecret != "" {
		registryStore, err = registry.Open(cfg.RegistryPath, cfg.RegistrySecret)
		if err != nil {
			log.Fatal(err)
		}
		defer registryStore.Close()
	} else {
		log.Printf("registry disabled: DBW_REGISTRY_SECRET is empty")
	}
	server := &http.Server{
		Addr: cfg.Address,
		Handler: httpapi.NewRouter(httpapi.Dependencies{
			Sessions: sessions,
			Registry: registryStore,
			ValidateDestination: func(ctx context.Context, host string, port uint16) error {
				_, err := policy.Validate(ctx, host, port)
				return err
			},
			OpenConnection: database.Open,
			Queries:        queries,
			Transactions:   transactions,
			Schema:         schemaService,
		}),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("database workbench API listening on %s", cfg.Address)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("server stopped unexpectedly: %v", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
