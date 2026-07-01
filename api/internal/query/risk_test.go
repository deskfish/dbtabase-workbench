package query

import "testing"

func TestClassifyDeleteWithoutTopLevelWhere(t *testing.T) {
	risk := Classify("DELETE FROM invoices")
	if risk.Level != Confirm || risk.Kind != "delete_without_where" {
		t.Fatalf("risk = %+v", risk)
	}
}

func TestClassifyUpdateWithTopLevelWhereIsSafe(t *testing.T) {
	risk := Classify("UPDATE invoices SET paid = true WHERE id = 42")
	if risk.Level != Safe {
		t.Fatalf("risk = %+v", risk)
	}
}

func TestClassifyDoesNotTreatSubqueryWhereAsTopLevel(t *testing.T) {
	risk := Classify("DELETE FROM invoices USING (SELECT id FROM old WHERE done = 1) x")
	if risk.Level != Confirm || risk.Kind != "delete_without_where" {
		t.Fatalf("risk = %+v", risk)
	}
}

func TestClassifyDropRequiresTargetConfirmation(t *testing.T) {
	risk := Classify("/* cleanup */ DROP TABLE public.invoices")
	if risk.Level != TypeTarget || risk.Target != "public.invoices" {
		t.Fatalf("risk = %+v", risk)
	}
}

func TestClassifyIgnoresKeywordsInsideStringsAndComments(t *testing.T) {
	risk := Classify("SELECT 'drop table users' AS note -- DELETE FROM x")
	if risk.Level != Safe {
		t.Fatalf("risk = %+v", risk)
	}
}
