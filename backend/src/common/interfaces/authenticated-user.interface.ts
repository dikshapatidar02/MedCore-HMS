import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  hospitalId: string | null;
  firstName: string;
  lastName: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  hospitalId: string | null;
  firstName: string;
  lastName: string;
  iat?: number;
  exp?: number;
}
