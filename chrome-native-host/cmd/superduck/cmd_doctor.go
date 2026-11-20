package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"chrome-native-host/internal/cliclient"
)

func cmdDoctor(argv []string) error {
	fs := flag.NewFlagSet("doctor", flag.ContinueOnError)
	if err := fs.Parse(argv); err != nil {
		return err
	}

	ok := true
	var failedChecks []string
	check := func(name string, pass bool, hint string) {
		if pass {
			fmt.Printf("✓ %s\n", name)
		} else {
			fmt.Printf("✗ %s\n", name)
			if hint != "" {
				fmt.Printf("    → %s\n", hint)
			}
			ok = false
			failedChecks = append(failedChecks, name)
		}
	}

	// 1. 我自己在哪
	exe, err := os.Executable()
	check("CLI binary located", err == nil, "")
	if err == nil {
		fmt.Printf("    %s\n", exe)
	}

	// 2. native messaging manifest 文件存在且指向 native host
	targets := nativeMessagingManifestTargets(nativeHostName)
	if len(targets) == 0 {
		check("Native messaging manifest", false, "no browser registered the host; run `superduck init`")
	} else {
		var problems []string
		for _, target := range targets {
			binary, problem := nativeManifestProblem(target.path)
			if problem != "" {
				problems = append(problems, fmt.Sprintf("%s: %s", target.browser, problem))
				continue
			}
			fmt.Printf("    %s: %s -> %s\n", target.browser, target.path, binary)
		}
		hint := ""
		if len(problems) > 0 {
			hint = strings.Join(problems, "; ") + " — run `superduck init`"
		}
		check("Native messaging manifest", len(problems) == 0, hint)
	}

	// 3. UDS 可连且认证/control 协议可响应
	healthOpts := clientOpts()
	if healthOpts.Timeout > 3*time.Second {
		healthOpts.Timeout = 3 * time.Second
	}
	status, healthErr := cliclient.Health(healthOpts)
	connOK := healthErr == nil
	check("native-host UDS/auth reachable", connOK, "make sure your browser is running with the SuperDuck extension loaded")
	if connOK {
		fmt.Printf("    pid=%v chromeReady=%v socket=%v\n", status["pid"], status["chromeReady"], status["socketPath"])
	} else if healthErr != nil {
		fmt.Printf("    → %s\n", healthErr)
	}

	// 4. 扩展存活: 调一次 list_tabs
	if connOK {
		_, callErr := cliclient.CallString("superduck_list_tabs", nil, clientOpts())
		check("extension responds (superduck_list_tabs)", callErr == nil, errString(callErr))
	}

	// 5. audit dir
	ad, _ := cliclient.AuditDir()
	_, statErr := os.Stat(ad)
	check("audit dir present", statErr == nil, fmt.Sprintf("will be created on first command at %s", ad))

	if !ok {
		tracker.Capture("cli.doctor.completed", map[string]any{
			"all_passed":    false,
			"checks_failed": failedChecks,
		})
		flushCtx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		tracker.Flush(flushCtx)
		cancel()
		fmt.Println()
		fmt.Println("doctor: some checks failed")
		os.Exit(1)
	}
	tracker.Capture("cli.doctor.completed", map[string]any{
		"all_passed": true,
	})
	fmt.Println()
	fmt.Println("doctor: all checks passed")
	return nil
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

type nativeManifestTarget struct {
	browser string
	path    string
}

func nativeMessagingManifestTargets(hostName string) []nativeManifestTarget {
	if runtime.GOOS == "windows" {
		var targets []nativeManifestTarget
		for _, browser := range []string{"Chrome", "Edge", "Brave"} {
			if path, ok := readNativeHostRegistryManifest(browser, hostName); ok {
				targets = append(targets, nativeManifestTarget{browser, path})
			}
		}
		return targets
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return nil
	}
	var candidates []nativeManifestTarget
	switch runtime.GOOS {
	case "darwin":
		base := filepath.Join(home, "Library", "Application Support")
		candidates = []nativeManifestTarget{
			{"Chrome", filepath.Join(base, "Google", "Chrome", "NativeMessagingHosts", hostName+".json")},
			{"Edge", filepath.Join(base, "Microsoft Edge", "NativeMessagingHosts", hostName+".json")},
			{"Brave", filepath.Join(base, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts", hostName+".json")},
		}
	case "linux":
		candidates = []nativeManifestTarget{
			{"Chrome", filepath.Join(home, ".config", "google-chrome", "NativeMessagingHosts", hostName+".json")},
			{"Edge", filepath.Join(home, ".config", "microsoft-edge", "NativeMessagingHosts", hostName+".json")},
			{"Brave", filepath.Join(home, ".config", "BraveSoftware", "Brave-Browser", "NativeMessagingHosts", hostName+".json")},
		}
	}
	var targets []nativeManifestTarget
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate.path); err == nil {
			targets = append(targets, candidate)
		}
	}
	return targets
}

func nativeManifestProblem(manifestPath string) (string, string) {
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return "", fmt.Sprintf("manifest unreadable: %v", err)
	}
	var manifest struct {
		Path string `json:"path"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return "", fmt.Sprintf("manifest is not valid JSON: %v", err)
	}
	if manifest.Path == "" {
		return "", "manifest has no path"
	}
	if _, err := os.Stat(manifest.Path); err != nil {
		return manifest.Path, fmt.Sprintf("pointing at a missing binary: %s", manifest.Path)
	}
	name := strings.TrimSuffix(filepath.Base(manifest.Path), filepath.Ext(manifest.Path))
	if name != nativeHostBinaryName {
		return manifest.Path, fmt.Sprintf("pointing at %s instead of the %s binary (a CLI binary cannot serve native messaging)", filepath.Base(manifest.Path), nativeHostBinaryName)
	}
	return manifest.Path, ""
}
