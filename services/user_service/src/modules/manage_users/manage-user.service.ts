import { Injectable, HttpException, HttpStatus, ConflictException, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { ManageUser } from "./manage-user.model";
import { Profile } from "../../models/profile.model";
import { CreateManageUserDto } from "./dto/create-manage-user.dto";
import { UpdateManageUserDto } from "./dto/update-manage-user.dto";
import { ProducerService } from "../../kafka/producer.service";
import { Op } from "sequelize";

@Injectable()
export class ManageUserService {
  private readonly logger = new Logger(ManageUserService.name);

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
        throw new ConflictException("Email already exists");
      }
      if (existingUser.phone === phone) {
        throw new ConflictException("Phone number already exists");
      }
    }
  }

  // ✅ Create user in users table and emit Kafka
  async create(dto: CreateManageUserDto): Promise<ManageUser> {
    try {
      // Validate email and phone uniqueness
      await this.validateUniqueEmailPhone(dto.email, dto.phone);

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
        created_at: new Date(),
        modified_date: null,
      };

      const new_user = await this.userModel.create(newUserData);

      // Produce Kafka event (non-blocking)
      try {
        await this.producerService.produceEvent('user.created', {
          userId: new_user.userId,
          first_name: new_user.first_name,
          last_name: new_user.last_name,
          email: new_user.email,
          password: new_user.password,
          phone: new_user.phone,
          role: new_user.role,
          role_id: new_user.role_id,
          created_at: new_user.created_at?.toISOString(),
          created_by: new_user.created_by,
        });
      } catch (kafkaError) {
        this.logger.error('Failed to publish user.created event', kafkaError);
        // Don't fail the operation due to Kafka issues
      }

      this.logger.log(`User created successfully: ${new_user.userId}`);
      return new_user;
    } catch (error) {
      this.logger.error('User creation failed', error);
      throw error; // Let the global error handler manage this
    }
  }


  // 🔍 Get all profiles from profile_details table with pagination and filtering
  async findAll(query: any = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        role,
        sortBy = 'created_at',
        sortOrder = 'DESC'
      } = query;

      const pageNum = parseInt(page.toString());
      const limitNum = parseInt(limit.toString());
      const offset = (pageNum - 1) * limitNum;
      const where: any = {};

      // Add search functionality
      if (search) {
        where[Op.or] = [
          { first_name: { [Op.iLike]: `%${search}%` } },
          { last_name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ];
      }

      // Add role filter
      if (role) {
        where.role = role;
      }

      const { count, rows } = await this.profileModel.findAndCountAll({
        where,
        order: [[sortBy, sortOrder]],
        limit: limitNum,
        offset: offset,
        attributes: { exclude: ['password'] }, // Don't return passwords
      });

      const totalPages = Math.ceil(count / limitNum);

      return {
        users: rows,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems: count,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPreviousPage: pageNum > 1,
        }
      };
    } catch (error) {
      this.logger.error('Failed to fetch users', error);
      throw new HttpException('Failed to fetch users', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // 🔍 Get single profile by userId, email, or phone
  async findOne(searchParams: { userId?: string; email?: string; phone?: string }): Promise<Profile> {
    try {
      let profile: Profile | null = null;
      const { userId, email, phone } = searchParams;
      
      // Search by userId first (if provided)
      if (userId) {
        profile = await this.profileModel.findByPk(userId, {
          attributes: { exclude: ['password'] },
        });
      }
      // If not found by userId or userId not provided, try email
      else if (email) {
        profile = await this.profileModel.findOne({
          where: { email },
          attributes: { exclude: ['password'] },
        });
      }
      // If not found by email or email not provided, try phone
      else if (phone) {
        profile = await this.profileModel.findOne({
          where: { phone },
          attributes: { exclude: ['password'] },
        });
      }
      
      if (!profile) {
        throw new NotFoundException("User not found");
      }
      
      return profile;
    } catch (error) {
      const { userId, email, phone } = searchParams;
      const searchBy = userId ? `userId: ${userId}` : email ? `email: ${email}` : `phone: ${phone}`;
      this.logger.error(`Failed to fetch user by ${searchBy}`, error);
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new HttpException('Failed to fetch user', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // 📦 Get user statistics
  async getUserStats() {
    try {
      const total = await this.profileModel.count();
      const active = await this.profileModel.count({ where: { status: true } });
      const inactive = await this.profileModel.count({ where: { status: false } });

      // Get role distribution
      const roleStats = await this.profileModel.findAll({
        attributes: [
          'role',
          [this.profileModel.sequelize.fn('COUNT', this.profileModel.sequelize.col('role')), 'count']
        ],
        group: ['role'],
        raw: true
      });

      return {
        total,
        active,
        inactive,
        roleDistribution: roleStats,
      };
    } catch (error) {
      this.logger.error('Failed to fetch user stats', error);
      throw new HttpException('Failed to fetch user statistics', HttpStatus.INTERNAL_SERVER_ERROR);
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

    // 📝 Detect general field changes with proper type handling
    const fieldChanges = [
      "first_name",
      "last_name",
      "role",
    ].some((key) => dto[key] !== undefined && dto[key] !== profile[key]);

    // Handle role_id separately with type conversion
    let roleIdChanged = false;
    if (dto.role_id !== undefined) {
      const dtoRoleId = String(dto.role_id);
      const profileRoleId = String(profile.role_id);
      if (dtoRoleId !== profileRoleId) {
        roleIdChanged = true;
      }
    }

    const hasAnyChanges = fieldChanges || roleIdChanged || phoneChanged || passwordChanged || statusChanged;

    if (!hasAnyChanges) {
      return {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: true,
        message: "No changes made",
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
    if (fieldChanges || roleIdChanged) {
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
