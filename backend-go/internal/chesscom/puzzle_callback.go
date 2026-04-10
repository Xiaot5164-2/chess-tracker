package chesscom

import (
	"net/http"
	"time"
)

// 公开页面使用的 callback；须使用单斜杠 …/puzzles/{username}（双斜杠会退回 HTML 404）。
const puzzleCurrentURL = "https://www.chess.com/callback/stats/tactics2/new/puzzles/"

// PuzzleCallbackClient 拉取谜题 callback；每次请求受 Client.Timeout 与调用方 context 约束。
type PuzzleCallbackClient struct {
	http *http.Client
}

func NewPuzzleCallbackClient(requestTimeout time.Duration) *PuzzleCallbackClient {
	if requestTimeout < 3*time.Second {
		requestTimeout = 3 * time.Second
	}
	return &PuzzleCallbackClient{
		http: &http.Client{Timeout: requestTimeout},
	}
}
