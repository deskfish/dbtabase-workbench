package schema

type Column struct {
	Name     string  `json:"name"`
	Type     string  `json:"type"`
	Nullable bool    `json:"nullable"`
	Default  *string `json:"default,omitempty"`
	Comment  string  `json:"comment,omitempty"`
	Primary  bool    `json:"primary,omitempty"`
}
type Index struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
}
type ForeignKey struct {
	Name       string   `json:"name"`
	Columns    []string `json:"columns"`
	RefSchema  string   `json:"refSchema"`
	RefTable   string   `json:"refTable"`
	RefColumns []string `json:"refColumns"`
	OnDelete   string   `json:"onDelete,omitempty"`
	OnUpdate   string   `json:"onUpdate,omitempty"`
}
type Table struct {
	Schema      string       `json:"schema"`
	Name        string       `json:"name"`
	Columns     []Column     `json:"columns"`
	Indexes     []Index      `json:"indexes,omitempty"`
	ForeignKeys []ForeignKey `json:"foreignKeys,omitempty"`
}
type Operation struct {
	Kind       string     `json:"kind"`
	Name       string     `json:"name,omitempty"`
	NewName    string     `json:"newName,omitempty"`
	Column     Column     `json:"column,omitempty"`
	Index      Index      `json:"index,omitempty"`
	ForeignKey ForeignKey `json:"foreignKey,omitempty"`
}
type Statement struct {
	SQL         string `json:"sql"`
	Destructive bool   `json:"destructive,omitempty"`
}
type Risk struct {
	Level   string `json:"level"`
	Kind    string `json:"kind"`
	Target  string `json:"target"`
	Message string `json:"message"`
}
type Preview struct {
	Statements  []Statement `json:"statements"`
	Risks       []Risk      `json:"risks"`
	Warnings    []string    `json:"warnings,omitempty"`
	Fingerprint string      `json:"fingerprint,omitempty"`
	Token       string      `json:"token,omitempty"`
	ExpiresAt   int64       `json:"expiresAt,omitempty"`
}
type ExecutionResult struct {
	SQL    string `json:"sql"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}
