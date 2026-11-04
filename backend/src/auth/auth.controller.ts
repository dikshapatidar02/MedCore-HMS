import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  Inject,
} from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh.dto";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AuthRateLimiterGuard } from "./guards/auth-rate-limiter.guard";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @UseGuards(AuthRateLimiterGuard)
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const result = await this.authService.login(loginDto, ipAddress, userAgent);
    return {
      success: true,
      data: result,
      message: "Authentication successful",
    };
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: Request) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const result = await this.authService.refreshTokens(refreshTokenDto, ipAddress);
    return {
      success: true,
      data: result,
      message: "Session token refreshed successfully",
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() refreshTokenDto: RefreshTokenDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress;
    const result = await this.authService.logout(refreshTokenDto, user, ipAddress);
    return {
      success: true,
      data: null,
      message: result.message,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser("id") userId: string) {
    const user = await this.authService.getMe(userId);
    return {
      success: true,
      data: user,
      message: "User profile retrieved successfully",
    };
  }
}
