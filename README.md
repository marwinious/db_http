# Lightweight Closure-Based HTTP Client

A modern, zero-dependency HTTP client factory built with closures for JavaScript/TypeScript applications. Designed as an abstraction layer between application logic and network requests, it provides clean state encapsulation, composable middleware/interceptors, automatic query parameter handling, and built-in request timeouts.

---

## Features

- **Closure-Based State Encapsulation:** No `this`-binding issues or class instantiation overhead.
- **Shorthand REST Methods:** Clean `.get()`, `.post()`, `.put()`, `.patch()`, and `.delete()` helpers.
- **Request & Response Interceptors:** Attach middleware pipelines for authentication headers, global error handling, logging, caching, or token refreshing.
- **Safe Query Parameters:** Built-in `buildQueryString` helper powered by native `URLSearchParams` (handles encoding, arrays, and strips nullish values).
- **Timeout Management:** Built-in `AbortController` cancellation support to prevent hanging requests.
- **Robust Error Handling:** Automatically rejects non-2xx HTTP status codes with structured error objects (`err.status`, `err.data`).
- **Chainable Configuration:** Flexible configuration setters (`setBaseUrl`, `setHeader`, `setHeaders`).
- **Zero External Dependencies:** Built on native Web APIs (`fetch`, `AbortController`, `URLSearchParams`).

---

## Installation

Simply copy `http.js` into your project or import it from your internal shared library package:

```javascript
import { createHttpClient } from './http.js';
```

---

## Quickstart

```javascript
import { createHttpClient } from './http.js';

// Initialize a client instance
const api = createHttpClient({
    baseUrl: 'https://api.example.com/v1',
    timeout: 5000, // 5 seconds
    headers: {
        'X-App-Client': 'Web'
    }
});

// GET Request with query parameters -> GET /v1/users?status=active&page=1
async function loadUsers() {
    try {
        const users = await api.get('/users', { status: 'active', page: 1 });
        console.log('Users:', users);
    } catch (error) {
        console.error(`Error (${error.status}):`, error.message);
    }
}

// POST Request with body data
async function createUser(userData) {
    try {
        const newUser = await api.post('/users', userData);
        console.log('Created:', newUser);
    } catch (error) {
        console.error('Failed to create user:', error.data);
    }
}
```

---

## Interceptors (Middleware)

Interceptors allow you to inspect or transform requests before they are sent, or responses before they are returned to your calling code.

### Request Interceptor: Automatic Auth Bearer Token
```javascript
api.addRequestInterceptor((config) => {
    const token = localStorage.getItem('authToken');
    
    if (token) {
        config.headers = {
            ...config.headers,
            'Authorization': `Bearer ${token}`
        };
    }
    
    return config;
});
```

### Response Interceptor: Global 401 Handling & Refresh Logic
```javascript
api.addResponseInterceptor(async (response) => {
    if (response.status === 401) {
        console.warn('Unauthorized request. Redirecting to login...');
        window.location.href = '/login';
    }
    return response;
});
```

---

## API Reference

### `createHttpClient(defaultConfig)`

Factory function that creates a new HTTP client instance.

#### Parameters (`defaultConfig` options)
| Property | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `baseUrl` | `string` | `''` | Base URL prepended to all endpoint paths. |
| `method` | `string` | `'GET'` | Default HTTP method. |
| `headers` | `object` | `{ 'Content-Type': 'application/json', 'Accept': 'application/json' }` | Default request headers. |
| `timeout` | `number` | `10000` | Request timeout in milliseconds (10s default). |

---

### Instance Methods

#### Core Requests
- **`sendRequest(endpoint, options)`**: Core request function executing the underlying `fetch` pipeline.

#### REST Shortcuts
- **`get(endpoint, params, options)`**: Sends a GET request. `params` are formatted via `buildQueryString`.
- **`post(endpoint, body, options)`**: Sends a POST request with `body` JSON-stringified automatically.
- **`put(endpoint, body, options)`**: Sends a PUT request.
- **`patch(endpoint, body, options)`**: Sends a PATCH request.
- **`delete(endpoint, options)`**: Sends a DELETE request.

#### Configuration Mutators (Chainable)
- **`setBaseUrl(url)`**: Updates the client base URL.
- **`setHeader(key, value)`**: Sets or updates a single request header.
- **`setHeaders(headersObj)`**: Merges an object of headers into the existing default headers.

#### Interceptors Pipeline (Chainable)
- **`addRequestInterceptor(fn)`**: Registers an async function `(config) => config` executed prior to sending requests.
- **`addResponseInterceptor(fn)`**: Registers an async function `(response) => response` executed upon receiving responses.

#### Utilities
- **`buildQueryString(params)`**: Converts a JavaScript object into a sanitized URL query string.

---

## Error Handling

When an HTTP response status is outside the range `200–299` (i.e., `!response.ok`), the client throws a structured `Error` object containing response context:

```javascript
try {
    await api.get('/protected-route');
} catch (error) {
    console.log(error.message); // "HTTP 403: Forbidden"
    console.log(error.status);  // 403
    console.log(error.data);    // Parsed JSON response body from the server
}
```

---

## Running Unit Tests

Unit tests are written using [Vitest](https://vitest.dev/).

```bash
# Run tests once
npm run test

# Run tests in watch mode
npx vitest
```

---

## License

[MIT](LICENSE)