// frontend/lib/api.js (enhanced version)

import ErrorHandler from '../utils/errorHandler';

// Get API URL from runtime config or fallback
const getApiBaseUrl = () => {
    if (typeof window !== 'undefined') {
        console.log('[DEBUG] All window API properties:', {
            __API_BASE_URL__: window.__API_BASE_URL__,
            location_origin: window.location.origin,
            location_hostname: window.location.hostname
        });

        if (window.__API_BASE_URL__) {
            return window.__API_BASE_URL__;
        }
    }
    return 'http://localhost:8080/api/v1'; // fallback for development
};

const DEFAULT_TIMEOUT = 120000; // 30 seconds default timeout

/**
 * Enhanced API client for the CKS application
 */
class ApiClient {
    /**
     * Performs a fetch request with standardized error handling
     * @param {string} url - API endpoint path
     * @param {Object} options - Fetch options
     * @param {number} timeout - Request timeout in ms
     * @returns {Promise<any>} - Parsed response
     */
    async fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
        const controller = new AbortController();
        const { signal } = controller;

        // Add debug logging
        const fullUrl = `${getApiBaseUrl()}${url}`;
        console.log('[API] Request:', options.method || 'GET', fullUrl);
        console.log('[API] getApiBaseUrl() returned:', getApiBaseUrl());
        console.log('[API] window.__API_BASE_URL__:', typeof window !== 'undefined' ? window.__API_BASE_URL__ : 'undefined (server)');

        // Set up timeout
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeout);

        try {
            const response = await fetch(fullUrl, {
                ...options,
                signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            // Clear timeout since request completed
            clearTimeout(timeoutId);

            // Log response status
            console.log('[API] Response:', response.status, response.statusText);

            // Handle HTTP errors
            if (!response.ok) {
                const error = new Error(`API request failed: ${response.status} ${response.statusText}`);
                error.status = response.status;
                error.url = url;
                error.method = options.method || 'GET';

                try {
                    error.info = await response.json();
                    console.log('[API] Error details:', error.info);
                } catch (e) {
                    error.info = { message: response.statusText };
                }

                // Process through error handler
                throw ErrorHandler.processApiError(error, `api:${url}`);
            }

            // Return null for 204 No Content
            if (response.status === 204) {
                return null;
            }

            const data = await response.json();
            console.log('[API] Success:', data);
            return data;
        } catch (error) {            // Clear timeout if there's an error
            clearTimeout(timeoutId);
            console.error('[API] Error:', error);
            // Handle abort error (timeout)
            if (error.name === 'AbortError') {
                const timeoutError = new Error(`Request timed out after ${timeout}ms`);
                timeoutError.status = 408; // Request Timeout
                timeoutError.isTimeout = true;
                timeoutError.url = url;

                // Process through error handler
                throw ErrorHandler.processApiError(timeoutError, `api:${url}:timeout`);
            }

            // If error is already processed, rethrow it
            if (error.hasBeenProcessed) {
                throw error;
            }

            // Enhance error with more context
            error.endpoint = url;
            error.requestOptions = { ...options, body: options.body ? '[REDACTED]' : undefined };

            // Process through error handler
            throw ErrorHandler.processApiError(error, `api:${url}`);
        }
    }

    /**
     * Performs a request with retry capability for network errors
     * @param {string} url - API endpoint path
     * @param {Object} options - Fetch options
     * @param {number} retries - Number of retries for network errors
     * @param {number} timeout - Request timeout in ms
     * @returns {Promise<any>} - Parsed response
     */
    async fetchWithRetry(url, options = {}, retries = 2, timeout = DEFAULT_TIMEOUT) {
        try {
            return await this.fetchWithTimeout(url, options, timeout);
        } catch (error) {
            // Only retry for network errors and timeouts, not HTTP errors
            if (retries > 0 && (error.name === 'TypeError' || error.isTimeout)) {
                console.log(`Retrying API call to ${url}, ${retries} attempts left`);
                // Exponential backoff
                const delay = 1000 * Math.pow(2, 3 - retries);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.fetchWithRetry(url, options, retries - 1, timeout);
            }
            throw error;
        }
    }

    // Session endpoints
    sessions = {
        /**
         * Create a new session
         * @param {string} scenarioId - ID of the scenario
         * @returns {Promise<Object>} - Session data
         */
        create: (scenarioId) => this.fetchWithRetry('/sessions', {
            method: 'POST',
            body: JSON.stringify({ scenarioId })
        }),

        /**
         * Get session details
         * @param {string} id - Session ID
         * @returns {Promise<Object>} - Session data
         */
        get: (id) => this.fetchWithRetry(`/sessions/${id}`),

        /**
         * List all sessions
         * @returns {Promise<Array>} - List of sessions
         */
        list: () => this.fetchWithRetry('/sessions'),

        /**
         * Delete a session
         * @param {string} id - Session ID
         * @returns {Promise<null>} - Success indicator
         */
        delete: (id) => this.fetchWithRetry(`/sessions/${id}`, {
            method: 'DELETE'
        }),

        /**
         * Extend a session's expiration time
         * @param {string} id - Session ID
         * @param {number} minutes - Minutes to extend
         * @returns {Promise<Object>} - Updated session data
         */
        extend: (id, minutes = 30) => this.fetchWithRetry(`/sessions/${id}/extend`, {
            method: 'PUT',
            body: JSON.stringify({ minutes })
        }),

        /**
         * Get tasks for a session
         * @param {string} id - Session ID
         * @returns {Promise<Array>} - List of tasks
         */
        getTasks: (id) => this.fetchWithRetry(`/sessions/${id}/tasks`)
    };

    // Scenario endpoints
    scenarios = {
        /**
         * List scenarios with optional filtering
         * @param {Object} params - Filter parameters
         * @returns {Promise<Array>} - List of scenarios
         */
        list: (params = {}) => {
            const queryParams = new URLSearchParams();
            if (params.category) queryParams.append('category', params.category);
            if (params.difficulty) queryParams.append('difficulty', params.difficulty);
            if (params.search) queryParams.append('search', params.search);

            const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
            return this.fetchWithRetry(`/scenarios${query}`);
        },

        /**
         * Get scenario details
         * @param {string} id - Scenario ID
         * @returns {Promise<Object>} - Scenario data
         */
        get: (id) => this.fetchWithRetry(`/scenarios/${id}`),

        /**
         * Get scenario categories
         * @returns {Promise<Object>} - Categories mapping
         */
        categories: () => this.fetchWithRetry('/scenarios/categories')
    };

    // Terminal endpoints
    terminals = {
        /**
         * Create a terminal session
         * @param {string} sessionId - Session ID
         * @param {string} target - Terminal target (control-plane or worker-node)
         * @returns {Promise<Object>} - Terminal session data
         */
        create: (sessionId, target) => this.fetchWithRetry(`/sessions/${sessionId}/terminals`, {
            method: 'POST',
            body: JSON.stringify({ target })
        }),

    };

    // Task endpoints
    tasks = {
        /**
         * Validate a task
         * @param {string} sessionId - Session ID
         * @param {string} taskId - Task ID
         * @returns {Promise<Object>} - Validation results
         */
        validate: (sessionId, taskId) => this.fetchWithRetry(`/sessions/${sessionId}/tasks/${taskId}/validate`, {
            method: 'POST'
        }, 1, 120000), // Longer timeout for validation (60s) with 1 retry
        getValidationRules: (scenarioId, taskId) => this.fetchWithRetry(`/scenarios/${scenarioId}/tasks/${taskId}/validation`),
    };
    // Admin endpoints
    admin = {
        /**
         * Get all clusters status and details
         * @returns {Promise<Object>} - Clusters data with stats and details
         */
        getClusters: () => this.fetchWithRetry('/admin/clusters'),

        /**
         * Get all active sessions (admin view)
         * @returns {Promise<Object>} - Sessions data with stats
         */
        getSessions: () => this.fetchWithRetry('/admin/sessions'),

        /**
         * Release all clusters
         * @returns {Promise<Object>} - Operation result
         */
        releaseAllClusters: () => this.fetchWithRetry('/admin/release-all-clusters', {
            method: 'POST'
        }),

        /**
         * Destroy all cluster resources (clean slate)
         * @returns {Promise<Object>} - Operation result
         */
        destroyPool: () => this.fetchWithRetry('/admin/destroy-pool', {
            method: 'POST'
        }, 1, 600000),

        /**
         * Bootstrap cluster pool (create VMs from scratch)
         * @returns {Promise<Object>} - Operation result
         */
        bootstrapPool: () => this.fetchWithRetry('/admin/bootstrap-pool', {
            method: 'POST'
        }, 1, 3600000),

        bootstrapCluster: (clusterId) => this.fetchWithRetry(`/admin/clusters/${clusterId}/bootstrap`, {
            method: 'POST'
        }, 1, 3600000),

        destroyCluster: (clusterId) => this.fetchWithRetry(`/admin/clusters/${clusterId}/destroy`, {
            method: 'POST'
        }, 1, 600000),

        /**
         * Delete a session (admin operation)
         * @param {string} sessionId - Session ID to delete
         * @returns {Promise<null>} - Success indicator
         */
        deleteSession: (sessionId) => this.fetchWithRetry(`/sessions/${sessionId}`, {
            method: 'DELETE'
        })
    };
}

// Create and export a singleton instance
const api = new ApiClient();
export default api;