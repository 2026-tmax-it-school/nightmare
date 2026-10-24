// 게임과 정적 서버를 하나의 실행 파일에 포함한다.
package main

import (
	"embed"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
)

//go:embed web
var content embed.FS

var buildID = "development"

const address = "127.0.0.1:18123"
const gameURL = "http://" + address + "/"
const identityPath = "/__nightmare_build"

func openBrowser() error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", gameURL)
	case "darwin":
		cmd = exec.Command("open", gameURL)
	default:
		cmd = exec.Command("xdg-open", gameURL)
	}
	return cmd.Run()
}

func handler() http.Handler {
	root, err := fs.Sub(content, "web")
	if err != nil {
		panic(err)
	}
	// Windows 레지스트리 설정과 무관하게 ES 모듈을 올바르게 제공한다.
	mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	mime.AddExtensionType(".json", "application/json")
	mime.AddExtensionType(".woff2", "font/woff2")
	files := http.FileServer(http.FS(root))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path == identityPath {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			fmt.Fprint(w, "forgotten-classroom:"+buildID)
			return
		}
		// 디렉터리 목록 대신 게임 페이지와 실제 파일만 제공한다.
		if r.URL.Path != "/" {
			f, err := root.Open(r.URL.Path[1:])
			if err != nil {
				http.NotFound(w, r)
				return
			}
			info, err := f.Stat()
			f.Close()
			if err != nil || info.IsDir() {
				http.NotFound(w, r)
				return
			}
		}
		files.ServeHTTP(w, r)
	})
}

func sameInstance() bool {
	client := &http.Client{Timeout: time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Get(gameURL[:len(gameURL)-1] + identityPath)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 256))
	return err == nil && resp.StatusCode == http.StatusOK && string(b) == "forgotten-classroom:"+buildID
}

func main() {
	noBrowser := flag.Bool("no-browser", false, "start server without opening browser")
	flag.Parse()
	listener, err := net.Listen("tcp", address)
	if err != nil {
		if sameInstance() {
			if !*noBrowser {
				if err := openBrowser(); err != nil {
					fmt.Println("Open in your browser:", gameURL)
				}
			}
			return
		}
		fmt.Fprintln(os.Stderr, "Port 18123 is in use. Close the previous game server or the application using this port, then try again.")
		// 더블클릭 실행 시에도 오류를 읽을 수 있도록 기다린다.
		if !*noBrowser {
			fmt.Println("Press Enter to close.")
			fmt.Scanln()
		}
		os.Exit(1)
	}
	server := &http.Server{Handler: handler(), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	}()
	fmt.Println("Forgotten Classroom / 잊힌 교실")
	fmt.Println(gameURL)
	fmt.Println("Keep this window open while playing. Close it or press Ctrl+C to stop the server.")
	if !*noBrowser {
		if err := openBrowser(); err != nil {
			fmt.Println("Browser could not open automatically. Open the address above.")
		}
	}
	select {}
}
