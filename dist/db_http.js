//#region src/http.js
/**
* Creates an HTTP client instance with encapsulated state and configuration.
* @param {Object} defaultConfig - Initial settings (headers, timeout, base URL, etc.)
*/
function createHttpClient(defaultConfig = {}) {
	let state = {
		baseUrl: defaultConfig.baseUrl || "",
		method: (defaultConfig.method || "GET").toUpperCase(),
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json",
			...defaultConfig.headers || {}
		},
		timeout: defaultConfig.timeout || 1e4,
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
			if (value !== void 0 && value !== null) {
				if (Array.isArray(value)) value.forEach((val) => searchParams.append(key, val));
				else searchParams.append(key, value);
			}
		});
		const queryString = searchParams.toString();
		return queryString ? `?${queryString}` : "";
	}
	/**
	* Internal Core Request Handler
	*/
	async function request(endpoint, options = {}) {
		const method = (options.method || state.method).toUpperCase();
		let requestConfig = {
			url: `${state.baseUrl}${endpoint}`,
			method,
			headers: {
				...state.headers,
				...options.headers || {}
			}
		};
		if (method !== "GET" && method !== "HEAD") {
			const bodyData = options.body !== void 0 ? options.body : options.bodyObj;
			if (bodyData) requestConfig.body = typeof bodyData === "string" ? bodyData : JSON.stringify(bodyData);
		}
		const controller = new AbortController();
		const timeoutMs = options.timeout || state.timeout;
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
		requestConfig.signal = controller.signal;
		for (const interceptor of state.interceptors.request) requestConfig = await interceptor(requestConfig) || requestConfig;
		const { url, ...fetchOptions } = requestConfig;
		try {
			let response = await fetch(url, fetchOptions);
			clearTimeout(timeoutId);
			for (const interceptor of state.interceptors.response) response = await interceptor(response) || response;
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				const error = /* @__PURE__ */ new Error(`HTTP ${response.status}: ${response.statusText}`);
				error.status = response.status;
				error.data = errorData;
				throw error;
			}
			if (response.status === 204) return null;
			return await response.json();
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === "AbortError") throw new Error(`Request timed out after ${timeoutMs}ms`);
			throw error;
		}
	}
	function createProxyInterceptor(proxyUrl) {
		return (config) => ({
			...config,
			url: `${proxyUrl}${encodeURIComponent(config.url)}`
		});
	}
	return {
		sendRequest: request,
		get(endpoint, params = {}, options = {}) {
			return request(`${endpoint}${buildQueryString(params)}`, {
				...options,
				method: "GET"
			});
		},
		post(endpoint, body = {}, options = {}) {
			return request(endpoint, {
				...options,
				method: "POST",
				body
			});
		},
		put(endpoint, body = {}, options = {}) {
			return request(endpoint, {
				...options,
				method: "PUT",
				body
			});
		},
		patch(endpoint, body = {}, options = {}) {
			return request(endpoint, {
				...options,
				method: "PATCH",
				body
			});
		},
		delete(endpoint, options = {}) {
			return request(endpoint, {
				...options,
				method: "DELETE"
			});
		},
		setHeaders(headers = {}) {
			state.headers = {
				...state.headers,
				...headers
			};
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
		addRequestInterceptor(fn) {
			state.interceptors.request.push(fn);
			return this;
		},
		addResponseInterceptor(fn) {
			state.interceptors.response.push(fn);
			return this;
		},
		createProxyInterceptor,
		buildQueryString
	};
}
//#endregion
export { createHttpClient };
