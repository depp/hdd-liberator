package watcher

import "time"

// A delay is a timeout that can be retriggered.
type delay struct {
	timer       *time.Timer
	channel     <-chan time.Time
	lastTrigger time.Time
}

// trigger causes the delay to be triggered after the delay passes.
func (d *delay) trigger(dt time.Duration) {
	if d.channel != nil {
		d.lastTrigger = time.Now().Add(dt)
	} else {
		if d.timer == nil {
			d.timer = time.NewTimer(dt)
		} else {
			d.timer.Reset(dt)
		}
		d.channel = d.timer.C
		d.lastTrigger = time.Time{}
	}
}

// remainingTime returns the amount of time remaining before the trigger should
// trigger. Should be called to resolve spurious wakeups.
func (d *delay) remainingTime() time.Duration {
	if d.lastTrigger.IsZero() {
		return 0
	}
	return d.lastTrigger.Sub(time.Now())
}
