import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { BootstrapService } from "./bootstrap.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { TenantGuard } from "./guards/tenant.guard";

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      useFactory: () => {
        const accessSecret = process.env.JWT_ACCESS_SECRET;
        if (!accessSecret || accessSecret.length < 32) {
          throw new Error(
            "FATAL SECURITY ERROR: JWT_ACCESS_SECRET environment variable is missing or shorter than 32 characters."
          );
        }
        return {
          secret: accessSecret,
          signOptions: {
            expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || "15m") as any,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, BootstrapService, JwtStrategy, JwtAuthGuard, RolesGuard, TenantGuard],
  exports: [AuthService, BootstrapService, JwtAuthGuard, RolesGuard, TenantGuard, PassportModule, JwtModule],
})
export class AuthModule {}
