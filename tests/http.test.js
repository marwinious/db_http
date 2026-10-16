import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { createHttpClient } from "../src/http.js"

describe("createHttpClient", () => {
    let client

    beforeEach(() => {
        // Reset global fetch mock before each test
        globalThis.fetch = vi.fn()
        client = createHttpClient({ baseUrl: "https://api.example.com" })
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    describe("buildQueryString", () => {
        it("should format simple key-value pairs correctly", () => {
            const query = client.buildQueryString({ search: "vitest", page: 1 })
            expect(query).toBe("?search=vitest&page=1")
        })

        it("should handle array parameters", () => {
            const query = client.buildQueryString({ tag: ["js", "testing"] })
            expect(query).toBe("?tag=js&tag=testing")
        })

        it("should ignore null and undefined values", () => {
            const query = client.buildQueryString({
                active: true,
                empty: null,
                missing: undefined,
            })
            expect(query).toBe("?active=true")
        })

        it("should return an empty string when params object is empty", () => {
            expect(client.buildQueryString({})).toBe("")
        })
    })

    describe("REST Shorthand Methods", () => {
        it("GET - should make a GET request with query params", async () => {
            const mockResponse = { data: "success" }
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse,
            })

            const result = await client.get("/users", { limit: 10 })

            expect(globalThis.fetch).toHaveBeenCalledWith(
                "https://api.example.com/users?limit=10",
                expect.objectContaining({
                    method: "GET",
                    headers: expect.objectContaining({
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    }),
                }),
            )
            expect(result).toEqual(mockResponse)
        })

        it("POST - should send JSON stringified body for non-GET requests", async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                status: 201,
                json: async () => ({ id: 123 }),
            })

            const payload = { name: "Darius" }
            await client.post("/users", payload)

            expect(globalThis.fetch).toHaveBeenCalledWith(
                "https://api.example.com/users",
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify(payload),
                }),
            )
        })

        it("PUT, PATCH, DELETE - should invoke correct HTTP verbs", async () => {
            globalThis.fetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => ({ success: true }),
            })

            await client.put("/users/1", { name: "Updated" })
            expect(globalThis.fetch).toHaveBeenLastCalledWith(
                "https://api.example.com/users/1",
                expect.objectContaining({ method: "PUT" }),
            )

            await client.patch("/users/1", { name: "Patched" })
            expect(globalThis.fetch).toHaveBeenLastCalledWith(
                "https://api.example.com/users/1",
                expect.objectContaining({ method: "PATCH" }),
            )

            await client.delete("/users/1")
            expect(globalThis.fetch).toHaveBeenLastCalledWith(
                "https://api.example.com/users/1",
                expect.objectContaining({ method: "DELETE" }),
            )
        })

        it("204 No Content - should return null without parsing JSON", async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                status: 204,
            })

            const response = await client.delete("/users/1")
            expect(response).toBeNull()
        })
    })

    describe("Interceptors Pipeline", () => {
        it("should execute request interceptors and mutate config before fetch", async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({}),
            })

            client.addRequestInterceptor((config) => {
                config.headers["Authorization"] = "Bearer secret-token"
                return config
            })

            await client.get("/protected")

            expect(globalThis.fetch).toHaveBeenCalledWith(
                "https://api.example.com/protected",
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: "Bearer secret-token",
                    }),
                }),
            )
        })

        it("should execute response interceptors", async () => {
            const rawResponse = {
                ok: true,
                status: 200,
                json: async () => ({ message: "ok" }),
            }
            globalThis.fetch.mockResolvedValueOnce(rawResponse)

            const interceptorSpy = vi.fn((res) => res)
            client.addResponseInterceptor(interceptorSpy)

            await client.get("/test")

            expect(interceptorSpy).toHaveBeenCalledWith(rawResponse)
        })
    })

    describe("Error & Timeout Handling", () => {
        it("should throw an error with HTTP status and attached payload on non-ok status", async () => {
            const errorPayload = { message: "Invalid credentials" }

            // Use mockResolvedValue (or set it before each call) so fetch can be called multiple times in one test
            globalThis.fetch.mockResolvedValue({
                ok: false,
                status: 400,
                statusText: "Bad Request",
                json: async () => errorPayload,
            })

            // 1. Verify exception throwing
            await expect(client.get("/login")).rejects.toThrow(
                "HTTP 400: Bad Request",
            )

            // 2. Verify custom status and data properties attached to the error object
            try {
                await client.get("/login")
            } catch (err) {
                expect(err.status).toBe(400)
                expect(err.data).toEqual(errorPayload)
            }
        })

        it("should abort request and throw timeout error when request exceeds timeout duration", async () => {
            vi.useFakeTimers()

            // Mock fetch that hangs until aborted
            globalThis.fetch.mockImplementationOnce((url, options) => {
                return new Promise((resolve, reject) => {
                    options.signal.addEventListener("abort", () => {
                        const abortError = new Error(
                            "The operation was aborted",
                        )
                        abortError.name = "AbortError"
                        reject(abortError)
                    })
                })
            })

            const requestPromise = client.get(
                "/slow-endpoint",
                {},
                { timeout: 1000 },
            )

            // Fast-forward time to trigger timeout
            vi.advanceTimersByTime(1001)

            await expect(requestPromise).rejects.toThrow(
                "Request timed out after 1000ms",
            )
        })
    })

    describe("Configuration Mutations", () => {
        it("should allow chainable setter configuration updates", async () => {
            globalThis.fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({}),
            })

            client
                .setBaseUrl("https://api.v2.com")
                .setHeader("X-Custom-Header", "Value1")
                .setHeaders({ "X-Another-Header": "Value2" })

            await client.get("/endpoint")

            expect(globalThis.fetch).toHaveBeenCalledWith(
                "https://api.v2.com/endpoint",
                expect.objectContaining({
                    headers: expect.objectContaining({
                        "X-Custom-Header": "Value1",
                        "X-Another-Header": "Value2",
                    }),
                }),
            )
        })
    })
})
