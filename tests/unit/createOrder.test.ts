import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/shared/db/prisma";
import { createOrder } from "../../src/modules/orders/usecases/createOrder";
import { setupDb, cleanupDb, teardownDb } from "../helpers/db";

describe("createOrder", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(cleanupDb);

  it("calculates total and creates order", async () => {
    const user = await prisma.user.create({
      data: {
        email: "unit@example.com",
        passwordHash: "hash"
      }
    });

    const order = await createOrder(prisma, {
      userId: user.id,
      items: [
        { price: 100, quantity: 2 },
        { price: 50, quantity: 1 }
      ]
    });

    expect(order.total).toBe(250);
    expect(order.userId).toBe(user.id);
  });
});
