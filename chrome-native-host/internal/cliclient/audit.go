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
	TS          string `json:"ts"`
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
	if err := os.MkdirAll(d, 0o700); err != nil {
		return err
	}
	// Tighten directory permissions if it already existed with weaker mode.
	_ = os.Chmod(d, 0o700)
	path := filepath.Join(d, "audit.jsonl")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	// Tighten file permissions if it already existed with weaker mode.
	_ = os.Chmod(path, 0o600)
	defer f.Close()
	if rec.TS == "" {
		rec.TS = time.Now().UTC().Format(time.RFC3339)
	}
	b, _ := json.Marshal(rec)
	b = append(b, '\n')
	_, err = f.Write(b)
	return err
}
