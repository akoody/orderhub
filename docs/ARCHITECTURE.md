# Architecture

## Context
OrderHub is a small service for orders, payments, and notifications. It focuses on clear boundaries, idempotency, and reliable event delivery.

## Domains
- Auth: registration, login, refresh rotation, logout.
- Orders: create and manage user orders.
- Payments: create payments, handle provider webhooks, idempotency.
- Notifications: send user notifications from async events.

## Flows
CreateOrder -> CreatePayment -> Webhook -> Outbox -> Queue -> Notify

## Why this structure
- Separation of layers keeps HTTP concerns out of core logic.
- Usecases contain business rules and stay independent from Fastify.
- Infra handles Prisma, Redis, and RabbitMQ integration.
- Transactions in Postgres keep payment, order status, and outbox in sync.
- Outbox ensures events are not lost between DB and queue.
