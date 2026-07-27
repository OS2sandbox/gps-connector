package device

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"os2/gps-connector/api/internal/auth"
	"os2/gps-connector/api/internal/iotagent"
	"os2/gps-connector/api/internal/orion"
	"os2/gps-connector/api/internal/pki"
	"os2/gps-connector/api/internal/rabbitmq"
	"os2/gps-connector/api/internal/redis"
	"os2/gps-connector/api/internal/respond"
)

func HandleCreate(agent *iotagent.Agent, oc *orion.Client, rdb *redis.Client, caStore *pki.TenantCAStore, mq *rabbitmq.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:write") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		tenant := c.CVR

		ca, err := caStore.GetOrCreate(r.Context(), tenant)
		if err != nil {
			log.Printf("ensure tenant CA for %s: %v", tenant, err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}

		var req createDevicesRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if len(req.Devices) == 0 {
			http.Error(w, "devices array is empty", http.StatusBadRequest)
			return
		}
		seen := make(map[string]struct{})
		for i, d := range req.Devices {
			if err := d.validate(); err != nil {
				http.Error(w, fmt.Sprintf("devices[%d]: %s", i, err), http.StatusBadRequest)
				return
			}
			if _, dup := seen[d.IMEI]; dup {
				http.Error(w, fmt.Sprintf("devices[%d]: duplicate imei %s", i, d.IMEI), http.StatusBadRequest)
				return
			}
			seen[d.IMEI] = struct{}{}
		}
		byServiceGroup := make(map[serviceGroupKey][]DeviceInput)
		bySubscription := make(map[string]struct{})
		for _, d := range req.Devices {
			k := serviceGroupKey{tenant, d.DeviceType}
			byServiceGroup[k] = append(byServiceGroup[k], d)
			bySubscription[tenant] = struct{}{}
		}

		resp := createDevicesResponse{
			Provisioned: provisioning{
				ServiceGroupsCreated: []string{},
				SubscriptionsCreated: []string{},
			},
			Results: make([]Result, 0, len(req.Devices)),
		}
		bundles := make(map[string]string)

		failedGroups := make(map[serviceGroupKey]string)
		for k := range byServiceGroup {
			exists, err := agent.ServiceGroupExists(k.Tenant, k.DeviceType)
			if err != nil {
				failedGroups[k] = "iot agent error: " + err.Error()
				continue
			}
			if exists {
				continue
			}
			if err := agent.CreateServiceGroup(k.Tenant, k.DeviceType); err != nil {
				failedGroups[k] = "create service group: " + err.Error()
				continue
			}
			log.Printf("created service group for %s-%s", k.Tenant, k.DeviceType)
			resp.Provisioned.ServiceGroupsCreated = append(
				resp.Provisioned.ServiceGroupsCreated,
				fmt.Sprintf("%s-%s", k.Tenant, k.DeviceType),
			)
		}

		failedTenants := make(map[string]string)
		for tenant := range bySubscription {
			exists, err := oc.SubscriptionExists(tenant)
			if err != nil {
				failedTenants[tenant] = "OrionLD error: " + err.Error()
				continue
			}
			if exists {
				continue
			}
			if err := oc.CreateSubscription(tenant); err != nil {
				failedTenants[tenant] = "create subscription: " + err.Error()
				continue
			}
			log.Printf("created subscription for %s", tenant)
			resp.Provisioned.SubscriptionsCreated = append(
				resp.Provisioned.SubscriptionsCreated,
				tenant,
			)
		}
		for k, devices := range byServiceGroup {
			if errMsg, ok := failedGroups[k]; ok {
				for _, d := range devices {
					resp.Results = append(resp.Results, Result{
						IMEI: d.IMEI, Status: "error", Error: errMsg,
					})
				}
				continue
			}
			if errMsg, ok := failedTenants[k.Tenant]; ok {
				for _, d := range devices {
					resp.Results = append(resp.Results, Result{
						IMEI: d.IMEI, Status: "error", Error: errMsg,
					})
				}
				continue
			}

			var toProvision []string
			for _, d := range devices {
				existingTenant, exists, err := getDeviceTenant(r.Context(), rdb, d.IMEI)
				if err != nil {
					resp.Results = append(resp.Results, Result{
						IMEI: d.IMEI, Status: "error",
						Error: "redis error: " + err.Error(),
					})
					continue
				}
				if exists {
					if existingTenant == tenant {
						if err := mq.CreateDeviceUser(r.Context(), d.IMEI); err != nil {
							log.Printf("reconcile rabbitmq user for %s: %v", d.IMEI, err)
						}
						resp.Results = append(resp.Results, Result{
							IMEI: d.IMEI, Status: "already_registered",
						})
					} else {
						log.Printf("conflict: imei %s already registered to %s, requested by %s",
							d.IMEI, existingTenant, tenant)
						resp.Results = append(resp.Results, Result{
							IMEI: d.IMEI, Status: "error",
							Error: "imei already registered to another tenant",
						})
					}
					continue
				}
				toProvision = append(toProvision, d.IMEI)
			}

			if len(toProvision) == 0 {
				continue
			}
			if err := agent.CreateDevices(k.Tenant, k.DeviceType, toProvision); err != nil {
				for _, imei := range toProvision {
					resp.Results = append(resp.Results, Result{
						IMEI: imei, Status: "error",
						Error: "create device: " + err.Error(),
					})
				}
				continue
			}
			log.Printf("provisioned %d devices in iot agent for %s-%s",
				len(toProvision), k.Tenant, k.DeviceType)

			for _, imei := range toProvision {
				if err := setDeviceTenant(r.Context(), rdb, imei, k.Tenant); err != nil {
					resp.Results = append(resp.Results, Result{
						IMEI: imei, Status: "error",
						Error: "redis error: " + err.Error(),
					})
					continue
				}
				if err := oc.CreateEntity(k.Tenant, imei); err != nil {
					resp.Results = append(resp.Results, Result{
						IMEI: imei, Status: "error",
						Error: "orion error: " + err.Error(),
					})
					continue
				}
				bundle, err := pki.GenerateDeviceCert(ca, caStore.Root, imei)
				if err != nil {
					log.Printf("gen device cert for %s: %v", imei, err)
					resp.Results = append(resp.Results, Result{
						IMEI: imei, Status: "error",
						Error: "cert generation failed",
					})
					continue
				}
				if err := mq.CreateDeviceUser(r.Context(), imei); err != nil {
					log.Printf("create rabbitmq user for %s: %v", imei, err)
					resp.Results = append(resp.Results, Result{
						IMEI: imei, Status: "error",
						Error: "broker user provisioning failed",
					})
					continue
				}
				bundles[imei] = string(bundle)
				resp.Results = append(resp.Results, Result{
					IMEI: imei, Status: "created",
				})
			}
		}

		if len(bundles) > 0 {
			info, err := pki.StoreCertBatch(r.Context(), rdb, tenant, bundles)
			if err != nil {
				log.Printf("store cert batch: %v", err)
				http.Error(w, "internal error", http.StatusInternalServerError)
				return
			}
			resp.CertDownload = info
		}

		status := http.StatusOK
		for _, res := range resp.Results {
			if res.Status == "error" {
				status = http.StatusMultiStatus
				break
			}
		}
		respond.JSON(w, status, resp)
	}
}

func HandleGet(oc *orion.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:read") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}

		devices, err := oc.QueryDevices(c.CVR)
		if err != nil {
			http.Error(w, "orion error: "+err.Error(), http.StatusBadGateway)
			return
		}

		respond.JSON(w, http.StatusOK, getDevicesResponse{Devices: devices})
	}
}

func HandleUpdate(oc *orion.Client, rdb *redis.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:write") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		tenant := c.CVR

		var req updateDevicesRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if len(req.Updates) == 0 {
			http.Error(w, "updates array is empty", http.StatusBadRequest)
			return
		}

		seen := make(map[string]struct{})
		for i, u := range req.Updates {
			if u.IMEI == "" {
				http.Error(w, fmt.Sprintf("updates[%d]: imei is required", i), http.StatusBadRequest)
				return
			}
			if len(u.IMEI) != 15 {
				http.Error(w, fmt.Sprintf("updates[%d]: imei must be 15 digits", i), http.StatusBadRequest)
				return
			}
			if _, dup := seen[u.IMEI]; dup {
				http.Error(w, fmt.Sprintf("updates[%d]: duplicate imei %s", i, u.IMEI), http.StatusBadRequest)
				return
			}
			seen[u.IMEI] = struct{}{}
		}

		results := make([]Result, 0, len(req.Updates))
		for _, u := range req.Updates {
			existingTenant, exists, err := getDeviceTenant(r.Context(), rdb, u.IMEI)
			if err != nil {
				results = append(results, Result{
					IMEI: u.IMEI, Status: "error",
					Error: "redis error: " + err.Error(),
				})
				continue
			}
			if !exists {
				results = append(results, Result{
					IMEI: u.IMEI, Status: "not_found",
				})
				continue
			}
			if existingTenant != tenant {
				log.Printf("tenant %s tried to update imei %s belonging to another tenant", tenant, u.IMEI)
				results = append(results, Result{
					IMEI: u.IMEI, Status: "not_found",
				})
				continue
			}
			if err := oc.UpdateEntity(tenant, u.IMEI, u.Metadata); err != nil {
				results = append(results, Result{
					IMEI: u.IMEI, Status: "error",
					Error: "orion error: " + err.Error(),
				})
				continue
			}
			results = append(results, Result{
				IMEI: u.IMEI, Status: "updated",
			})
		}

		status := http.StatusOK
		for _, res := range results {
			if res.Status != "updated" {
				status = http.StatusMultiStatus
				break
			}
		}
		respond.JSON(w, status, updateDevicesResponse{Results: results})
	}
}

func HandleDelete(agent *iotagent.Agent, oc *orion.Client, rdb *redis.Client, mq *rabbitmq.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		privs, ok := auth.PrivilegesFromContext(r.Context())
		if !ok || !privs.Has("urn:dk:kombit:gps-connector:write") {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		c, ok := auth.ClaimsFromContext(r.Context())
		if !ok {
			http.Error(w, "no claims in context", http.StatusInternalServerError)
			return
		}
		tenant := c.CVR

		var req deleteDevicesRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON", http.StatusBadRequest)
			return
		}
		if len(req.IMEIs) == 0 {
			http.Error(w, "imeis array is empty", http.StatusBadRequest)
			return
		}
		seen := make(map[string]struct{})
		for i, imei := range req.IMEIs {
			if len(imei) != 15 {
				http.Error(w, fmt.Sprintf("imeis[%d]: imei must be 15 digits", i), http.StatusBadRequest)
				return
			}
			if _, dup := seen[imei]; dup {
				http.Error(w, fmt.Sprintf("imeis[%d]: duplicate imei %s", i, imei), http.StatusBadRequest)
				return
			}
			seen[imei] = struct{}{}
		}

		results := make([]Result, 0, len(req.IMEIs))
		for _, imei := range req.IMEIs {
			existingTenant, exists, err := getDeviceTenant(r.Context(), rdb, imei)
			if err != nil {
				results = append(results, Result{
					IMEI: imei, Status: "error",
					Error: "redis error: " + err.Error(),
				})
				continue
			}
			if !exists || existingTenant != tenant {
				if exists {
					log.Printf("tenant %s tried to delete imei %s belonging to another tenant", tenant, imei)
				}
				results = append(results, Result{IMEI: imei, Status: "not_found"})
				continue
			}
			if err := agent.DeleteDevice(tenant, imei); err != nil {
				results = append(results, Result{
					IMEI: imei, Status: "error",
					Error: "iot agent error: " + err.Error(),
				})
				continue
			}
			if err := oc.DeleteEntity(tenant, imei); err != nil {
				results = append(results, Result{
					IMEI: imei, Status: "error",
					Error: "orion error: " + err.Error(),
				})
				continue
			}
			if err := mq.DeleteDeviceUser(r.Context(), imei); err != nil {
				results = append(results, Result{
					IMEI: imei, Status: "error",
					Error: "broker user deletion failed",
				})
				continue
			}
			if err := deleteDeviceTenantMapping(r.Context(), rdb, imei); err != nil {
				results = append(results, Result{
					IMEI: imei, Status: "error",
					Error: "redis error: " + err.Error(),
				})
				continue
			}
			results = append(results, Result{IMEI: imei, Status: "deleted"})
		}

		status := http.StatusOK
		for _, res := range results {
			if res.Status != "deleted" {
				status = http.StatusMultiStatus
				break
			}
		}
		respond.JSON(w, status, deleteDevicesResponse{Results: results})
	}
}
