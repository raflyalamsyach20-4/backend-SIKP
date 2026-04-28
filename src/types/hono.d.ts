import { JWTPayload } from "."

declare module "hono/dist/types/context" {
  interface ContextVariableMap {
    sessionId: string,
    user: JWTPayload
  }
}

declare module "hono" {
  interface ContextVariableMap {
    sessionId: string,
    user: JWTPayload
  }
}
