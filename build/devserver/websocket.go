package main

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/sirupsen/logrus"
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
	go wh.read()
	go wh.write()
}

func (h *wshandler) read() {
	defer h.conn.Close()
	for {
		mt, _, err := h.conn.ReadMessage()
		if err != nil {
			logrus.Errorln("websocket.ReadMessage:", err)
			break
		}
		logrus.Infoln("Message:", mt)
	}
}

func (h *wshandler) write() {
	defer h.conn.Close()
	ch := make(chan *buildState, 10)
	d := h.handler.code.addListener(ch)
	defer h.handler.code.removeListener(ch)
	if err := h.send(d); err != nil {
		logrus.Error("send:", err)
		return
	}
	t := time.NewTicker(pingInterval)
	defer t.Stop()
	for {
		select {
		case d, ok := <-ch:
			if !ok {
				return
			}
			if err := h.send(d); err != nil {
				logrus.Error("send:", err)
				return
			}
		case <-t.C:
			h.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
			if err := h.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				logrus.Error("ping:", err)
				return
			}
		}
	}
}

type buildMessage struct {
	State string `json:"state,omitempty"`
	Error string `json:"error,omitempty"`
}

func (h *wshandler) send(d *buildState) error {
	var m buildMessage
	if d.err == nil {
		if len(d.html) > 0 {
			m.State = "ok"
		} else {
			m.State = "building"
		}
	} else {
		m.State = "fail"
		m.Error = d.err.Error()
	}
	md, err := json.Marshal(&m)
	if err != nil {
		return err
	}
	h.conn.SetWriteDeadline(time.Now().Add(writeTimeout))
	return h.conn.WriteMessage(websocket.TextMessage, md)
}
