package cliclient

import (
	"encoding/json"
	neturl "net/url"
	"os"
	"path/filepath"
	"time"
)

// Audit log path: ~/.superduck/audit.jsonl
func AuditDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".superduck"), nil
}

func AuditPath() (string, error) {
	d, err := AuditDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "audit.jsonl"), nil
}

type AuditRecord struct {
	Ts          string `json:"ts"`
	Cmd         string `json:"cmd"`
	TabID       *int   `json:"tabId,omitempty"`
	URL         string `json:"url,omitempty"`
	Domain      string `json:"domain,omitempty"`
	Status      int    `json:"status,omitempty"`
	CrossOrigin bool   `json:"crossOrigin,omitempty"`
	OK          bool   `json:"ok"`
	Err         string `json:"error,omitempty"`
	DurationMs  int64  `json:"durationMs"`
}

// SetURL records the url and (if parseable) its hostname as the domain.
func (r *AuditRecord) SetURL(u string) {
	r.URL = u
	if pu, err := neturl.Parse(u); err == nil {
		r.Domain = pu.Hostname()
	}
}

func WriteAudit(rec AuditRecord) error {
	d, err := AuditDir()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(d, 0o755); err != nil {
		return err
	}
	path := filepath.Join(d, "audit.jsonl")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	if rec.Ts == "" {
		rec.Ts = time.Now().UTC().Format(time.RFC3339)
	}
	b, _ := json.Marshal(rec)
	b = append(b, '\n')
	_, err = f.Write(b)
	return err
}
