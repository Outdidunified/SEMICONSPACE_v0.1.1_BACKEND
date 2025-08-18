const { loggerInfo, loggerWarn, loggerDebug } = require('./logger');

class SessionManager {
    constructor() {
        this.activeSessions = new Map(); // userId -> [{ sessionId, lastActivity, token }]
        this.sessionTokens = new Map(); // sessionId -> { userId, token, lastActivity }

        // Clean up expired sessions every 5 minutes
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 5 * 60 * 1000);
    }

    /**
     * Register a new session for a user - now supports multiple concurrent sessions
     * @param {string} userId 
     * @param {string} sessionId 
     * @param {string} token 
     */
    registerSession(userId, sessionId, token) {
        const now = Date.now();

        // Initialize user's session array if it doesn't exist
        if (!this.activeSessions.has(userId)) {
            this.activeSessions.set(userId, []);
        }

        const userSessions = this.activeSessions.get(userId);

        // Check if this session already exists
        const existingSessionIndex = userSessions.findIndex(s => s.sessionId === sessionId);
        if (existingSessionIndex !== -1) {
            // Update existing session
            userSessions[existingSessionIndex] = {
                sessionId,
                lastActivity: now,
                token
            };
        } else {
            // Add new session
            userSessions.push({
                sessionId,
                lastActivity: now,
                token
            });
        }

        this.sessionTokens.set(sessionId, {
            userId,
            token,
            lastActivity: now
        });

        loggerInfo(`Registered session for user: ${userId}, sessionId: ${sessionId}, total sessions: ${userSessions.length}`);
    }

    /**
     * Check if a session is valid - updated for multiple sessions
     * @param {string} sessionId 
     * @param {string} userId 
     * @returns {boolean}
     */
    isValidSession(sessionId, userId) {
        if (!sessionId || !userId) {
            return false;
        }

        const sessionData = this.sessionTokens.get(sessionId);
        if (!sessionData || sessionData.userId !== userId) {
            return false;
        }

        const userSessions = this.activeSessions.get(userId);
        if (!userSessions) {
            return false;
        }

        const userSession = userSessions.find(s => s.sessionId === sessionId);
        if (!userSession) {
            return false;
        }

        // Update last activity
        const now = Date.now();
        userSession.lastActivity = now;
        sessionData.lastActivity = now;

        return true;
    }

    /**
     * Invalidate a specific session
     * @param {string} sessionId 
     */
    invalidateSession(sessionId) {
        const sessionData = this.sessionTokens.get(sessionId);
        if (sessionData) {
            const userSessions = this.activeSessions.get(sessionData.userId);
            if (userSessions) {
                const filteredSessions = userSessions.filter(s => s.sessionId !== sessionId);
                this.activeSessions.set(sessionData.userId, filteredSessions);
            }
            this.sessionTokens.delete(sessionId);
            loggerInfo(`Invalidated session: ${sessionId} for user: ${sessionData.userId}`);
        }
    }

    /**
     * Clean up expired sessions (older than 2 hours of inactivity)
     */
    cleanupExpiredSessions() {
        const now = Date.now();
        const maxInactivity = 2 * 60 * 60 * 1000; // 2 hours
        let cleanedCount = 0;

        for (const [sessionId, sessionData] of this.sessionTokens.entries()) {
            if (now - sessionData.lastActivity > maxInactivity) {
                const userSessions = this.activeSessions.get(sessionData.userId);
                if (userSessions) {
                    const filteredSessions = userSessions.filter(s => s.sessionId !== sessionId);
                    this.activeSessions.set(sessionData.userId, filteredSessions);
                }
                this.sessionTokens.delete(sessionId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            loggerInfo(`Cleaned up ${cleanedCount} expired sessions`);
        }
    }

    /**
     * Get session statistics
     * @returns {object}
     */
    getStats() {
        let totalSessions = 0;
        for (const sessions of this.activeSessions.values()) {
            totalSessions += sessions.length;
        }

        return {
            activeUsers: this.activeSessions.size,
            totalSessions,
            timestamp: new Date().toISOString()
        };
    }
}

// Create singleton instance
const sessionManager = new SessionManager();

module.exports = { sessionManager };
