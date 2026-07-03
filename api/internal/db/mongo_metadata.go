package db

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

func ListMongoDatabases(ctx context.Context, client *mongo.Client) ([]string, error) {
	names, err := client.ListDatabaseNames(ctx, bson.D{})
	if err != nil {
		return nil, fmt.Errorf("list mongo databases: %w", err)
	}
	return names, nil
}

func MongoMetadata(ctx context.Context, client *mongo.Client, databaseName string) ([]Object, error) {
	if databaseName == "" {
		databaseName = "admin"
	}
	db := client.Database(databaseName)
	collections, err := db.ListCollectionNames(ctx, bson.M{})
	if err != nil {
		return nil, fmt.Errorf("list mongo collections: %w", err)
	}
	objects := make([]Object, 0, len(collections))
	for _, name := range collections {
		objects = append(objects, Object{Kind: "table", Schema: databaseName, Name: name})
	}
	return objects, nil
}

func SwitchMongoDatabase(config ConnectionInput, databaseName string) ConnectionInput {
	config.Database = databaseName
	return config
}
