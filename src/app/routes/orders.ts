import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma";
import { createOrder } from "../../modules/orders/usecases/createOrder";
import { getMyOrders } from "../../modules/orders/usecases/getMyOrders";
import { changeOrderStatus } from "../../modules/orders/usecases/changeOrderStatus";
import { OrderStatus } from "@prisma/client";

export async function orderRoutes(app: FastifyInstance) {
  app.post("/orders", { preHandler: app.authenticate }, async (request) => {
    const bodySchema = z.object({
      items: z
        .array(
          z.object({
            price: z.number().int().positive(),
            quantity: z.number().int().positive()
          })
        )
        .min(1)
    });

    const body = bodySchema.parse(request.body);
    const order = await createOrder(prisma, {
      userId: request.user.sub,
      items: body.items
    });

    return { orderId: order.id };
  });

  app.get("/orders/me", { preHandler: app.authenticate }, async (request) => {
    const orders = await getMyOrders(prisma, request.user.sub);
    return { orders };
  });

  app.patch(
    "/admin/orders/:id/status",
    async (request, reply) => {
      const adminHeader = request.headers["x-admin"];
      if (adminHeader !== "true") {
        reply.code(403);
        return { error: "admin only" };
      }

      const versionHeader = request.headers["x-order-version"];
      const expectedVersion = Number(versionHeader);
      if (!versionHeader || Number.isNaN(expectedVersion)) {
        reply.code(400);
        return { error: "missing order version" };
      }

      const paramsSchema = z.object({
        id: z.string().uuid()
      });
      const bodySchema = z.object({
        status: z.nativeEnum(OrderStatus)
      });

      const params = paramsSchema.parse(request.params);
      const body = bodySchema.parse(request.body);

      let order;
      try {
        order = await changeOrderStatus(prisma, {
          orderId: params.id,
          status: body.status,
          expectedVersion
        });
      } catch (err) {
        if (err instanceof Error && err.message === "VERSION_MISMATCH") {
          reply.code(409);
          return { error: "version mismatch" };
        }
        throw err;
      }

      return { orderId: order?.id, status: order?.status, version: order?.version };
    }
  );
}
