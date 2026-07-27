package redis

import goredis "github.com/redis/go-redis/v9"

type Client struct {
	*goredis.Client
}

var Nil = goredis.Nil

func New(addr string) *Client {
	return &Client{Client: goredis.NewClient(&goredis.Options{Addr: addr})}
}
