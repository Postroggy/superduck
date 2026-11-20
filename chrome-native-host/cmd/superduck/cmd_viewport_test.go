package main

import "testing"

func TestViewportParams(t *testing.T) {
	plain := viewportParams(375, 812, 0, false)
	if plain["width"] != 375 || plain["height"] != 812 || plain["mobile"] != false {
		t.Fatalf("viewportParams() = %v, want width/height/mobile", plain)
	}
	if plain["deviceScaleFactor"] != 1.0 {
		t.Fatalf("deviceScaleFactor = %v, want 1 by default", plain["deviceScaleFactor"])
	}

	retina := viewportParams(1440, 900, 2, true)
	if retina["deviceScaleFactor"] != 2.0 {
		t.Fatalf("deviceScaleFactor = %v, want 2", retina["deviceScaleFactor"])
	}
	if retina["mobile"] != true {
		t.Fatalf("mobile = %v, want true", retina["mobile"])
	}
}
