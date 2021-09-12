package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"

	"moria.us/js13k/build/song"
	"moria.us/js13k/build/watcher"
)

const (
	pingInterval = 30 * time.Second
	writeTimeout = 60 * time.Second
)

var upgrader = websocket.Upgrader{}

type wshandler struct {
	handler *handler
	conn    *websocket.Conn
}

func serveSocket(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h := getHandler(ctx)
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logrus.Errorln("Upgrade:", err)
		return
	}
	wh := wshandler{
		handler: h,
		conn:    c,
	}
	endch := make(chan struct{})
	go wh.read(endch)
	go wh.write(endch)
}

func (h *wshandler) read(endch chan struct{}) {
	defer close(endch)
	for {
		mt, _, err := h.conn.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				logrus.Errorln("Websocket read:", err)
			}
			break
		}
		logrus.Infoln("Websocket message:", mt)
	}
}

var msgMusic []byte

func (h *wshandler) write(endch chan struct{}) {
	const chansize = 4
	defer h.conn.Close()

	bch := make(chan *buildState, chansize)
	bd := h.handler.code.addListener(bch)
	defer h.handler.code.removeListener(bch)

	mch := make(chan *watcher.SongState, chansize)
	md := h.handler.music.addListener(mch)
	defer h.handler.music.removeListener(mch)

	if err := h.send(&devserverMessage{
		Build: makeBuildMessage(bd),
		Music: makeMusicMessage(md),
	}); err != nil {
		logrus.Error("Websocket send:", err)
		return
	}

	t := time.NewTicker(pingInterval)
	defer t.Stop()
	for {
		select {
		case bd, ok := <-bch:
			if !ok {
				return
			}
			if err := h.send(&devserverMessage{Build: makeBuildMessage(bd)}); err != nil {
				logrus.Error("Websocket send:", err)
				return
			}
		case md, ok := <-mch:
			if !ok {
				return
			}
			if err := h.send(&devserverMessage{Music: makeMusicMessage(md)}); err != nil {
				logrus.Error("Websocket send:", err)
				return
			}
		case <-t.C:
			h.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := h.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				logrus.Error("Websocket ping:", err)
				return
			}
		case <-endch:
			return
		}
	}
}

type buildMessage struct {
	State string `json:"state,omitempty"`
	Error string `json:"error,omitempty"`
}

func makeBuildMessage(d *buildState) *buildMessage {
	var m buildMessage
	switch {
	case d == nil:
		m.State = "building"
	case d.err != nil:
		m.State = "fail"
		m.Error = d.err.Error()
	case d.data == nil:
		m.State = "building"
	default:
		m.State = "ok"
	}
	return &m
}

type musicMessage struct {
	*song.Compiled
	Error string `json:"error,omitempty"`
}

func makeMusicMessage(d *watcher.SongState) *musicMessage {
	var m musicMessage
	if d.Err != nil {
		m.Error = d.Err.Error()
	} else {
		m.Compiled = d.Compiled
	}
	return &m
}

type devserverMessage struct {
	Build *buildMessage `json:"build,omitempty"`
	Music *musicMessage `json:"music,omitempty"`
}

func (h *wshandler) send(m *devserverMessage) error {
	md, err := json.Marshal(m)
	if err != nil {
		return err
	}
	h.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	return h.conn.WriteMessage(websocket.TextMessage, md)
}
