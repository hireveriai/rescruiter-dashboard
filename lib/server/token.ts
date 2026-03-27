import { randomUUID } from "crypto"

export function generateInviteToken() {
  return randomUUID()
}
