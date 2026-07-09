package sshlog

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"path"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pkg/sftp"
	"golang.org/x/crypto/ssh"
)

type Credentials struct {
	Host       string
	Port       uint16
	Username   string
	Password   string
	PrivateKey string
	Passphrase string
}

type RemoteEntry struct {
	Name       string `json:"name"`
	Path       string `json:"path"`
	Type       string `json:"type"`
	Size       int64  `json:"size"`
	ModifiedAt int64  `json:"modifiedAt"`
}

type ScanResult struct {
	Entries   []RemoteEntry `json:"entries"`
	Truncated bool          `json:"truncated"`
	MaxDepth  int           `json:"maxDepth"`
	MaxFiles  int           `json:"maxFiles"`
}

type Service struct {
	DialTimeout time.Duration
}

func NewService() *Service {
	return &Service{DialTimeout: 10 * time.Second}
}

func ValidateRemotePath(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || !strings.HasPrefix(trimmed, "/") || strings.ContainsRune(trimmed, 0) {
		return "", fmt.Errorf("remote path must be an absolute path")
	}
	return path.Clean(trimmed), nil
}

func ShellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func (s *Service) Test(ctx context.Context, credentials Credentials) error {
	client, err := s.dial(ctx, credentials)
	if err != nil {
		return err
	}
	defer client.Close()
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("open ssh session: %w", err)
	}
	defer session.Close()
	if err := session.Run("true"); err != nil {
		return fmt.Errorf("test ssh connection: %w", err)
	}
	return nil
}

func (s *Service) Browse(ctx context.Context, credentials Credentials, remotePath string) ([]RemoteEntry, error) {
	safePath, err := ValidateRemotePath(remotePath)
	if err != nil {
		return nil, err
	}
	client, err := s.dial(ctx, credentials)
	if err != nil {
		return nil, err
	}
	defer client.Close()
	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return nil, fmt.Errorf("open sftp client: %w", err)
	}
	defer sftpClient.Close()
	files, err := sftpClient.ReadDir(safePath)
	if err != nil {
		return nil, fmt.Errorf("read remote directory: %w", err)
	}
	entries := make([]RemoteEntry, 0, len(files))
	for _, file := range files {
		entryType := "other"
		switch {
		case file.IsDir():
			entryType = "directory"
		case file.Mode().IsRegular():
			entryType = "file"
		}
		entries = append(entries, RemoteEntry{
			Name:       file.Name(),
			Path:       path.Join(safePath, file.Name()),
			Type:       entryType,
			Size:       file.Size(),
			ModifiedAt: file.ModTime().UnixMilli(),
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Type != entries[j].Type {
			return entries[i].Type == "directory"
		}
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})
	return entries, nil
}

func (s *Service) Scan(ctx context.Context, credentials Credentials, remotePath string, maxDepth, maxFiles int) (ScanResult, error) {
	safePath, err := ValidateRemotePath(remotePath)
	if err != nil {
		return ScanResult{}, err
	}
	if maxDepth <= 0 {
		maxDepth = 8
	}
	if maxDepth > 20 {
		maxDepth = 20
	}
	if maxFiles <= 0 {
		maxFiles = 2000
	}
	if maxFiles > 10000 {
		maxFiles = 10000
	}
	client, err := s.dial(ctx, credentials)
	if err != nil {
		return ScanResult{}, err
	}
	defer client.Close()
	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		return ScanResult{}, fmt.Errorf("open sftp client: %w", err)
	}
	defer sftpClient.Close()

	result := ScanResult{MaxDepth: maxDepth, MaxFiles: maxFiles}
	var walk func(string, int) error
	walk = func(currentPath string, depth int) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if depth > maxDepth || len(result.Entries) >= maxFiles {
			result.Truncated = true
			return nil
		}
		files, err := sftpClient.ReadDir(currentPath)
		if err != nil {
			return nil
		}
		sort.Slice(files, func(i, j int) bool {
			if files[i].IsDir() != files[j].IsDir() {
				return files[i].IsDir()
			}
			return strings.ToLower(files[i].Name()) < strings.ToLower(files[j].Name())
		})
		for _, file := range files {
			if len(result.Entries) >= maxFiles {
				result.Truncated = true
				return nil
			}
			if file.Name() == "." || file.Name() == ".." {
				continue
			}
			nextPath := path.Join(currentPath, file.Name())
			if file.IsDir() {
				if err := walk(nextPath, depth+1); err != nil {
					return err
				}
				continue
			}
			if file.Mode().IsRegular() && IsLogFile(file.Name()) {
				result.Entries = append(result.Entries, RemoteEntry{
					Name:       file.Name(),
					Path:       nextPath,
					Type:       "file",
					Size:       file.Size(),
					ModifiedAt: file.ModTime().UnixMilli(),
				})
			}
		}
		return nil
	}
	if err := walk(safePath, 0); err != nil {
		return ScanResult{}, err
	}
	return result, nil
}

func (s *Service) OpenFile(ctx context.Context, credentials Credentials, remotePath string) (io.ReadCloser, error) {
	safePath, err := ValidateRemotePath(remotePath)
	if err != nil {
		return nil, err
	}
	client, err := s.dial(ctx, credentials)
	if err != nil {
		return nil, err
	}
	sftpClient, err := sftp.NewClient(client)
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("open sftp client: %w", err)
	}
	file, err := sftpClient.Open(safePath)
	if err != nil {
		sftpClient.Close()
		client.Close()
		return nil, fmt.Errorf("open remote file: %w", err)
	}
	return &remoteFileReadCloser{file: file, sftp: sftpClient, client: client}, nil
}

func IsLogFile(name string) bool {
	lower := strings.ToLower(name)
	return strings.HasSuffix(lower, ".log") ||
		strings.HasSuffix(lower, ".txt") ||
		strings.HasSuffix(lower, ".out") ||
		strings.HasSuffix(lower, ".err")
}

func (s *Service) Tail(ctx context.Context, credentials Credentials, remotePath string, lines int, onReady func(), onLine func(string) error) error {
	safePath, err := ValidateRemotePath(remotePath)
	if err != nil {
		return err
	}
	if onLine == nil {
		return errors.New("tail line callback is required")
	}
	if lines < 0 {
		lines = 0
	}
	if lines > 5000 {
		lines = 5000
	}
	client, err := s.dial(ctx, credentials)
	if err != nil {
		return err
	}
	defer client.Close()
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("open ssh session: %w", err)
	}
	defer session.Close()
	stdout, err := session.StdoutPipe()
	if err != nil {
		return fmt.Errorf("open ssh stdout: %w", err)
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return fmt.Errorf("open ssh stderr: %w", err)
	}
	command := "tail -n " + strconv.Itoa(lines) + " -F -- " + ShellQuote(safePath) + " 2>/dev/null || tail -n " + strconv.Itoa(lines) + " -f -- " + ShellQuote(safePath)
	if err := session.Start(command); err != nil {
		return fmt.Errorf("start remote tail: %w", err)
	}
	if onReady != nil {
		onReady()
	}

	lineErr := make(chan error, 1)
	waitErr := make(chan error, 1)
	stderrText := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		scanner.Buffer(make([]byte, 64*1024), 1024*1024)
		for scanner.Scan() {
			if err := onLine(scanner.Text()); err != nil {
				lineErr <- err
				return
			}
		}
		lineErr <- scanner.Err()
	}()
	go func() {
		buffer, _ := io.ReadAll(io.LimitReader(stderr, 4096))
		stderrText <- strings.TrimSpace(string(buffer))
	}()
	go func() {
		waitErr <- session.Wait()
	}()

	select {
	case <-ctx.Done():
		_ = session.Signal(ssh.SIGTERM)
		_ = session.Close()
		return ctx.Err()
	case err := <-lineErr:
		if err != nil {
			_ = session.Signal(ssh.SIGTERM)
			return err
		}
		if err := <-waitErr; err != nil {
			message := <-stderrText
			if message != "" {
				return fmt.Errorf("%s: %w", message, err)
			}
			return err
		}
		return nil
	case err := <-waitErr:
		if err != nil {
			message := <-stderrText
			if message != "" {
				return fmt.Errorf("%s: %w", message, err)
			}
			return err
		}
		return nil
	}
}

type remoteFileReadCloser struct {
	file   *sftp.File
	sftp   *sftp.Client
	client *ssh.Client
}

func (r *remoteFileReadCloser) Read(p []byte) (int, error) {
	return r.file.Read(p)
}

func (r *remoteFileReadCloser) Close() error {
	var errs []error
	if r.file != nil {
		if err := r.file.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if r.sftp != nil {
		if err := r.sftp.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if r.client != nil {
		if err := r.client.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func (s *Service) dial(ctx context.Context, credentials Credentials) (*ssh.Client, error) {
	if err := validateCredentials(credentials); err != nil {
		return nil, err
	}
	config, err := sshClientConfig(credentials)
	if err != nil {
		return nil, err
	}
	timeout := s.DialTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	dialer := net.Dialer{Timeout: timeout}
	address := net.JoinHostPort(credentials.Host, strconv.Itoa(int(credentials.Port)))
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return nil, fmt.Errorf("dial ssh: %w", err)
	}
	deadline := time.Now().Add(timeout)
	_ = conn.SetDeadline(deadline)
	clientConn, chans, reqs, err := ssh.NewClientConn(conn, address, config)
	_ = conn.SetDeadline(time.Time{})
	if err != nil {
		_ = conn.Close()
		return nil, fmt.Errorf("handshake ssh: %w", err)
	}
	return ssh.NewClient(clientConn, chans, reqs), nil
}

func validateCredentials(credentials Credentials) error {
	if strings.TrimSpace(credentials.Host) == "" || credentials.Port == 0 {
		return fmt.Errorf("ssh host and port are required")
	}
	if strings.TrimSpace(credentials.Username) == "" {
		return fmt.Errorf("ssh username is required")
	}
	if strings.TrimSpace(credentials.Password) == "" && strings.TrimSpace(credentials.PrivateKey) == "" {
		return fmt.Errorf("ssh password or private key is required")
	}
	return nil
}

func sshClientConfig(credentials Credentials) (*ssh.ClientConfig, error) {
	auth := make([]ssh.AuthMethod, 0, 2)
	if credentials.PrivateKey != "" {
		signer, err := parseSigner(credentials.PrivateKey, credentials.Passphrase)
		if err != nil {
			return nil, err
		}
		auth = append(auth, ssh.PublicKeys(signer))
	}
	if credentials.Password != "" {
		auth = append(auth, ssh.Password(credentials.Password))
		auth = append(auth, ssh.KeyboardInteractive(func(_ string, _ string, questions []string, _ []bool) ([]string, error) {
			answers := make([]string, len(questions))
			for i := range answers {
				answers[i] = credentials.Password
			}
			return answers, nil
		}))
	}
	return &ssh.ClientConfig{
		User:            credentials.Username,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}, nil
}

func parseSigner(privateKey, passphrase string) (ssh.Signer, error) {
	if passphrase != "" {
		signer, err := ssh.ParsePrivateKeyWithPassphrase([]byte(privateKey), []byte(passphrase))
		if err != nil {
			return nil, fmt.Errorf("parse ssh private key: %w", err)
		}
		return signer, nil
	}
	signer, err := ssh.ParsePrivateKey([]byte(privateKey))
	if err != nil {
		return nil, fmt.Errorf("parse ssh private key: %w", err)
	}
	return signer, nil
}
