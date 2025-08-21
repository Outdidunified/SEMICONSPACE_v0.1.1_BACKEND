import * as Joi from 'joi';

// Joi schema for creating a user
export const createUserSchema = Joi.object({
  first_name: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.empty': 'First name is required',
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name must not exceed 50 characters',
      'string.pattern.base': 'First name must contain only letters and spaces',
    }),

  last_name: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .required()
    .messages({
      'string.empty': 'Last name is required',
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name must not exceed 50 characters',
      'string.pattern.base': 'Last name must contain only letters and spaces',
    }),

  email: Joi.string()
    .email({ tlds: { allow: false } })
    .trim()
    .lowercase()
    .required()
    .messages({
      'string.empty': 'Email is required',
      'string.email': 'Please provide a valid email address',
    }),

  phone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .required()
    .messages({
      'string.empty': 'Phone number is required',
      'string.pattern.base': 'Please provide a valid phone number',
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
    .required()
    .messages({
      'string.empty': 'Password is required',
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }),

  role: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      'string.empty': 'Role is required',
      'string.min': 'Role must be at least 2 characters long',
      'string.max': 'Role must not exceed 50 characters',
    }),

  role_id: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.base': 'Role ID must be a number',
      'number.integer': 'Role ID must be an integer',
      'number.positive': 'Role ID must be a positive number',
      'any.required': 'Role ID is required',
    }),

  created_by: Joi.string()
    .email({ tlds: { allow: false } })
    .trim()
    .lowercase()
    .required()
    .messages({
      'string.empty': 'Created by is required',
      'string.email': 'Created by must be a valid email address',
    }),
});

// Joi schema for updating a user
export const updateUserSchema = Joi.object({
  userId: Joi.string()
    .uuid()
    .required()
    .messages({
      'string.empty': 'User ID is required',
      'string.guid': 'User ID must be a valid UUID',
    }),

  first_name: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .optional()
    .messages({
      'string.min': 'First name must be at least 2 characters long',
      'string.max': 'First name must not exceed 50 characters',
      'string.pattern.base': 'First name must contain only letters and spaces',
    }),

  last_name: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-zA-Z\s]+$/)
    .optional()
    .messages({
      'string.min': 'Last name must be at least 2 characters long',
      'string.max': 'Last name must not exceed 50 characters',
      'string.pattern.base': 'Last name must contain only letters and spaces',
    }),

  email: Joi.string()
    .email({ tlds: { allow: false } })
    .trim()
    .lowercase()
    .optional()
    .messages({
      'string.email': 'Please provide a valid email address',
    }),

  phone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Please provide a valid phone number',
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .optional()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }),

  role: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .optional()
    .messages({
      'string.min': 'Role must be at least 2 characters long',
      'string.max': 'Role must not exceed 50 characters',
    }),

  role_id: Joi.number()
    .integer()
    .positive()
    .optional()
    .messages({
      'number.base': 'Role ID must be a number',
      'number.integer': 'Role ID must be an integer',
      'number.positive': 'Role ID must be a positive number',
    }),

  modified_by: Joi.string()
    .email({ tlds: { allow: false } })
    .trim()
    .lowercase()
    .required()
    .messages({
      'string.empty': 'Modified by is required',
      'string.email': 'Modified by must be a valid email address',
      'any.required': 'Modified by is required',
    }),

  status: Joi.boolean()
    .optional()
    .messages({
      'boolean.base': 'Status must be a boolean value (true/false)',
    }),
});

// Joi schema for getting a user by ID, email, or phone
export const getUserSchema = Joi.object({
  userId: Joi.string()
    .uuid()
    .allow(null)
    .optional()
    .messages({
      'string.guid': 'User ID must be a valid UUID format',
    }),
  
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null)
    .optional()
    .messages({
      'string.email': 'Email must be a valid email format',
    }),
  
  phone: Joi.string()
    .pattern(/^[\+]?[1-9][\d]{0,15}$/)
    .allow(null)
    .optional()
    .messages({
      'string.pattern.base': 'Phone must be a valid phone number format',
    }),
}).custom((value, helpers) => {
  // At least one field must be provided and not null
  const { userId, email, phone } = value;
  
  if (!userId && !email && !phone) {
    return helpers.error('custom.atLeastOne');
  }
  
  return value;
}).messages({
  'custom.atLeastOne': 'At least one of userId, email, or phone must be provided',
});

// Joi schema for pagination and filtering
export const getUsersQuerySchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .optional(),

  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .optional(),

  search: Joi.string()
    .trim()
    .max(100)
    .optional(),

  role: Joi.string()
    .trim()
    .max(50)
    .optional(),

  sortBy: Joi.string()
    .valid('first_name', 'last_name', 'email', 'created_at', 'role')
    .default('created_at')
    .optional(),

  sortOrder: Joi.string()
    .valid('ASC', 'DESC')
    .default('DESC')
    .optional(),
});