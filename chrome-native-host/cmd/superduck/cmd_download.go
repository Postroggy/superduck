package main

import (
	"flag"
	"fmt"
)

func cmdDownload(argv []string) error {
	fs := flag.NewFlagSet("download", flag.ContinueOnError)
	output := fs.String("output", "", "Path relative to Chrome Downloads")
	id := fs.Int("id", 0, "Check a download issued to this session")
	if err := fs.Parse(reorderFlagsFirst(argv)); err != nil {
		return err
	}
	args := fs.Args()
	payload := map[string]any{}
	switch {
	case *id > 0 && *output == "" && len(args) == 0:
		payload["id"] = *id
	case *id == 0 && *output != "" && len(args) == 1:
		payload["url"] = args[0]
		payload["filename"] = *output
	default:
		return fmt.Errorf("usage: superduck --tab <id> download <URL> --output RELATIVE_PATH | --id <id>")
	}
	if gflags.JSON {
		return runSimpleTool("superduck_download_file", "download", payload)
	}
	return runSimpleResultOnly("superduck_download_file", "download", payload)
}
