package mqauth

import (
	"log"
	"net/http"
	"regexp"
	"strings"

	"os2/gps-connector/api/internal/device"
	"os2/gps-connector/api/internal/redis"
)

var cvrPattern = regexp.MustCompile(`^\d{8}$`)

func HandleUser() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			deny(w)
			return
		}
		if !cvrPattern.MatchString(r.PostFormValue("username")) {
			deny(w)
			return
		}
		allow(w)
	}
}

func HandleVhost() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			deny(w)
			return
		}
		if r.PostFormValue("vhost") != "/" {
			deny(w)
			return
		}
		allow(w)
	}
}

func HandleResource() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			deny(w)
			return
		}
		resource := r.PostFormValue("resource")
		name := r.PostFormValue("name")
		permission := r.PostFormValue("permission")
		if resource == "exchange" && name == "amq.topic" &&
			(permission == "write" || permission == "configure" || permission == "read") {
			allow(w)
			return
		}
		if resource == "queue" && strings.HasPrefix(name, "mqtt-subscription-") {
			allow(w)
			return
		}
		deny(w)
	}
}

func HandleTopic(rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			deny(w)
			return
		}
		username := r.PostFormValue("username")
		routingKey := r.PostFormValue("routing_key")

		var imei string
		parts := strings.Split(routingKey, ".")
		switch {
		case len(parts) == 3 && parts[0] == "teltonika" && parts[2] == "data":
			imei = parts[1]
		case len(parts) == 2 && parts[1] == "commands":
			imei = parts[0]
		default:
			deny(w)
			return
		}

		tenant, exists, err := device.GetDeviceTenant(r.Context(), rdb, imei)
		if err != nil {
			log.Printf("mqauth/topic: redis lookup failed for imei=%s: %v", imei, err)
			deny(w)
			return
		}
		if !exists || tenant != username {
			deny(w)
			return
		}
		allow(w)
	}
}

func allow(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("allow"))
}

func deny(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("deny"))
}
