const { admin } = require('../services/firebase-service');

// Track last error to prevent spam
let lastAuthError = null;
let lastAuthErrorTime = 0;

// Authentication middleware - verifies Firebase ID token
async function authenticateUser(req, res, next) {
    try {
        let authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                error: 'No authorization header provided' 
            });
        }

        const idToken = authHeader.substring(7);

        try {
            // Verify the ID token (checkRevoked = true)
            const decodedToken = await admin.auth().verifyIdToken(idToken, true);
            
            // Success - clear tracking
            lastAuthError = null;
            
            // Attach user info to request
            req.user = {
                uid: decodedToken.uid,
                email: decodedToken.email
            };
            
            req.userId = decodedToken.uid;
            next();
        } catch (error) {
            const errorCode = error.code || error.message;
            const now = Date.now();
            
            // Only log if the error is different or after 1 minute of same error
            if (errorCode !== lastAuthError || now - lastAuthErrorTime > 60000) {
                console.error('[Auth] Token Verification Failed:', errorCode);
                lastAuthError = errorCode;
                lastAuthErrorTime = now;
            }

            return res.status(401).json({ 
                success: false, 
                error: 'Invalid or expired token' 
            });
        }

    } catch (error) {
        console.error('[Auth Middleware] Unexpected Error:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Authentication error' 
        });
    }
}

module.exports = { authenticateUser };