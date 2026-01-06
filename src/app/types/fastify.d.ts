import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    metricsStart?: bigint;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
