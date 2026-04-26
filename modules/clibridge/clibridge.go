package clibridge

import (
	"embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/GoMudEngine/GoMud/internal/configs"
	"github.com/GoMudEngine/GoMud/internal/connections"
	"github.com/GoMudEngine/GoMud/internal/events"
	"github.com/GoMudEngine/GoMud/internal/plugins"
	"github.com/GoMudEngine/GoMud/internal/rooms"
	"github.com/GoMudEngine/GoMud/internal/suggestions"
	"github.com/GoMudEngine/GoMud/internal/term"
	"github.com/GoMudEngine/GoMud/internal/users"
	"github.com/creack/pty"
)

var (
	//go:embed files/*
	files embed.FS
)

func init() {
	m := &CLIBridgeModule{
		plug:     plugins.New(`clibridge`, `1.0`),
		sessions: make(map[connections.ConnectionId]*Session),
	}

	if err := m.plug.AttachFileSystem(files); err != nil {
		panic(err)
	}

	m.plug.AddUserCommand(`cli`, m.cliCommand, false, true)

	events.RegisterListener(events.CLIRequest{}, m.onCLIRequest)

	connections.RegisterWindowChangeListener(m.onWindowChange)

	suggestions.OnAutoComplete.Register(m.onAutoComplete)
}

type Session struct {
	ConnectionId connections.ConnectionId
	UserId       int
	Cmd          *exec.Cmd
	PtyFile      *os.File
	Done         chan struct{}
	mu           sync.Mutex
	isTelnet     bool
}

type CLIBridgeModule struct {
	plug     *plugins.Plugin
	sessions map[connections.ConnectionId]*Session
	mu       sync.Mutex
}

func (m *CLIBridgeModule) getSession(connId connections.ConnectionId) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.sessions[connId]
}

func (m *CLIBridgeModule) setSession(connId connections.ConnectionId, s *Session) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[connId] = s
}

func (m *CLIBridgeModule) removeSession(connId connections.ConnectionId) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, connId)
}

func (m *CLIBridgeModule) isEnabled() bool {
	v := m.plug.Config.Get(`Enabled`)
	if b, ok := v.(bool); ok {
		return b
	}
	return true
}

func (m *CLIBridgeModule) getAllowedTools() []string {
	v := m.plug.Config.Get(`AllowedTools`)
	if tools, ok := v.([]any); ok {
		result := make([]string, 0, len(tools))
		for _, t := range tools {
			if s, ok := t.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	return nil
}

func (m *CLIBridgeModule) getAllowedPaths() []string {
	v := m.plug.Config.Get(`AllowedPaths`)
	if paths, ok := v.([]any); ok {
		result := make([]string, 0, len(paths))
		for _, p := range paths {
			if s, ok := p.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	return []string{`/*`}
}

func (m *CLIBridgeModule) isToolAllowed(toolName string) bool {
	for _, allowed := range m.getAllowedTools() {
		if strings.EqualFold(allowed, toolName) {
			return true
		}
	}
	return false
}

func (m *CLIBridgeModule) isPathAllowed(relPath string) bool {
	dataDir := configs.GetFilePathsConfig().DataFiles.String()

	absPath := filepath.Clean(filepath.Join(dataDir, relPath))

	if !strings.HasPrefix(absPath, filepath.Clean(dataDir)) {
		return false
	}

	for _, allowed := range m.getAllowedPaths() {
		if allowed == `/*` {
			return true
		}
		allowedAbs := filepath.Clean(filepath.Join(dataDir, allowed))
		if strings.HasPrefix(absPath, allowedAbs) {
			return true
		}
	}
	return false
}

func (m *CLIBridgeModule) resolveArgs(args []string) ([]string, error) {
	if len(args) == 0 {
		return args, nil
	}

	resolved := make([]string, len(args))

	for i, arg := range args {
		if strings.HasPrefix(arg, `-`) {
			resolved[i] = arg
			continue
		}

		if !m.isPathAllowed(arg) {
			return nil, fmt.Errorf("path %q is not within allowed paths", arg)
		}
		resolved[i] = arg
	}

	return resolved, nil
}

func (m *CLIBridgeModule) cliCommand(rest string, user *users.UserRecord, room *rooms.Room, flags events.EventFlag) (bool, error) {
	if !m.isEnabled() {
		user.SendText("CLI bridge is not enabled.")
		return true, nil
	}

	connId := users.GetConnectionId(user.UserId)
	connDetails := connections.Get(connId)
	if connDetails == nil {
		user.SendText("Connection not found.")
		return true, nil
	}

	if connDetails.IsWebSocket() {
		user.SendText("CLI tools are not supported over WebSocket connections.")
		return true, nil
	}

	parts := strings.Fields(rest)
	if len(parts) < 1 {
		user.SendText("Usage: cli <tool> [args...]")
		return true, nil
	}

	if m.getSession(connId) != nil {
		user.SendText("A CLI session is already active on this connection.")
		return true, nil
	}

	toolName := parts[0]
	args := parts[1:]

	if !m.isToolAllowed(toolName) {
		user.SendText(fmt.Sprintf("Tool %q is not in the allowed tools list.", toolName))
		return true, nil
	}

	events.AddToQueue(events.CLIRequest{
		UserId:       user.UserId,
		ConnectionId: connId,
		Command:      toolName,
		Args:         args,
	})

	return true, nil
}

func (m *CLIBridgeModule) onCLIRequest(e events.Event) events.ListenerReturn {
	evt, ok := e.(events.CLIRequest)
	if !ok {
		return events.Continue
	}

	user := users.GetByUserId(evt.UserId)
	if user == nil {
		return events.Continue
	}

	connId := evt.ConnectionId
	connDetails := connections.Get(connId)
	if connDetails == nil {
		return events.Continue
	}

	binaryPath, err := exec.LookPath(evt.Command)
	if err != nil {
		user.SendText(fmt.Sprintf("Tool %q not found on system: %s", evt.Command, err.Error()))
		return events.Continue
	}

	resolvedArgs, err := m.resolveArgs(evt.Args)
	if err != nil {
		user.SendText(fmt.Sprintf("Path error: %s", err.Error()))
		return events.Continue
	}

	cs := connections.GetClientSettings(connId)
	cols := uint16(cs.Display.ScreenWidth)
	rows := uint16(cs.Display.ScreenHeight)
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}

	cmd := exec.Command(binaryPath, resolvedArgs...)
	cmd.Dir = configs.GetFilePathsConfig().DataFiles.String()
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		fmt.Sprintf("COLUMNS=%d", cols),
		fmt.Sprintf("LINES=%d", rows),
	)

	winSize := &pty.Winsize{Cols: cols, Rows: rows}
	ptmx, err := pty.StartWithSize(cmd, winSize)
	if err != nil {
		user.SendText(fmt.Sprintf("Failed to start CLI tool: %s", err.Error()))
		return events.Continue
	}

	sess := &Session{
		ConnectionId: connId,
		UserId:       evt.UserId,
		Cmd:          cmd,
		PtyFile:      ptmx,
		Done:         make(chan struct{}),
		isTelnet:     !connDetails.IsSSH() && !connDetails.IsWebSocket(),
	}

	m.setSession(connId, sess)

	inputHandler := m.makeInputHandler(connId)
	if connDetails.IsSSH() {
		connDetails.PrependInputHandler("CLIBridge", inputHandler)
	} else {
		connDetails.AddInputHandler("CLIBridge", inputHandler, "TelnetIACHandler")
	}

	connDetails.OutputSuppressed(true)

	go m.ptyToClient(sess)
	go m.waitForExit(sess, user)

	return events.Continue
}

func (m *CLIBridgeModule) makeInputHandler(connId connections.ConnectionId) connections.InputHandler {
	return func(ci *connections.ClientInput, handlerState map[string]any) bool {
		sess := m.getSession(connId)
		if sess == nil {
			return true
		}

		if len(ci.DataIn) > 0 {
			sess.mu.Lock()
			if sess.PtyFile != nil {
				sess.PtyFile.Write(ci.DataIn)
			}
			sess.mu.Unlock()
		}

		ci.DataIn = ci.DataIn[:0]
		ci.Buffer = ci.Buffer[:0]
		ci.EnterPressed = false
		ci.TabPressed = false
		ci.BSPressed = false

		return false
	}
}

func (m *CLIBridgeModule) ptyToClient(sess *Session) {
	buf := make([]byte, 4096)
	for {
		n, err := sess.PtyFile.Read(buf)
		if n > 0 {
			data := buf[:n]
			if sess.isTelnet {
				data = escapeIAC(data)
			}
			connections.SendRawTo(data, sess.ConnectionId)
		}
		if err != nil {
			return
		}
	}
}

func escapeIAC(data []byte) []byte {
	count := 0
	for _, b := range data {
		if b == byte(term.TELNET_IAC) {
			count++
		}
	}
	if count == 0 {
		return data
	}
	escaped := make([]byte, 0, len(data)+count)
	for _, b := range data {
		escaped = append(escaped, b)
		if b == byte(term.TELNET_IAC) {
			escaped = append(escaped, b)
		}
	}
	return escaped
}

func (m *CLIBridgeModule) waitForExit(sess *Session, user *users.UserRecord) {
	sess.Cmd.Wait()
	close(sess.Done)

	sess.mu.Lock()
	sess.PtyFile.Close()
	sess.PtyFile = nil
	sess.mu.Unlock()

	m.removeSession(sess.ConnectionId)

	connDetails := connections.Get(sess.ConnectionId)
	if connDetails != nil {
		connDetails.OutputSuppressed(false)
		connDetails.RemoveInputHandler("CLIBridge")
	}

	if user != nil {
		user.SendText("\n[CLI tool exited. Returning to game.]")
		events.AddToQueue(events.RedrawPrompt{UserId: sess.UserId})
	}
}

func (m *CLIBridgeModule) onWindowChange(connId connections.ConnectionId, cols, rows uint32) {
	sess := m.getSession(connId)
	if sess == nil {
		return
	}

	sess.mu.Lock()
	defer sess.mu.Unlock()

	if sess.PtyFile != nil {
		pty.Setsize(sess.PtyFile, &pty.Winsize{
			Cols: uint16(cols),
			Rows: uint16(rows),
		})
	}
}

func (m *CLIBridgeModule) onAutoComplete(req suggestions.AutoCompleteRequest) suggestions.AutoCompleteRequest {
	if req.Cmd != `cli` {
		return req
	}

	if len(req.Parts) == 2 {
		toolPrefix := strings.ToLower(req.Parts[1])
		for _, tool := range m.getAllowedTools() {
			if strings.HasPrefix(strings.ToLower(tool), toolPrefix) {
				req.Results = append(req.Results, tool[len(toolPrefix):])
			}
		}
		return req
	}

	if len(req.Parts) < 3 {
		return req
	}

	partial := req.Parts[len(req.Parts)-1]
	dataDir := configs.GetFilePathsConfig().DataFiles.String()

	var searchDir string
	var prefix string

	if partial == `` || strings.HasSuffix(partial, `/`) {
		searchDir = filepath.Join(dataDir, partial)
		prefix = ``
	} else {
		searchDir = filepath.Join(dataDir, filepath.Dir(partial))
		prefix = strings.ToLower(filepath.Base(partial))
	}

	entries, err := os.ReadDir(searchDir)
	if err != nil {
		return req
	}

	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(strings.ToLower(name), prefix) {
			continue
		}
		suffix := name[len(prefix):]
		if entry.IsDir() {
			suffix += `/`
		}
		req.Results = append(req.Results, suffix)
	}

	return req
}

func (m *CLIBridgeModule) stopSession(sess *Session) {
	sess.mu.Lock()
	defer sess.mu.Unlock()

	if sess.Cmd.Process != nil {
		sess.Cmd.Process.Signal(syscall.SIGTERM)
		go func() {
			select {
			case <-sess.Done:
			case <-time.After(5 * time.Second):
				sess.Cmd.Process.Kill()
			}
		}()
	}
}
