package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"net/url"
	"strconv"

	"github.com/pixfid/go-zaycevnet/api"
)

//go:embed web
var staticFS embed.FS

var zclient *api.ZClient

func init() {
	zclient = api.NewZClient(nil, "", "static_key")
	zclient.Auth()
}

func main() {
	// Подготовка файловой системы для статики (уберем папку web из пути)
	staticSubFS, err := fs.Sub(staticFS, "web")
	if err != nil {
		log.Fatal(err)
	}

	// API-маршруты
	http.HandleFunc("/api/search", corsMiddleware(searchHandler))
	http.HandleFunc("/api/top", corsMiddleware(topHandler))
	http.HandleFunc("/api/track", corsMiddleware(trackHandler))

	// Отдаём статику (HTML, CSS, JS) для всех остальных запросов
	http.Handle("/", http.FileServer(http.FS(staticSubFS)))

	log.Println("🚀 Сервер запущен на http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

// CORS middleware
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

// /api/search?query=...&page=...
func searchHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("query")
	if query == "" {
		http.Error(w, "query required", http.StatusBadRequest)
		return
	}
	page := r.URL.Query().Get("page")
	if page == "" {
		page = "1"
	}
	pageInt, _ := strconv.Atoi(page)
	if pageInt < 1 {
		pageInt = 1
	}

	params := url.Values{}
	params.Add("query", query)
	params.Add("page", strconv.Itoa(pageInt))
	params.Add("type", "all")
	params.Add("sort", "")
	params.Add("style", "")

	result, err := zclient.Search(params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := buildTrackResponse(result.Tracks, result.PagesCount)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// /api/top?page=...
func topHandler(w http.ResponseWriter, r *http.Request) {
	pageStr := r.URL.Query().Get("page")
	if pageStr == "" {
		pageStr = "1"
	}
	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}

	result, err := zclient.Top(page)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	response := buildTrackResponse(result.Tracks, result.PagesCount)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// /api/track?id=...
func trackHandler(w http.ResponseWriter, r *http.Request) {
	idStr := r.URL.Query().Get("id")
	if idStr == "" {
		http.Error(w, "id required", http.StatusBadRequest)
		return
	}
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	track, err := zclient.Track(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Ответ для одного трека (можете использовать тот же формат)
	resp := struct {
		ID     int    `json:"id"`
		Title  string `json:"title"`
		Artist string `json:"artist"`
		Cover  string `json:"cover"`
		MP3    string `json:"mp3"`
	}{
		ID:     track.ID,
		Title:  track.Title,
		Artist: track.Artist.Name,
		Cover:  track.Album.Cover,
		MP3:    track.Mp3,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Вспомогательная функция для формирования ответа (одинаков для search и top)
func buildTrackResponse(tracks []api.Track, pagesCount int) interface{} {
	type TrackItem struct {
		ID     int    `json:"id"`
		Title  string `json:"title"`
		Artist string `json:"artist"`
		Cover  string `json:"cover"`
		MP3    string `json:"mp3"`
	}
	items := make([]TrackItem, 0, len(tracks))
	for _, t := range tracks {
		items = append(items, TrackItem{
			ID:     t.ID,
			Title:  t.Title,
			Artist: t.Artist.Name,
			Cover:  t.Album.Cover,
			MP3:    t.Mp3,
		})
	}
	return struct {
		PagesCount int         `json:"pagesCount"`
		Tracks     []TrackItem `json:"tracks"`
	}{
		PagesCount: pagesCount,
		Tracks:     items,
	}
}
