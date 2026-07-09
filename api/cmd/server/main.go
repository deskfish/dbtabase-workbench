package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"dbworkbench/api/internal/config"
	database "dbworkbench/api/internal/db"
	"dbworkbench/api/internal/httpapi"
	"dbworkbench/api/internal/identity"
	"dbworkbench/api/internal/logs"
	"dbworkbench/api/internal/migrate"
	"dbworkbench/api/internal/network"
	"dbworkbench/api/internal/platform"
	"dbworkbench/api/internal/query"
	"dbworkbench/api/internal/registry"
	"dbworkbench/api/internal/schema"
	"dbworkbench/api/internal/session"
	"dbworkbench/api/internal/sshlog"
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
	openCtx, openCancel := context.WithTimeout(context.Background(), 15*time.Second)
	resources, err := platform.Open(openCtx, cfg.PostgresURL, cfg.RedisURL)
	openCancel()
	if err != nil {
		log.Fatal(err)
	}
	defer resources.Close()
	migrateCtx, migrateCancel := context.WithTimeout(context.Background(), 15*time.Second)
	if err := migrate.Apply(migrateCtx, resources.Postgres); err != nil {
		migrateCancel()
		log.Fatal(err)
	}
	migrateCancel()

	identityStore := identity.NewStore(resources.Postgres)
	if cfg.BootstrapAdminUser != "" {
		bootstrapCtx, bootstrapCancel := context.WithTimeout(context.Background(), 15*time.Second)
		err := identityStore.BootstrapAdmin(bootstrapCtx, cfg.BootstrapAdminUser, cfg.BootstrapAdminPassword)
		bootstrapCancel()
		if err != nil && !errors.Is(err, identity.ErrAlreadyBootstrapped) {
			log.Fatal(err)
		}
	}
	keyring, err := registry.ParseKeyring(cfg.CredentialKeys, cfg.ActiveCredentialKey)
	if err != nil {
		log.Fatal(err)
	}
	authSessions := identity.NewSessions(resources.Redis, cfg.SessionTTL)
	connectionRegistry := registry.NewPGStore(resources.Postgres, keyring)
	logStore := logs.NewStore(resources.Postgres, "/data/log_uploads")
	sshLogService := sshlog.NewService()

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
			Sessions:           sessions,
			Identity:           identityStore,
			AuthSessions:       authSessions,
			ConnectionRegistry: connectionRegistry,
			Logs:               logStore,
			LogConnections:     connectionRegistry,
			LogSSH:             sshLogService,
			Registry:           registryStore,
			Ready: func() bool {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				defer cancel()
				return resources.Ready(ctx)
			},
			ValidateDestination: func(ctx context.Context, host string, port uint16) error {
				_, err := policy.Validate(ctx, host, port)
				return err
			},
			OpenConnection: database.Open,
			OpenHandle:     database.OpenHandle,
			Queries:        queries,
			Transactions:   transactions,
			Schema:         schemaService,
			QueryTimeout:   cfg.QueryTimeout,
			PageSize:       cfg.PageSize,
			CookieSecure:   cfg.CookieSecure,
			AuthSessionTTL: cfg.SessionTTL,
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
