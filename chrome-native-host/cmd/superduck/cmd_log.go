package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"

	"chrome-native-host/internal/cliclient"
)

func cmdLog(argv []string) error {
	fs := flag.NewFlagSet("log", flag.ContinueOnError)
	tail := fs.Int("tail", 0, "Show only last N records (capped at 100000)")
	if err := fs.Parse(argv); err != nil {
		return err
	}
	if *tail > 100000 {
		*tail = 100000
	}

	path, err := cliclient.AuditPath()
	if err != nil {
		return err
	}
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			fmt.Fprintln(os.Stderr, "no audit log yet:", path)
			return nil
		}
		return err
	}
	defer f.Close()

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)

	if *tail <= 0 {
		for sc.Scan() {
			fmt.Println(sc.Text())
		}
		return sc.Err()
	}

	ring := make([]string, *tail)
	count := 0
	for sc.Scan() {
		ring[count%*tail] = sc.Text()
		count++
	}
	if err := sc.Err(); err != nil {
		return err
	}
	n, start := count, 0
	if count > *tail {
		n, start = *tail, count%*tail
	}
	for i := 0; i < n; i++ {
		fmt.Println(ring[(start+i)%*tail])
	}
	return nil
}
