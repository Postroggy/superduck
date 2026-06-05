package protocol

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"sync"
)

// Chrome Native Messaging Protocol
// Messages are length-prefixed: 4 bytes (little-endian uint32) + JSON payload

var stdoutMu sync.Mutex

// bufferPool reuses byte slices for message reading to reduce GC pressure
var bufferPool = sync.Pool{
	New: func() interface{} {
		// Start with a reasonable size for most messages
		buf := make([]byte, 0, 64*1024)
		return &buf
	},
}

// getBuffer gets a buffer from the pool and resizes it if needed
func getBuffer(size int) []byte {
	bufPtr := bufferPool.Get().(*[]byte)
	buf := *bufPtr
	if cap(buf) < size {
		// Need a larger buffer, create new one
		buf = make([]byte, size)
	} else {
		buf = buf[:size]
	}
	return buf
}

// putBuffer returns a buffer to the pool
func putBuffer(buf []byte) {
	bufferPool.Put(&buf)
}

func ReadMessage(r io.Reader) ([]byte, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	if length > 1024*1024 {
		return nil, fmt.Errorf("message too large: %d bytes", length)
	}

	// Get buffer from pool
	buf := getBuffer(int(length))
	if _, err := io.ReadFull(r, buf); err != nil {
		// Return buffer to pool on error
		putBuffer(buf)
		return nil, err
	}

	// Make a copy since we're returning the buffer to the pool
	result := make([]byte, length)
	copy(result, buf)
	putBuffer(buf)

	return result, nil
}

func SendMessage(w io.Writer, msg interface{}) error {
	stdoutMu.Lock()
	defer stdoutMu.Unlock()

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	length := uint32(len(data))
	if err := binary.Write(w, binary.LittleEndian, length); err != nil {
		return err
	}
	_, err = w.Write(data)
	return err
}

// Message types for Chrome Native Host protocol

type Message struct {
	Type    string                 `json:"type"`
	Method  string                 `json:"method,omitempty"`
	Params  map[string]interface{} `json:"params,omitempty"`
	JSONRPC string                 `json:"jsonrpc,omitempty"`
}

type ToolRequest struct {
	Type   string `json:"type"`
	Method string `json:"method"`
	Params struct {
		Tool     string                 `json:"tool"`
		Args     map[string]interface{} `json:"args"`
		ClientID string                 `json:"client_id,omitempty"`
	} `json:"params"`
}

type ToolResponseMsg struct {
	Type   string       `json:"type"`
	Result *ContentWrap `json:"result,omitempty"`
	Error  *ContentWrap `json:"error,omitempty"`
}

type ContentWrap struct {
	Content           interface{} `json:"content"`
	StructuredContent interface{} `json:"structuredContent,omitempty"`
}
