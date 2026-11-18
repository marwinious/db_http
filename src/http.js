/**
 * Creates an HTTP client instance with encapsulated state and configuration.
 * @param {Object} defaultConfig - Initial settings (headers, timeout, base URL, etc.)
 */
export function createHttpClient(defaultConfig = {}) {
    // Encapsulated state (private to this instance closure)
    let state = {
        baseUrl: defaultConfig.baseUrl || '',
        method: (defaultConfig.method || 'GET').toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(defaultConfig.headers || {})
        },
        timeout: defaultConfig.timeout || 10000,
        interceptors: {
            request: [],
            response: []
        }
    };

    /**
     * Helper to construct URL query strings safely using URLSearchParams.
     * Handles encoding automatically and strips trailing/leading delimiter issues.
     */
    function buildQueryString(params = {}) {
        const searchParams = new URLSearchParams();
        
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                if (Array.isArray(value)) {
                    value.forEach(val => searchParams.append(key, val));
                } else {
                    searchParams.append(key, value);
                }
            }
        });

        const queryString = searchParams.toString();
        return queryString ? `?${queryString}` : '';
    }

    /**
     * Internal Core Request Handler
     */
    async function request(endpoint, options = {}) {
        const method = (options.method || state.method).toUpperCase();

        let requestConfig = {
            url: `${state.baseUrl}${endpoint}`,
            method,
            headers: { ...state.headers, ...(options.headers || {}) },
        };

        // Attach request body for non-GET/HEAD methods
        if (method !== 'GET' && method !== 'HEAD') {
            const bodyData = options.body !== undefined ? options.body : options.bodyObj;
            if (bodyData) {
                requestConfig.body = typeof bodyData === 'string' 
                    ? bodyData 
                    : JSON.stringify(bodyData);
            }
        }

        // Timeout signal handling
        const controller = new AbortController();
        const timeoutMs = options.timeout || state.timeout;
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        requestConfig.signal = controller.signal;

        // Run request interceptors
        for (const interceptor of state.interceptors.request) {
            requestConfig = await interceptor(requestConfig) || requestConfig;
        }

        // Destructure url out so we don't pass an extra property into fetch()'s init object
        const { url, ...fetchOptions } = requestConfig;

        try {
            // 3. Fetch using the (potentially transformed) url
            let response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            // Run response interceptors (e.g., logging, metrics, token refresh)
            for (const interceptor of state.interceptors.response) {
                response = await interceptor(response) || response;
            }

            // HTTP Error handling (fetch doesn't reject on 4xx/5xx by default)
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                error.data = errorData;
                throw error;
            }

            // Handle empty responses (204 No Content) safely
            if (response.status === 204) {
                return null;
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms`);
            }
            throw error;
        }
    }

    // Optional reusable helper to run requests through a proxy url, for things like CORS
    /*
        EXAMPLE USAGE:

        import { createHttpClient } from './http.js';

        const api = createHttpClient({
            baseUrl: 'https://api.targetdomain.com'
        });

        // Plug in the proxy behavior in one readable line
        api.addRequestInterceptor(
            api.createProxyInterceptor('https://yourdomain.com/proxy.php?url=')
        );

        // Every method (.get, .post, .put, .delete) automatically builds the full target URL
        // with query params first, then encodes and routes it through your PHP/proxy script:
        const data = await api.get('/events', { widgetid: '123', eventid: '456' });
    */
    function createProxyInterceptor(proxyUrl) {
        return (config) => ({
            ...config,
            url: `${proxyUrl}${encodeURIComponent(config.url)}`
        });
    }

    // Public API returned by factory
    return {
        // Core request executor
        sendRequest: request,

        // Shorthand REST convenience methods
        get(endpoint, params = {}, options = {}) {
            const queryString = buildQueryString(params);
            return request(`${endpoint}${queryString}`, { ...options, method: 'GET' });
        },

        post(endpoint, body = {}, options = {}) {
            return request(endpoint, { ...options, method: 'POST', body });
        },

        put(endpoint, body = {}, options = {}) {
            return request(endpoint, { ...options, method: 'PUT', body });
        },

        patch(endpoint, body = {}, options = {}) {
            return request(endpoint, { ...options, method: 'PATCH', body });
        },

        delete(endpoint, options = {}) {
            return request(endpoint, { ...options, method: 'DELETE' });
        },

        // Configuration mutations (Chainable)
        setHeaders(headers = {}) {
            state.headers = { ...state.headers, ...headers };
            return this;
        },

        setHeader(key, value) {
            state.headers[key] = value;
            return this;
        },

        setBaseUrl(url) {
            state.baseUrl = url;
            return this;
        },

        // Interceptors extension hook
        addRequestInterceptor(fn) {
            state.interceptors.request.push(fn);
            return this;
        },

        addResponseInterceptor(fn) {
            state.interceptors.response.push(fn);
            return this;
        },

        createProxyInterceptor,

        // Expose utility function
        buildQueryString
    };
}