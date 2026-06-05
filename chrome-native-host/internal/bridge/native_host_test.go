package bridge

import (
	"testing"
)

func TestValidateComputerArgs(t *testing.T) {
	tests := []struct {
		name string
		args map[string]interface{}
	}{
		{"valid duration", map[string]interface{}{"duration": float64(5)}},
		{"zero duration", map[string]interface{}{"duration": float64(0)}},
		{"max duration", map[string]interface{}{"duration": float64(30)}},
		{"no duration", map[string]interface{}{"action": "screenshot"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			validateComputerArgs(tt.args)
		})
	}
}
