import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthenticatedUser } from "../../common/interfaces/authenticated-user.interface";

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException("Tenant verification failed: Unauthenticated request.");
    }

    // SUPER_ADMIN has platform-wide access across all tenants
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Extract requested hospital ID from route params, query, body, or headers
    const paramHospitalId = request.params?.hospitalId;
    const queryHospitalId = request.query?.hospitalId;
    const bodyHospitalId = request.body?.hospitalId;
    const headerHospitalId =
      request.headers?.["x-hospital-id"] || request.headers?.["hospital-id"];
    const targetHospitalId =
      paramHospitalId || queryHospitalId || bodyHospitalId || headerHospitalId;

    // If an explicit hospital target is requested, ensure it strictly matches the authenticated user's hospital
    if (targetHospitalId) {
      if (!user.hospitalId || user.hospitalId !== targetHospitalId) {
        throw new ForbiddenException(
          `Tenant isolation violation: Access denied to hospital '${targetHospitalId}'. Your account is bound to hospital '${user.hospitalId || "NONE"}'.`
        );
      }
    }

    return true;
  }
}
