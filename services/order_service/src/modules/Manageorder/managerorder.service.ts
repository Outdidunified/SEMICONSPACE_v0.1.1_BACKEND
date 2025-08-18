import { Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Op, fn, col, literal, QueryTypes } from "sequelize";
import { ManagerOrder } from "./managerorder.model";
import { UpdateManagerOrderDto } from "./dto/update-managerorder.dto";

@Injectable()
export class ManagerOrderService {
  private readonly logger = new Logger(ManagerOrderService.name);

  constructor(
    @InjectModel(ManagerOrder)
    private readonly orderModel: typeof ManagerOrder
  ) {}

  private validateUUID(uuid: string, label = "ID") {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(uuid)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: true,
          message: `Invalid ${label}`,
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async findAll(): Promise<any> {
    const data = await this.orderModel.findAll({
      where: { status: { [Op.ne]: "pending" } }, // exclude pending
    });

    if (!data || data.length === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          error: true,
          message: "No orders found",
        },
        HttpStatus.NOT_FOUND
      );
    }

    return {
      statusCode: HttpStatus.OK,
      error: false,
      message: "Orders fetched successfully",
      data: data.map((order) => order.toJSON()),
    };
  }

  async findOne(orderId: string): Promise<any> {
    this.validateUUID(orderId, "Order ID");

    const order = await this.orderModel.findByPk(orderId);
    if (!order) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          error: true,
          message: "Order not found",
        },
        HttpStatus.NOT_FOUND
      );
    }

    return {
      statusCode: HttpStatus.OK,
      error: false,
      message: "Order fetched successfully",
      data: order.toJSON(),
    };
  }

  async update(orderId: string, dto: UpdateManagerOrderDto): Promise<any> {
    this.validateUUID(orderId, "Order ID");

    const existingOrder = await this.orderModel.findByPk(orderId);
    if (!existingOrder) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          error: true,
          message: "Order not found",
        },
        HttpStatus.NOT_FOUND
      );
    }

    // ✅ Prevent updating to same status
    if (
      dto.status &&
      existingOrder.status?.toLowerCase() === dto.status.toLowerCase()
    ) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: true,
          message: `Order is already ${existingOrder.status.toLowerCase()}`,
        },
        HttpStatus.BAD_REQUEST
      );
    }

    const now = new Date();

    switch (dto.status?.toLowerCase()) {
      case "shipped":
        existingOrder.shippedAt = now;
        break;
      case "out for delivery":
      case "out-for-delivery":
        existingOrder.outForDeliveryAt = now;
        break;
      case "delivered":
        existingOrder.deliveredAt = now;
        break;
    }

    if (dto.status) existingOrder.status = dto.status;
    if (dto.totalAmount !== undefined) existingOrder.total = dto.totalAmount;

    if (dto.deliveryAddress) {
      try {
        existingOrder.billingDetails = JSON.parse(dto.deliveryAddress);
      } catch {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            error: true,
            message: "Invalid address format",
          },
          HttpStatus.BAD_REQUEST
        );
      }
    }

    await existingOrder.save();

    return {
      statusCode: HttpStatus.OK,
      error: false,
      message: "Order updated successfully",
      data: existingOrder,
    };
  }

  async findByUserId(userId: string): Promise<any> {
    try {
      if (!userId) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            error: true,
            message: "User ID is required",
          },
          HttpStatus.BAD_REQUEST
        );
      }

      this.validateUUID(userId, "User ID");

      const orders = await this.orderModel.findAll({ where: { userId } });

      if (!orders || orders.length === 0) {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: true,
          message: `No orders found for user ID ${userId}`,
        };
      }

      return {
        statusCode: HttpStatus.OK,
        error: false,
        message: "Orders fetched successfully",
        data: orders.map((order) => order.toJSON()),
      };
    } catch (error) {
      this.logger.error("Error in findByUserId:", error);

      return {
        statusCode: error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        error: true,
        message: error?.message || "Unexpected error while fetching orders",
      };
    }
  }

async getAnalytics() {
  try {
    // ✅ Total orders excluding pending
    const totalOrders = await this.orderModel.count({
      where: { status: { [Op.ne]: 'pending' } }
    });

    const ordersByStatus = await this.orderModel.findAll({
      attributes: ["status", [fn("COUNT", col("status")), "count"]],
      group: ["status"],
      raw: true,
    });

    const monthlyOrders = await this.orderModel.findAll({
      attributes: [
        [fn("DATE_TRUNC", "month", col("createdAt")), "month"],
        [fn("COUNT", "*"), "count"],
      ],
      where: { status: "confirmed" },
      group: [fn("DATE_TRUNC", "month", col("createdAt"))],
      order: [[fn("DATE_TRUNC", "month", col("createdAt")), "DESC"]],
      limit: 6,
      raw: true,
    });

    const totalRevenue = await this.orderModel.sum("total", {
      where: { status: "confirmed" },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ordersToday = await this.orderModel.count({
      where: { createdAt: { [Op.gte]: today }, status: "confirmed" },
    });

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const ordersThisWeek = await this.orderModel.count({
      where: { createdAt: { [Op.gte]: weekAgo }, status: "confirmed" },
    });

    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const ordersThisMonth = await this.orderModel.count({
      where: { createdAt: { [Op.gte]: firstDayOfMonth }, status: "confirmed" },
    });

    // DAILY: only today's confirmed orders
    const daily = await this.orderModel.findAll({
      attributes: [
        [fn("DATE", col("createdAt")), "date"],
        [fn("SUM", col("total")), "totalRevenue"],
        [fn("COUNT", col("orderId")), "totalOrders"],
      ],
      where: {
        status: "confirmed",
        createdAt: { [Op.gte]: today },
      },
      group: [fn("DATE", col("createdAt"))],
      raw: true,
    });

    const startOfWeek = new Date(today);
startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
startOfWeek.setHours(0, 0, 0, 0);

    // WEEKLY: only last week's confirmed orders
   const weekly = await this.orderModel.findAll({
  attributes: [
    [fn("DATE_TRUNC", "week", col("createdAt")), "week"],
    [fn("SUM", col("total")), "totalRevenue"],
    [fn("COUNT", col("orderId")), "totalOrders"],
  ],
  where: {
    status: "confirmed",
    createdAt: {
      [Op.gte]: startOfWeek,
      [Op.lte]: new Date(), // include up to now
    },
  },
  group: [fn("DATE_TRUNC", "week", col("createdAt"))],
  raw: true,
});

    const monthly = await this.orderModel.findAll({
      attributes: [
        [fn("DATE_TRUNC", "month", col("createdAt")), "month"],
        [fn("SUM", col("total")), "totalRevenue"],
        [fn("COUNT", col("orderId")), "totalOrders"],
      ],
      where: { status: "confirmed" },
      group: [fn("DATE_TRUNC", "month", col("createdAt"))],
      order: [[literal(`DATE_TRUNC('month', "createdAt")`), "ASC"]],
      raw: true,
    });

    const yearly = await this.orderModel.findAll({
      attributes: [
        [fn("DATE_TRUNC", "year", col("createdAt")), "year"],
        [fn("SUM", col("total")), "totalRevenue"],
        [fn("COUNT", col("orderId")), "totalOrders"],
      ],
      where: { status: "confirmed" },
      group: [fn("DATE_TRUNC", "year", col("createdAt"))],
      order: [[literal(`DATE_TRUNC('year', "createdAt")`), "ASC"]],
      raw: true,
    });

    // TOP 10 products
    const topProducts = await this.orderModel.sequelize.query(
      `
      SELECT
        item->>'productId' AS product_id,
        item->>'name' AS product_name,
        SUM((item->>'qty')::int) AS total_sold,
        SUM((item->>'totalPrice')::numeric) AS total_revenue
      FROM "Order",
      LATERAL jsonb_array_elements(items) AS item
      GROUP BY product_id, product_name
      ORDER BY total_sold DESC
      LIMIT 10;
      `,
      { type: QueryTypes.SELECT }
    );

    return {
      statusCode: 200,
      error: false,
      message: "Order analytics fetched successfully",
      data: {
        totalOrders,
        totalRevenue: totalRevenue || 0,
        ordersToday,
        ordersThisWeek,
        ordersThisMonth,
        ordersByStatus,
        daily,
        weekly,
        monthly,
        yearly,
        topProducts,
      },
    };
  } catch (error) {
    this.logger.error("Error in getAnalytics:", error);
    return {
      statusCode: 500,
      error: true,
      message: "Failed to fetch analytics",
    };
  }
}



}
