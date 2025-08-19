const { body, param, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

const validateUserRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('securityQuestion')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('Security question must be between 5 and 200 characters'),
  body('securityAnswer')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Security answer must be between 1 and 100 characters'),
  handleValidationErrors
];

const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

const validateList = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('List name must be between 1 and 200 characters'),
  handleValidationErrors
];

const validateTask = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Task title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high'])
    .withMessage('Priority must be low, medium, or high'),
  body('due_date')
    .optional()
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  handleValidationErrors
];

const validateSubtask = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Subtask title must be between 1 and 200 characters'),
  handleValidationErrors
];

const validateTag = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Tag name must be between 1 and 50 characters'),
  handleValidationErrors
];

const validateId = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer'),
  handleValidationErrors
];

const validateListId = [
  param('listId')
    .isInt({ min: 1 })
    .withMessage('List ID must be a positive integer'),
  handleValidationErrors
];

const validateTaskId = [
  param('taskId')
    .isInt({ min: 1 })
    .withMessage('Task ID must be a positive integer'),
  handleValidationErrors
];

const validateSubtaskId = [
  param('subtaskId')
    .isInt({ min: 1 })
    .withMessage('Subtask ID must be a positive integer'),
  handleValidationErrors
];

const validateListMember = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('role')
    .optional()
    .isIn(['member', 'admin'])
    .withMessage('Role must be member or admin'),
  handleValidationErrors
];

const validatePasswordReset = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('securityAnswer')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Security answer is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long'),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateList,
  validateTask,
  validateSubtask,
  validateTag,
  validateId,
  validateListId,
  validateTaskId,
  validateSubtaskId,
  validateListMember,
  validatePasswordReset,
  handleValidationErrors
};
