package query

import "strings"

type RiskLevel string

const (
	Safe       RiskLevel = "safe"
	Confirm    RiskLevel = "confirm"
	TypeTarget RiskLevel = "type_target"
)

type Risk struct {
	Level  RiskLevel `json:"level"`
	Kind   string    `json:"kind,omitempty"`
	Target string    `json:"target,omitempty"`
	Reason string    `json:"reason,omitempty"`
}

type token struct {
	text  string
	depth int
}

func Classify(statement string) Risk {
	tokens := tokenize(statement)
	if len(tokens) == 0 {
		return Risk{Level: Safe}
	}
	first := strings.ToUpper(tokens[0].text)
	switch first {
	case "UPDATE", "DELETE":
		for _, item := range tokens[1:] {
			if item.depth == 0 && strings.EqualFold(item.text, "WHERE") {
				return Risk{Level: Safe}
			}
		}
		return Risk{Level: Confirm, Kind: strings.ToLower(first) + "_without_where", Reason: "语句缺少顶层 WHERE 条件"}
	case "DROP", "TRUNCATE":
		target := ""
		for _, item := range tokens[1:] {
			upper := strings.ToUpper(item.text)
			if item.depth == 0 && upper != "TABLE" && upper != "DATABASE" && upper != "SCHEMA" && upper != "VIEW" && upper != "IF" && upper != "EXISTS" {
				target = item.text
				break
			}
		}
		return Risk{Level: TypeTarget, Kind: strings.ToLower(first), Target: target, Reason: "操作将删除数据库对象"}
	default:
		return Risk{Level: Safe}
	}
}

func tokenize(sql string) []token {
	result := make([]token, 0)
	depth := 0
	for i := 0; i < len(sql); {
		switch {
		case isSpace(sql[i]):
			i++
		case sql[i] == '-' && i+1 < len(sql) && sql[i+1] == '-':
			i += 2
			for i < len(sql) && sql[i] != '\n' {
				i++
			}
		case sql[i] == '/' && i+1 < len(sql) && sql[i+1] == '*':
			i += 2
			for i+1 < len(sql) && !(sql[i] == '*' && sql[i+1] == '/') {
				i++
			}
			if i+1 < len(sql) {
				i += 2
			}
		case sql[i] == '\'' || sql[i] == '"' || sql[i] == '`':
			quote := sql[i]
			i++
			for i < len(sql) {
				if sql[i] == quote {
					if i+1 < len(sql) && sql[i+1] == quote {
						i += 2
						continue
					}
					i++
					break
				}
				if sql[i] == '\\' && i+1 < len(sql) {
					i += 2
				} else {
					i++
				}
			}
		case sql[i] == '(':
			depth++
			i++
		case sql[i] == ')':
			if depth > 0 {
				depth--
			}
			i++
		default:
			start := i
			for i < len(sql) && !isSpace(sql[i]) && !strings.ContainsRune("(),;'\"`", rune(sql[i])) {
				i++
			}
			if i > start {
				result = append(result, token{text: sql[start:i], depth: depth})
			} else {
				i++
			}
		}
	}
	return result
}

func isSpace(value byte) bool {
	return value == ' ' || value == '\t' || value == '\n' || value == '\r'
}
