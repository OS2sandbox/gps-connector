package device

import (
	"context"
	"errors"
	"fmt"

	"os2/gps-connector/api/internal/redis"
)

func deviceTenantKey(imei string) string {
	return fmt.Sprintf("device:%s", imei)
}

func GetDeviceTenant(ctx context.Context, rdb *redis.Client, imei string) (string, bool, error) {
	tenant, err := rdb.Get(ctx, deviceTenantKey(imei)).Result()
	if errors.Is(err, redis.Nil) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return tenant, true, nil
}

func setDeviceTenant(ctx context.Context, rdb *redis.Client, imei, tenant string) error {
	return rdb.Set(ctx, deviceTenantKey(imei), tenant, 0).Err()
}

func deleteDeviceTenantMapping(ctx context.Context, rdb *redis.Client, imei string) error {
	return rdb.Del(ctx, deviceTenantKey(imei)).Err()
}
