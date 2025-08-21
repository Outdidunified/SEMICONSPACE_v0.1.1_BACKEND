import { Body, Controller, Post, Get, Query, UsePipes, HttpStatus, Req, Res, BadRequestException } from '@nestjs/common';
import { ManageUserService } from './manage-user.service';
import { CreateManageUserDto } from './dto/create-manage-user.dto';
import { UpdateManageUserDto } from './dto/update-manage-user.dto';
import { JoiValidationPipe } from '../../middlewares/joiValidation.pipe';
import { 
  createUserSchema, 
  updateUserSchema, 
  getUserSchema, 
  getUsersQuerySchema 
} from './validation/user.validation';

@Controller('user/manage_users')
export class ManageUserController {
  constructor(private readonly userService: ManageUserService) {}

  @Post('create')
  async create(@Req() req: any, @Res() res: any) {
    const dto = req.body;
    
    // Apply validation
    const validationPipe = new JoiValidationPipe(createUserSchema);
    const validatedDto = validationPipe.transform(dto);
    
    const result = await this.userService.create(validatedDto);
    
    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'User created successfully',
      data: result
    });
  }

  @Get('getall')
  async findAll(@Query() query: any, @Res() res: any) {
    try {
      // Apply validation
      const validationPipe = new JoiValidationPipe(getUsersQuerySchema);
      const validatedQuery = validationPipe.transform(query);
      
      const result = await this.userService.findAll(validatedQuery);
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'Users retrieved successfully',
        data: result
      });
    } catch (error) {
      if (error.name === 'BadRequestException') {
        return res.status(HttpStatus.BAD_REQUEST).json({
          success: false,
          message: Array.isArray(error.message) ? error.message.join(', ') : error.message
        });
      }
      
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'An error occurred while retrieving users'
      });
    }
  }

  @Post('getone')
  async findOne(@Req() req: any, @Res() res: any) {
    const body = req.body;
    
    // Apply validation
    const validationPipe = new JoiValidationPipe(getUserSchema);
    const validatedBody = validationPipe.transform(body);
    
    // Extract search parameters
    const searchParams = {
      userId: validatedBody.userId,
      email: validatedBody.email,
      phone: validatedBody.phone
    };
    
    const result = await this.userService.findOne(searchParams);
    return res.status(HttpStatus.OK).json({
      success: true,
      message: 'User retrieved successfully',
      data: result
    });
  }

  @Post('update')
  async update(@Req() req: any, @Res() res: any) {
    const dto = req.body;
    
    // Apply validation
    const validationPipe = new JoiValidationPipe(updateUserSchema);
    const validatedDto = validationPipe.transform(dto);
    
    const result = await this.userService.update(validatedDto.userId, validatedDto);
    
    // Handle different response cases
    if (result.statusCode === HttpStatus.PAYMENT_REQUIRED) {
      return res.status(HttpStatus.PAYMENT_REQUIRED).json({
        success: false,
        message: result.message
      });
    }
    
    if (result.error) {
      return res.status(result.statusCode).json({
        success: false,
        message: result.message
      });
    }
    
    return res.status(result.statusCode).json({
      success: true,
      message: result.message,
      data: result.data
    });
  }

  @Get('stats')
  async getUserStats(@Res() res: any) {
    try {
      const result = await this.userService.getUserStats();
      return res.status(HttpStatus.OK).json({
        success: true,
        message: 'User statistics retrieved successfully',
        data: result
      });
    } catch (error) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'An error occurred while retrieving user statistics'
      });
    }
  }

  // @Post('status')
  // @UsePipes(new JoiValidationPipe(toggleStatusSchema))
  // async toggleStatus(@Body() body: { userId: string; status: boolean; modified_by: string }) {
  //   const result = await this.userService.toggleStatus(body.userId, body.status, body.modified_by);
  //   return {
  //     success: true,
  //     message: 'User status updated successfully',
  //     data: result,
  //     statusCode: HttpStatus.OK
  //   };
  // }
}
