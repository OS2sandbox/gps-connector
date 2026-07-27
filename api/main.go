package main

import (
	"log"

	"os2/gps-connector/api/internal/server"
)

func main() {
	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}
