import {
  Injectable,
  Inject,
  UnauthorizedException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { AuthenticatedUser, JwtPayload } from "../common/interfaces/authenticated-user.interface";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
  private readonly refreshExpiresInDays = 7;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService
  ) {
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!accessSecret || accessSecret.length < 32) {
      throw new Error(
        "FATAL SECURITY ERROR: JWT_ACCESS_SECRET environment variable is missing or shorter than 32 characters."
      );
    }
    if (!refreshSecret || refreshSecret.length < 32) {
      throw new Error(
        "FATAL SECURITY ERROR: JWT_REFRESH_SECRET environment variable is missing or shorter than 32 characters."
      );
    }

    this.accessSecret = accessSecret;
    this.refreshSecret = refreshSecret;
  }

  private hashToken(token: string): string {
    return crypto.createHmac("sha256", this.refreshSecret).update(token).digest("hex");
  }

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const email = loginDto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { hospital: true },
    });

    if (!user) {
      this.logger.warn(`Failed login attempt for non-existent email: ${email}`);
      await this.recordAuditLog(null, null, AuditAction.LOGIN, "User", null, {
        reason: "Account not found",
        email,
      }, ipAddress, userAgent);
      throw new UnauthorizedException("Invalid email or password.");
    }

    const isPasswordValid = bcrypt.compareSync(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      this.logger.warn(`Invalid password for user: ${email}`);
      await this.recordAuditLog(user.hospitalId, user.id, AuditAction.LOGIN, "User", user.id, {
        reason: "Invalid password",
      }, ipAddress, userAgent);
      throw new UnauthorizedException("Invalid email or password.");
    }

    if (!user.isActive) {
      this.logger.warn(`Inactive user attempt to login: ${email}`);
      await this.recordAuditLog(user.hospitalId, user.id, AuditAction.LOGIN, "User", user.id, {
        reason: "Account inactive",
      }, ipAddress, userAgent);
      throw new UnauthorizedException(
        "User account is inactive. Please contact your hospital administrator."
      );
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Audit log successful login
    await this.recordAuditLog(
      user.hospitalId,
      user.id,
      AuditAction.LOGIN,
      "User",
      user.id,
      { success: true, role: user.role },
      ipAddress,
      userAgent
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        firstName: user.firstName,
        lastName: user.lastName,
        hospital: user.hospital
          ? {
              id: user.hospital.id,
              name: user.hospital.name,
              code: user.hospital.code,
            }
          : null,
      },
    };
  }

  async refreshTokens(refreshTokenDto: RefreshTokenDto, ipAddress?: string) {
    const rawToken = refreshTokenDto.refreshToken;
    const tokenHash = this.hashToken(rawToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { hospital: true } } },
    });

    if (!storedToken) {
      this.logger.warn(`Attempt to use non-existent refresh token.`);
      throw new UnauthorizedException("Invalid or revoked refresh token. Please login again.");
    }

    if (storedToken.isRevoked) {
      this.logger.warn(
        `REUSE DETECTION: Attempt to use already-revoked refresh token for user ${storedToken.userId}. Revoking all active user refresh sessions.`
      );
      // Revoke all remaining active refresh tokens for this user (OWASP Token Reuse Detection)
      await this.prisma.refreshToken.updateMany({
        where: { userId: storedToken.userId, isRevoked: false },
        data: { isRevoked: true },
      });
      await this.recordAuditLog(
        storedToken.user?.hospitalId || null,
        storedToken.userId,
        AuditAction.LOGOUT,
        "User",
        storedToken.userId,
        { reason: "COMPROMISED_REFRESH_TOKEN_REUSE", revokedAllSessions: true },
        ipAddress
      );
      throw new UnauthorizedException("Compromised session detected. All refresh tokens revoked. Please login again.");
    }

    if (new Date() > storedToken.expiresAt) {
      this.logger.warn(`Attempt to use expired refresh token.`);
      throw new UnauthorizedException("Refresh token has expired. Please login again.");
    }

    const user = storedToken.user;
    if (!user || !user.isActive) {
      throw new UnauthorizedException("User account is inactive or no longer exists.");
    }

    // Revoke previous token (Token Rotation for maximum security)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    // Generate fresh token pair
    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  async logout(refreshTokenDto: RefreshTokenDto, user: AuthenticatedUser, ipAddress?: string) {
    const tokenHash = this.hashToken(refreshTokenDto.refreshToken);

    // Invalidate the refresh token in database
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, userId: user.id },
      data: { isRevoked: true },
    });

    await this.recordAuditLog(
      user.hospitalId,
      user.id,
      AuditAction.LOGOUT,
      "User",
      user.id,
      { success: true },
      ipAddress
    );

    return { message: "Successfully logged out and session revoked." };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        hospitalId: true,
        firstName: true,
        lastName: true,
        phone: true,
        isActive: true,
        createdAt: true,
        hospital: {
          select: {
            id: true,
            name: true,
            code: true,
            status: true,
          },
        },
        doctorProfile: {
          select: {
            id: true,
            licenseNumber: true,
            specialization: true,
            consultationFee: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
        patientProfile: {
          select: {
            id: true,
            mrn: true,
            gender: true,
            bloodGroup: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("User account does not exist.");
    }

    return user;
  }

  private async generateTokens(user: {
    id: string;
    email: string;
    role: any;
    hospitalId: string | null;
    firstName: string;
    lastName: string;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn as any,
    });

    // Create raw random refresh token string and hash for secure storage
    const rawRefreshToken = crypto.randomBytes(40).toString("hex");
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshExpiresInDays);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        isRevoked: false,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: "Bearer",
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  private async recordAuditLog(
    hospitalId: string | null,
    userId: string | null,
    action: AuditAction,
    entityName: string,
    entityId: string | null,
    details: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          hospitalId,
          userId,
          action,
          entityName,
          entityId,
          details,
          ipAddress: ipAddress || null,
          userAgent: userAgent || null,
        },
      });
    } catch (err) {
      this.logger.error("Failed to write authentication audit log", err);
    }
  }

  // ─── Hospital Registration ───────────────────────────────────────────────

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const email = dto.email.trim().toLowerCase();

    // 1. Check for duplicate email
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      this.logger.warn(`Registration attempt with duplicate email: ${email}`);
      throw new ConflictException("An account with this email address already exists.");
    }

    // 2. Hash password using bcryptjs (consistent with existing auth service)
    const passwordHash = bcrypt.hashSync(dto.password, 12);

    // 3. Generate a unique hospital code from the hospital name
    const baseCode = dto.hospitalName
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 12);
    const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
    const hospitalCode = `${baseCode}-${suffix}`;

    // 4. Create hospital + user atomically in a transaction
    const { hospital, user } = await this.prisma.$transaction(async (tx) => {
      const hospital = await tx.hospital.create({
        data: {
          code: hospitalCode,
          name: dto.hospitalName.trim(),
          // Use registrant's email as the hospital's initial contact email
          email: email,
          // Placeholder phone — the administrator can update it after onboarding
          phone: "+00-0000000000",
          status: "ONBOARDING",
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          // Assign HOSPITAL_ADMIN role; account inactive until administrator approves
          role: "HOSPITAL_ADMIN",
          hospitalId: hospital.id,
          isActive: false,
        },
      });

      return { hospital, user };
    });

    // 5. Record audit log (non-fatal if it fails)
    await this.recordAuditLog(
      hospital.id,
      user.id,
      AuditAction.CREATE,
      "User",
      user.id,
      {
        action: "HOSPITAL_REGISTRATION_REQUEST",
        hospitalCode: hospital.code,
        hospitalName: hospital.name,
        // username is accepted from the form but stored only in audit details
        // (the User model has no username column — no migration required)
        username: dto.username,
        status: "PENDING_APPROVAL",
      },
      ipAddress,
      userAgent,
    );

    this.logger.log(
      `New hospital registration request: ${hospital.name} [${hospital.code}] by ${email}`,
    );

    // 6. Return sanitized response — NO tokens (account is inactive / pending approval)
    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      hospitalId: hospital.id,
      hospitalName: hospital.name,
      hospitalCode: hospital.code,
      status: "PENDING_APPROVAL",
    };
  }
}
