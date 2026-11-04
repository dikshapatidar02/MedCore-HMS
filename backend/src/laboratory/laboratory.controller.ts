import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { LaboratoryService } from "./laboratory.service";
import { CreateLabOrderDto } from "./dto/create-lab-order.dto";
import { CreateLabTestDto } from "./dto/create-lab-test.dto";
import { UpdateLabTestDto } from "./dto/update-lab-test.dto";
import { CollectSampleDto } from "./dto/collect-sample.dto";
import { CancelLabOrderDto } from "./dto/cancel-lab-order.dto";
import { UploadLabResultsDto } from "./dto/create-lab-result.dto";
import { ReviewLabOrderDto } from "./dto/review-lab-result.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { LabOrderStatus, UserRole } from "@prisma/client";

@Controller("laboratory")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class LaboratoryController {
  constructor(
    @Inject(LaboratoryService)
    private readonly labService: LaboratoryService
  ) {}

  @Post("tests")
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async createTest(
    @Body() dto: CreateLabTestDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.createTest(dto, user);
  }

  @Get("tests")
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.SUPER_ADMIN
  )
  async findAllTests(@CurrentUser() user: AuthenticatedUser) {
    return this.labService.findAllTests(user);
  }

  @Get("tests/:id")
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.SUPER_ADMIN
  )
  async findOneTest(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.findOneTest(id, user);
  }

  @Patch("tests/:id")
  @Roles(UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async updateTest(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabTestDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.updateTest(id, dto, user);
  }

  @Post("orders")
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async createOrder(
    @Body() dto: CreateLabOrderDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.createOrder(dto, user);
  }

  @Get("orders")
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async findAllOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query("patientId") patientId?: string,
    @Query("doctorId") doctorId?: string,
    @Query("status") status?: LabOrderStatus
  ) {
    return this.labService.findAllOrders({ patientId, doctorId, status }, user);
  }

  @Get("orders/:id")
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.PATIENT,
    UserRole.SUPER_ADMIN
  )
  async findOneOrder(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.findOneOrder(id, user);
  }

  @Patch("orders/:id/collect-sample")
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN
  )
  async collectSample(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto?: CollectSampleDto
  ) {
    return this.labService.collectSample(id, user, dto);
  }

  @Post("orders/:id/collect-sample")
  @Roles(
    UserRole.RECEPTIONIST,
    UserRole.LAB_TECHNICIAN,
    UserRole.NURSE,
    UserRole.HOSPITAL_ADMIN,
    UserRole.SUPER_ADMIN
  )
  async collectSamplePost(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto?: CollectSampleDto
  ) {
    return this.labService.collectSample(id, user, dto);
  }

  @Patch("orders/:id/process-sample")
  @Roles(UserRole.LAB_TECHNICIAN, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async processSample(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.processSample(id, user);
  }

  @Post("orders/:id/process-sample")
  @Roles(UserRole.LAB_TECHNICIAN, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async processSamplePost(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.processSample(id, user);
  }

  @Post("orders/:id/results")
  @Roles(UserRole.LAB_TECHNICIAN, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async uploadResults(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UploadLabResultsDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.uploadResults(id, dto, user);
  }

  @Post("orders/:id/review")
  @Roles(
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.LAB_TECHNICIAN,
    UserRole.SUPER_ADMIN
  )
  async reviewOrder(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewLabOrderDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.reviewOrder(id, dto, user);
  }

  @Patch("orders/:id/cancel")
  @Roles(UserRole.DOCTOR, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async cancelOrder(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelLabOrderDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.labService.cancelOrder(id, dto, user);
  }
}
