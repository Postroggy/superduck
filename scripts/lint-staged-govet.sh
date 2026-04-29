#!/usr/bin/env bash
# Run go vet on the chrome-native-host module when staged Go files change.
# We vet the whole module rather than individual files because go vet operates
# on packages — vetting one file in isolation would miss cross-file references.
set -e
cd "$(dirname "$0")/../chrome-native-host"
go vet ./...
