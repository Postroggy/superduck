package main

import "testing"

func TestBuildCallToolResultPreservesStructuredContent(t *testing.T) {
	t.Parallel()
	result := map[string]interface{}{
		"output":      "Successfully captured screenshot (100x200, png) - ID: img_123",
		"base64Image": "aGVsbG8=",
		"imageFormat": "png",
		"imageId":     "img_123",
		"tabContext": map[string]interface{}{
			"currentTabId":    1,
			"executedOnTabId": 1,
		},
	}

	callResult := buildCallToolResult(result)

	if callResult.StructuredContent == nil {
		t.Fatal("StructuredContent is nil")
	}

	structured, ok := callResult.StructuredContent.(map[string]interface{})
	if !ok {
		t.Fatalf("StructuredContent type = %T, want map[string]interface{}", callResult.StructuredContent)
	}

	if got := structured["imageId"]; got != "img_123" {
		t.Fatalf("StructuredContent.imageId = %v, want img_123", got)
	}

	if got := len(callResult.Content); got != 3 {
		t.Fatalf("Content length = %d, want 3", got)
	}

	if callResult.IsError {
		t.Fatal("IsError = true, want false")
	}
}

func TestBuildCallToolResultMarksToolErrors(t *testing.T) {
	t.Parallel()
	result := map[string]interface{}{
		"error": "something went wrong",
	}

	callResult := buildCallToolResult(result)

	if !callResult.IsError {
		t.Fatal("IsError = false, want true")
	}

	if callResult.StructuredContent == nil {
		t.Fatal("StructuredContent is nil")
	}
}
