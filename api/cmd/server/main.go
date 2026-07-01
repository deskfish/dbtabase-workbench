package main

import (
	"log"
	"net/http"
	"os"

	"dbworkbench/api/internal/config"
	"dbworkbench/api/internal/httpapi"
)

func main() {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		log.Fatal(err)
	}
	server := &http.Server{Addr: cfg.Address, Handler: httpapi.NewRouter(httpapi.Dependencies{})}
	log.Printf("database workbench API listening on %s", cfg.Address)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
