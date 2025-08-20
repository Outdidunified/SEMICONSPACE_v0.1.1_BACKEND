import Joi from 'joi';

// Joi schema for creating a role
// Note: role_id is system-managed; we do not accept it from client
export const createRoleSchema = Joi.object({
  role_name: Joi.string().trim().min(2).max(100).required().messages({
    'string.empty': 'role_name is required',
    'any.required': 'role_name is required',
  }),
  created_by: Joi.string().trim().min(1).required().messages({
    'string.empty': 'created_by is required',
    'any.required': 'created_by is required',
  }),
  permissions: Joi.array()
    .items(
      Joi.object({
        module: Joi.string().trim().required(),
        actions: Joi.array()
          .items(Joi.string().valid('create', 'view', 'update', 'delete', 'list'))
          .min(1)
          .required(),
      })
    )
    .optional(),
}).unknown(false); // strip unknown is handled by the pipe, but we disallow unknown here too