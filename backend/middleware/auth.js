const jwt = require('jsonwebtoken');

/**
 * JWT Authentication Middleware
 * Validates 'Authorization: Bearer <token>' header
 */
module.exports = (req, res, next) => {
  // Get token from auth header
  const authHeader = req.header('Authorization');
  
  if (!authHeader) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access Denied: No Authorization header provided.' 
    });
  }

  // Expect Bearer <token>
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ 
      success: false, 
      message: 'Access Denied: Header format must be "Bearer <token>"' 
    });
  }

  const token = parts[1];

  try {
    const jwtSecret = process.env.JWT_SECRET || '9upi_geometric_balance_secret_key_2026';
    const verified = jwt.verify(token, jwtSecret);
    
    // Attach decoded user claims (userId, role) to the request object
    req.user = verified;
    next();
  } catch (error) {
    return res.status(403).json({ 
      success: false, 
      message: 'Invalid or Expired Token.' 
    });
  }
};
