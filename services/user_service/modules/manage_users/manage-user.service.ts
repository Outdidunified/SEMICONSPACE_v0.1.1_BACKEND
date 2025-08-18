import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { ManageUser } from "./manage-user.model";
import { Profile } from "../../models/profile.model";
import { CreateManageUserDto } from "./dto/create-manage-user.dto";
import { UpdateManageUserDto } from "./dto/update-manage-user.dto";
import { ProducerService } from "../../kafka/producer.service";
import { Op } from "sequelize";

@Injectable()
export class ManageUserService {
  constructor(
    @InjectModel(ManageUser)
    private readonly userModel: typeof ManageUser,
    @InjectModel(Profile)
    private readonly profileModel: typeof Profile,
    private readonly producerService: ProducerService
  ) {}

  // ✅ Shared validation for email & phone uniqueness
  private async validateUniqueEmailPhone(
    email: string,
    phone: string,
    excludeUserId?: string
  ) {
    const where: any = {
      [Op.or]: [{ email }, { phone }],
    };
    if (excludeUserId) {
      where.userId = { [Op.ne]: excludeUserId };
    }

    const existingUser = await this.userModel.findOne({ where });
    if (existingUser) {
      if (existingUser.email === email) {
        return "Email already exists";
      }
      if (existingUser.phone === phone) {
        return "Phone number already exists";
      }
    }
    return null;
  }

  // ✅ Create user in users table and emit Kafka
async create(dto: CreateManageUserDto) {
  try {
    // Validate email and phone uniqueness
    const errorMsg = await this.validateUniqueEmailPhone(dto.email, dto.phone);
    if (errorMsg) {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: true,
        message: errorMsg,
      };
    }

    // Prepare new user data
    const newUserData = {
      first_name: dto.first_name,
      last_name: dto.last_name,
      email: dto.email,
      phone: dto.phone,
      password: dto.password,
      role: dto.role,
      role_id: dto.role_id,
      created_by: dto.created_by,
      created_at: new Date(), // creation timestamp
      modified_date: null, // explicitly set to null at creation
    };

    const new_user = await this.userModel.create(newUserData);

    // Produce Kafka (or other message bus) event
    await this.producerService.produceEvent('user.created', {
      userId: new_user.userId,
      first_name: new_user.first_name,
      last_name: new_user.last_name,
      email: new_user.email,
      password:new_user.password,
      phone: new_user.phone,
      role: new_user.role,
      role_id: new_user.role_id,
      created_at: new_user.created_at?.toISOString(),
      created_by: new_user.created_by,
    });

    return {
      statusCode: HttpStatus.OK,
      error: false,
      message: 'User created successfully',
      data: new_user,
    };
  } catch (error) {
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      error: true,
      message: 'User creation failed: ' + (error.message || 'Unknown error'),
    };
  }
}


  // 🔍 Get all profiles from profile_details table
  async findAll() {
    try {
      const allProfiles = await this.profileModel.findAll({
        order: [["created_at", "DESC"]],
      });
      return {
        statusCode: HttpStatus.OK,
        error: false,
        message: "Profiles fetched successfully",
        data: allProfiles,
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: "Failed to fetch profiles",
      };
    }
  }

  // 🔍 Get single profile by userId
  async findOne(userId: string) {
    try {
      const profile = await this.profileModel.findByPk(userId);
      if (!profile) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: true,
          message: "Profile not found",
        };
      }
      return {
        statusCode: HttpStatus.OK,
        error: false,
        message: "Profile fetched successfully",
        data: profile,
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: "Failed to fetch profile",
      };
    }
  }

  // 📦 Add to manage-user.service.ts

  async getUserStats() {
    try {
      const total = await this.profileModel.count();
      const active = await this.profileModel.count({ where: { status: true } });
      const inactive = await this.profileModel.count({
        where: { status: false },
      });

      return {
        statusCode: HttpStatus.OK,
        error: false,
        message: "User stats fetched successfully",
        data: {
          total,
          active,
          inactive,
        },
      };
    } catch (error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: "Failed to fetch user stats",
      };
    }
  }
// ✏️ Update user

// ✏️ Update user
async update(
  userId: string,
  dto: UpdateManageUserDto & { modified_by: string }
) {
  try {
    // Validate userId format
    if (!userId || userId.trim() === '') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: true,
        message: "Invalid user ID provided",
      };
    }

    // Validate modified_by
    if (!dto.modified_by || dto.modified_by.trim() === '') {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: true,
        message: "Modified by field is required",
      };
    }

    const profile = await this.profileModel.findByPk(userId);
    if (!profile) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        error: true,
        message: "User profile not found",
      };
    }

    // 🚫 Email immutability check
    if (dto.email && dto.email !== profile.email) {
      return {
        statusCode: HttpStatus.FORBIDDEN,
        error: true,
        message: "Email modification is not allowed",
      };
    }

    let phoneChanged = false;
    let passwordChanged = false;
    let statusChanged = false;

    // 📞 Phone validation and uniqueness check
    if (dto.phone !== undefined) {
      if (dto.phone.trim() === '') {
        return {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: true,
          message: "Phone number cannot be empty",
        };
      }

      if (dto.phone !== profile.phone) {
        const existingPhone = await this.profileModel.findOne({
          where: {
            phone: dto.phone,
            userId: { [Op.ne]: userId },
          },
        });

        if (existingPhone) {
          return {
            statusCode: HttpStatus.CONFLICT,
            error: true,
            message: "Phone number is already registered to another user",
          };
        }
        phoneChanged = true;
      }
    }

    // 🔑 Password validation and change detection
    if (dto.password !== undefined) {
      if (dto.password.trim() === '') {
        return {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: true,
          message: "Password cannot be empty",
        };
      }

      if (dto.password !== profile.password) {
        passwordChanged = true;
      }
    }

    // 🔄 Status validation and change detection
    if (dto.status !== undefined) {
      if (typeof dto.status !== 'boolean') {
        return {
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: true,
          message: "Status must be a boolean value (true/false)",
        };
      }

      if (dto.status !== profile.status) {
        statusChanged = true;
      }
    }

    // 📝 Detect general field changes
    const fieldChanges = [
      "first_name",
      "last_name",
      "role",
      "role_id",
    ].some((key) => dto[key] !== undefined && dto[key] !== profile[key]);

    const hasAnyChanges = fieldChanges || phoneChanged || passwordChanged || statusChanged;

    if (!hasAnyChanges) {
      return {
        statusCode: HttpStatus.NOT_MODIFIED,
        error: true,
        message: "No changes detected in the provided data",
      };
    }

    // ✅ Perform update
    const updateResult = await this.profileModel.update(
      {
        ...dto,
        email: profile.email, // Preserve original email
        modified_by: dto.modified_by,
        modified_date: new Date(),
      },
      { 
        where: { userId },
        returning: true
      }
    );

    if (updateResult[0] === 0) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: "Failed to update user profile",
      };
    }

    const updated = await this.profileModel.findByPk(userId);
    if (!updated) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: "Updated profile could not be retrieved",
      };
    }

    // 📢 Produce Kafka events for specific changes
    try {
      if (statusChanged) {
        await this.producerService.produceEvent("user.status.updated", {
          userId: updated.userId,
          email: updated.email,
          oldStatus: profile.status,
          newStatus: updated.status,
          modifiedBy: dto.modified_by,
          modifiedDate: updated.modified_date,
        });
      }

      if (phoneChanged) {
        await this.producerService.produceEvent("user.phone.updated", {
          userId: updated.userId,
          email: updated.email,
          oldPhone: profile.phone,
          newPhone: updated.phone,
          modifiedBy: dto.modified_by,
          modifiedDate: updated.modified_date,
        });
      }

      if (passwordChanged) {
        await this.producerService.produceEvent("user.password.updated", {
          userId: updated.userId,
          email: updated.email,
          password: dto.password,
          modifiedBy: dto.modified_by,
          modifiedDate: updated.modified_date,
        });
      }
    } catch (kafkaError) {
      console.error("Kafka event publishing failed:", kafkaError);
      // Continue execution - don't fail the update due to Kafka issues
    }

    // Build dynamic success message
    const changeMessages = [];
    if (statusChanged) {
      changeMessages.push(`status changed to ${dto.status ? "Active" : "Inactive"}`);
    }
    if (phoneChanged) {
      changeMessages.push("phone number updated");
    }
    if (passwordChanged) {
      changeMessages.push("password updated");
    }
    if (fieldChanges) {
      changeMessages.push("profile information updated");
    }

    return {
      statusCode: HttpStatus.OK,
      error: false,
      message: `User profile updated successfully${changeMessages.length > 0 ? ` - ${changeMessages.join(", ")}` : ""}`,
      data: updated,
    };

  } catch (error) {
    console.error("Update error:", error);
    
    // Handle specific database errors
    if (error.name === "SequelizeUniqueConstraintError") {
      return {
        statusCode: HttpStatus.CONFLICT,
        error: true,
        message: "Unique constraint violation - data already exists",
      };
    }
    
    if (error.name === "SequelizeValidationError") {
      return {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: true,
        message: `Validation failed: ${error.message}`,
      };
    }
    
    if (error.name === "SequelizeDatabaseError") {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: "Database operation failed",
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: true,
      message: "An unexpected error occurred during profile update",
    };
  }
}
  // // 🚦 Toggle user status
  // async toggleStatus(userId: string, status: boolean, modifiedBy: string) {
  //   try {
  //     const profile = await this.profileModel.findByPk(userId);
  //     if (!profile) {
  //       return {
  //         statusCode: HttpStatus.NOT_FOUND,
  //         error: true,
  //         message: 'Profile not found',
  //       };
  //     }

  //     if (profile.status === status) {
  //       return {
  //         statusCode: HttpStatus.BAD_REQUEST,
  //         error: true,
  //         message: `User is already ${status ? 'active' : 'inactive'}`,
  //       };
  //     }

  //     await this.profileModel.update(
  //       { status, modified_by: modifiedBy, modified_date: new Date() },
  //       { where: { userId } },
  //     );

  //     return {
  //       statusCode: HttpStatus.OK,
  //       error: false,
  //       message: `User ${status ? 'activated' : 'deactivated'} successfully`,
  //     };
  //   } catch (error) {
  //     return {
  //       statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  //       error: true,
  //       message: 'Failed to update user status',
  //     };
  //   }
  // }
}
