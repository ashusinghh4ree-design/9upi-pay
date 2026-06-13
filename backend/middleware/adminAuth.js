/**
 * Role-Based Access Control Middleware (RBAC)
 * Enforces administrative access constraints for Super Admin, Admin, Moderator, and Support Staff.
 * Securely blocks standard users from loading administrative endpoints.
 */
module.exports = {
  allowRoles: (allowedRoles = []) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access Denied: Session context missing.'
        });
      }

      const userRole = req.user.role;

      // Allow if user role falls within the permitted roles for the given route
      if (allowedRoles.includes(userRole)) {
        return next();
      }

      return res.status(403).json({
        success: false,
        message: `Forbidden Access Exception: Restricted route. Role '${userRole}' does not hold clearance.`
      });
    };
  }
};
