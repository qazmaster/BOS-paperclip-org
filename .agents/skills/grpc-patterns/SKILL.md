---
name: grpc-patterns
description: "Teaches the agent to implement robust, scalable Go services using Protocol Buffers and gRPC. Includes patterns for unary and streaming calls, middleware creation (interceptors), and strict error handling with gRPC status codes."
---

# grpc-patterns Skill

This skill enforces best practices for developing gRPC APIs in Golang. 

## Protocol Buffers (proto3)
When generating gRPC services, you must:
1. Use standardized templates to define service contracts and message structures in `.proto` files.
2. Ensure backward compatibility of fields (e.g., never change the type or number of an existing field).
3. Properly version your protocol buffer packages (e.g., `package api.v1;`).

## RPC Patterns
You must be capable of generating both:
- **Unary Calls:** For standard CRUD operations where the client sends a single request and gets a single response.
- **Bidirectional Streaming:** For complex real-time data transfer where both client and server send a sequence of messages.

## Middleware (Interceptors)
Automatically inject gRPC interceptors into the server setup to handle cross-cutting concerns without polluting the business logic. Specifically:
- **Logging:** Log all incoming requests and outgoing responses.
- **Distributed Tracing:** Ensure trace contexts are propagated.
- **Authentication:** For example, JWT validation.
- **Metrics:** Instrument Prometheus metrics for request latency and error rates.

## Error Handling
Never return plain Go errors from a gRPC handler. You MUST strictly use standard gRPC status codes:
- Use `status.Errorf(codes.NotFound, "...")` when a resource is missing.
- Use `codes.Unauthenticated` for missing or invalid tokens.
- Use the `status` package to enrich errors with metadata payload.
