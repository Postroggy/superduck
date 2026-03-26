package converter

import "testing"

func TestToMCPContentPreservesScreenshotTextTabContextAndImage(t *testing.T) {
	result := map[string]interface{}{
		"output":      "Successfully captured screenshot (100x200, png) - ID: img_123",
		"base64Image": "aGVsbG8=",
		"imageFormat": "png",
		"tabContext": map[string]interface{}{
			"executedOnTabId": 42,
			"availableTabs": []interface{}{
				map[string]interface{}{
					"id":    42,
					"title": "Example",
					"url":   "https://example.com",
				},
			},
		},
	}

	content := ToMCPContent(result)
	if got, want := len(content), 3; got != want {
		t.Fatalf("content length = %d, want %d", got, want)
	}
}
