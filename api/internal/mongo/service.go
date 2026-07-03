package mongo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const MaxDocuments = 10_000

type Column struct {
	Name         string `json:"name"`
	DatabaseType string `json:"databaseType,omitempty"`
}

type FindRequest struct {
	Database   string          `json:"database"`
	Collection string          `json:"collection"`
	Filter     json.RawMessage `json:"filter"`
	Sort       json.RawMessage `json:"sort"`
	Limit      int             `json:"limit"`
	Skip       int             `json:"skip"`
	Projection json.RawMessage `json:"projection"`
}

type FindResult struct {
	Columns    []Column        `json:"columns"`
	Rows       [][]any         `json:"rows"`
	Total      int64           `json:"total,omitempty"`
	Truncated  bool            `json:"truncated,omitempty"`
	DurationMs int64           `json:"durationMs"`
}

type AggregateRequest struct {
	Database   string            `json:"database"`
	Collection string            `json:"collection"`
	Pipeline   []json.RawMessage `json:"pipeline"`
}

type DocumentMutation struct {
	Database   string          `json:"database"`
	Collection string          `json:"collection"`
	Operation  string          `json:"operation"`
	Filter     json.RawMessage `json:"filter"`
	Document   json.RawMessage `json:"document"`
}

type IndexInfo struct {
	Name   string   `json:"name"`
	Keys   []string `json:"keys"`
	Unique bool     `json:"unique"`
}

type CollectionDetail struct {
	Collection    string      `json:"collection"`
	Database      string      `json:"database"`
	EstimatedDocs int64       `json:"estimatedDocs,omitempty"`
	Fields        []FieldInfo `json:"fields"`
	Indexes       []IndexInfo `json:"indexes"`
	Validator     string      `json:"validator,omitempty"`
}

type FieldInfo struct {
	Path       string  `json:"path"`
	Type       string  `json:"type"`
	Occurrence float64 `json:"occurrence"`
	Example    string  `json:"example,omitempty"`
}

type IndexPreview struct {
	Statement string `json:"statement"`
	Token     string `json:"token,omitempty"`
}

func Find(ctx context.Context, client *mongo.Client, req FindRequest, pageSize int) (FindResult, error) {
	start := time.Now()
	if req.Collection == "" {
		return FindResult{}, errors.New("collection is required")
	}
	if req.Limit <= 0 {
		req.Limit = pageSize
	}
	if req.Limit > MaxDocuments {
		req.Limit = MaxDocuments
	}
	filter, err := rawToBSON(req.Filter)
	if err != nil {
		return FindResult{}, err
	}
	sort, err := rawToBSON(req.Sort)
	if err != nil {
		return FindResult{}, err
	}
	projection, err := rawToBSON(req.Projection)
	if err != nil {
		return FindResult{}, err
	}
	coll := client.Database(req.Database).Collection(req.Collection)
	total, _ := coll.CountDocuments(ctx, filter)
	findOpts := options.Find().SetLimit(int64(req.Limit)).SetSkip(int64(req.Skip))
	if len(sort) > 0 {
		findOpts.SetSort(sort)
	}
	if len(projection) > 0 {
		findOpts.SetProjection(projection)
	}
	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		return FindResult{}, fmt.Errorf("mongo find: %w", err)
	}
	defer cursor.Close(ctx)
	docs := make([]bson.M, 0)
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return FindResult{}, err
		}
		docs = append(docs, doc)
	}
	if err := cursor.Err(); err != nil {
		return FindResult{}, err
	}
	flatDocs := flattenDocuments(docs)
	columns := collectColumns(flatDocs)
	rows := make([][]any, 0, len(flatDocs))
	for _, doc := range flatDocs {
		row := make([]any, len(columns))
		for i, col := range columns {
			row[i] = doc[col.Name]
		}
		rows = append(rows, row)
	}
	return FindResult{
		Columns:    columns,
		Rows:       rows,
		Total:      total,
		Truncated:  int64(len(docs)) >= int64(req.Limit),
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

func Aggregate(ctx context.Context, client *mongo.Client, req AggregateRequest, pageSize int) (FindResult, error) {
	start := time.Now()
	if req.Collection == "" {
		return FindResult{}, errors.New("collection is required")
	}
	if len(req.Pipeline) == 0 {
		return FindResult{}, errors.New("pipeline is required")
	}
	stages := make([]bson.D, 0, len(req.Pipeline))
	for _, stage := range req.Pipeline {
		var doc bson.D
		if err := bson.UnmarshalExtJSON(stage, true, &doc); err != nil {
			return FindResult{}, fmt.Errorf("invalid pipeline stage: %w", err)
		}
		stages = append(stages, doc)
	}
	pipeline := make([]any, len(stages))
	for i, stage := range stages {
		pipeline[i] = stage
	}
	coll := client.Database(req.Database).Collection(req.Collection)
	cursor, err := coll.Aggregate(ctx, pipeline, options.Aggregate().SetAllowDiskUse(true))
	if err != nil {
		return FindResult{}, fmt.Errorf("mongo aggregate: %w", err)
	}
	defer cursor.Close(ctx)
	docs := make([]bson.M, 0)
	for cursor.Next(ctx) && len(docs) < MaxDocuments {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			return FindResult{}, err
		}
		docs = append(docs, doc)
	}
	flatDocs := flattenDocuments(docs)
	columns := collectColumns(flatDocs)
	rows := make([][]any, 0, len(flatDocs))
	for _, doc := range flatDocs {
		row := make([]any, len(columns))
		for i, col := range columns {
			row[i] = doc[col.Name]
		}
		rows = append(rows, row)
	}
	return FindResult{
		Columns:    columns,
		Rows:       rows,
		Truncated:  len(docs) >= MaxDocuments,
		DurationMs: time.Since(start).Milliseconds(),
	}, nil
}

func MutateDocument(ctx context.Context, client *mongo.Client, req DocumentMutation) (int64, error) {
	if req.Collection == "" {
		return 0, errors.New("collection is required")
	}
	coll := client.Database(req.Database).Collection(req.Collection)
	switch req.Operation {
	case "insert":
		doc, err := rawToBSON(req.Document)
		if err != nil {
			return 0, err
		}
		result, err := coll.InsertOne(ctx, doc)
		if err != nil {
			return 0, err
		}
		if result.InsertedID == nil {
			return 0, errors.New("insert failed")
		}
		return 1, nil
	case "update":
		filter, err := rawToBSON(req.Filter)
		if err != nil {
			return 0, err
		}
		if len(filter) == 0 {
			return 0, errors.New("filter is required for update")
		}
		doc, err := rawToBSON(req.Document)
		if err != nil {
			return 0, err
		}
		result, err := coll.UpdateOne(ctx, filter, bson.M{"$set": doc})
		if err != nil {
			return 0, err
		}
		if result.MatchedCount != 1 || result.ModifiedCount > 1 {
			if result.MatchedCount != 1 {
				return 0, fmt.Errorf("update matched %d documents, expected 1", result.MatchedCount)
			}
		}
		return result.ModifiedCount, nil
	case "replace":
		filter, err := rawToBSON(req.Filter)
		if err != nil {
			return 0, err
		}
		doc, err := rawToBSON(req.Document)
		if err != nil {
			return 0, err
		}
		result, err := coll.ReplaceOne(ctx, filter, doc)
		if err != nil {
			return 0, err
		}
		if result.MatchedCount != 1 {
			return 0, fmt.Errorf("replace matched %d documents, expected 1", result.MatchedCount)
		}
		return 1, nil
	case "delete":
		filter, err := rawToBSON(req.Filter)
		if err != nil {
			return 0, err
		}
		result, err := coll.DeleteOne(ctx, filter)
		if err != nil {
			return 0, err
		}
		if result.DeletedCount != 1 {
			return 0, fmt.Errorf("delete removed %d documents, expected 1", result.DeletedCount)
		}
		return 1, nil
	default:
		return 0, fmt.Errorf("unsupported document operation %q", req.Operation)
	}
}

func DescribeCollection(ctx context.Context, client *mongo.Client, database, collection string) (CollectionDetail, error) {
	if collection == "" {
		return CollectionDetail{}, errors.New("collection is required")
	}
	db := client.Database(database)
	coll := db.Collection(collection)
	detail := CollectionDetail{Collection: collection, Database: database}
	count, err := coll.EstimatedDocumentCount(ctx)
	if err == nil {
		detail.EstimatedDocs = count
	}
	indexes, err := coll.Indexes().List(ctx)
	if err == nil {
		for indexes.Next(ctx) {
			var spec bson.M
			if err := indexes.Decode(&spec); err != nil {
				continue
			}
			info := IndexInfo{Name: fmt.Sprint(spec["name"]), Unique: spec["unique"] == true}
			if keys, ok := spec["key"].(bson.M); ok {
				for k := range keys {
					info.Keys = append(info.Keys, k)
				}
			}
			detail.Indexes = append(detail.Indexes, info)
		}
	}
	detail.Fields = inferFields(ctx, coll, 200)
	return detail, nil
}

func CreateIndex(ctx context.Context, client *mongo.Client, database, collection string, keys map[string]int, unique bool, name string) (string, error) {
	coll := client.Database(database).Collection(collection)
	indexKeys := bson.D{}
	for k, v := range keys {
		indexKeys = append(indexKeys, bson.E{Key: k, Value: v})
	}
	opts := options.Index()
	if unique {
		opts.SetUnique(true)
	}
	if name != "" {
		opts.SetName(name)
	}
	return coll.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: indexKeys, Options: opts})
}

func DropIndex(ctx context.Context, client *mongo.Client, database, collection, name string) error {
	_, err := client.Database(database).Collection(collection).Indexes().DropOne(ctx, name)
	return err
}

func rawToBSON(raw json.RawMessage) (bson.M, error) {
	if len(raw) == 0 || string(raw) == "null" {
		return bson.M{}, nil
	}
	var doc bson.M
	if err := bson.UnmarshalExtJSON(raw, true, &doc); err != nil {
		return nil, fmt.Errorf("invalid JSON/BSON: %w", err)
	}
	return doc, nil
}

func flattenDocuments(docs []bson.M) []map[string]any {
	result := make([]map[string]any, 0, len(docs))
	for _, doc := range docs {
		flat := make(map[string]any)
		flattenValue("", doc, flat)
		result = append(result, flat)
	}
	return result
}

func flattenValue(prefix string, value any, out map[string]any) {
	switch typed := value.(type) {
	case bson.M:
		for k, v := range typed {
			key := k
			if prefix != "" {
				key = prefix + "." + k
			}
			flattenValue(key, v, out)
		}
	case map[string]any:
		for k, v := range typed {
			key := k
			if prefix != "" {
				key = prefix + "." + k
			}
			flattenValue(key, v, out)
		}
	case []any, primitive.A:
		if prefix != "" {
			out[prefix] = typed
		}
	default:
		if prefix != "" {
			out[prefix] = formatScalar(typed)
		}
	}
}

func formatScalar(value any) any {
	switch typed := value.(type) {
	case primitive.ObjectID:
		return typed.Hex()
	case primitive.DateTime:
		return typed.Time().Format(time.RFC3339)
	default:
		return typed
	}
}

func collectColumns(docs []map[string]any) []Column {
	seen := make(map[string]struct{})
	columns := make([]Column, 0)
	for _, doc := range docs {
		for key := range doc {
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			columns = append(columns, Column{Name: key})
		}
	}
	return columns
}

func inferFields(ctx context.Context, coll *mongo.Collection, sample int) []FieldInfo {
	cursor, err := coll.Find(ctx, bson.M{}, options.Find().SetLimit(int64(sample)))
	if err != nil {
		return nil
	}
	defer cursor.Close(ctx)
	counts := make(map[string]map[string]int)
	total := 0
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		total++
		flat := make(map[string]any)
		flattenValue("", doc, flat)
		for path, value := range flat {
			if counts[path] == nil {
				counts[path] = make(map[string]int)
			}
			counts[path][fmt.Sprintf("%T", value)]++
		}
	}
	fields := make([]FieldInfo, 0, len(counts))
	for path, types := range counts {
		topType, topCount := "", 0
		for t, c := range types {
			if c > topCount {
				topType, topCount = t, c
			}
		}
		occurrence := 0.0
		if total > 0 {
			occurrence = float64(topCount) / float64(total)
		}
		fields = append(fields, FieldInfo{Path: path, Type: topType, Occurrence: occurrence})
	}
	return fields
}
