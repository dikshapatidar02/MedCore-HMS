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
import { PharmacyService } from "./pharmacy.service";
import { CreateMedicineDto } from "./dto/create-medicine.dto";
import { UpdateMedicineDto } from "./dto/update-medicine.dto";
import { CreateMedicineBatchDto } from "./dto/create-batch.dto";
import { ReceiveStockDto } from "./dto/receive-stock.dto";
import { DispensePrescriptionDto } from "./dto/dispense-prescription.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { TenantGuard } from "../auth/guards/tenant.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { BatchStatus, StockMovementType, UserRole } from "@prisma/client";

@Controller("pharmacy")
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
export class PharmacyController {
  constructor(
    @Inject(PharmacyService)
    private readonly pharmacyService: PharmacyService
  ) {}

  @Post("medicines")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async createMedicine(
    @Body() dto: CreateMedicineDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.createMedicine(dto, user);
  }

  @Get("medicines")
  @Roles(
    UserRole.PHARMACIST,
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.NURSE,
    UserRole.SUPER_ADMIN
  )
  async findAllMedicines(
    @CurrentUser() user: AuthenticatedUser,
    @Query("search") search?: string,
    @Query("category") category?: string,
    @Query("lowStockOnly") lowStockOnly?: string
  ) {
    return this.pharmacyService.findAllMedicines(user, {
      search,
      category,
      lowStockOnly: lowStockOnly === "true",
    });
  }

  @Get("medicines/:id")
  @Roles(
    UserRole.PHARMACIST,
    UserRole.DOCTOR,
    UserRole.HOSPITAL_ADMIN,
    UserRole.NURSE,
    UserRole.SUPER_ADMIN
  )
  async findOneMedicine(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.findOneMedicine(id, user);
  }

  @Patch("medicines/:id")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async updateMedicine(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateMedicineDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.updateMedicine(id, dto, user);
  }

  @Post("batches")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async createBatch(
    @Body() dto: CreateMedicineBatchDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.createBatch(dto, user);
  }

  @Post("receive-stock")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async receiveStock(
    @Body() dto: ReceiveStockDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.receiveStock(dto, user);
  }

  @Get("batches")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async findAllBatches(
    @CurrentUser() user: AuthenticatedUser,
    @Query("medicineId") medicineId?: string,
    @Query("status") status?: BatchStatus,
    @Query("expiringWithinDays") expiringWithinDays?: string
  ) {
    return this.pharmacyService.findAllBatches(user, {
      medicineId,
      status,
      expiringWithinDays: expiringWithinDays ? parseInt(expiringWithinDays, 10) : undefined,
    });
  }

  @Get("batches/:id")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async findOneBatch(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.findOneBatch(id, user);
  }

  @Post("batches/:id/quarantine")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async quarantineBatch(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.quarantineBatch(id, user);
  }

  @Post("dispense/:prescriptionId")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN)
  async dispensePrescription(
    @Param("prescriptionId", ParseUUIDPipe) prescriptionId: string,
    @Body() dto: DispensePrescriptionDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.dispensePrescription(prescriptionId, dto, user);
  }

  @Post("adjust-stock")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN)
  async adjustStock(
    @Body() dto: AdjustStockDto,
    @CurrentUser() user: AuthenticatedUser
  ) {
    return this.pharmacyService.adjustStock(dto, user);
  }

  @Post("quarantine-expired")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async quarantineExpired(@CurrentUser() user: AuthenticatedUser) {
    return this.pharmacyService.quarantineExpiredBatches(user.hospitalId || undefined);
  }

  @Get("movements")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async findAllStockMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query("medicineId") medicineId?: string,
    @Query("batchId") batchId?: string,
    @Query("type") type?: StockMovementType
  ) {
    return this.pharmacyService.findAllStockMovements(user, {
      medicineId,
      batchId,
      type,
    });
  }

  @Get("dispensing-records")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async findAllDispensingRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Query("prescriptionId") prescriptionId?: string,
    @Query("medicineId") medicineId?: string,
    @Query("batchId") batchId?: string
  ) {
    return this.pharmacyService.findAllDispensingRecords(user, {
      prescriptionId,
      medicineId,
      batchId,
    });
  }

  @Get("alerts")
  @Roles(UserRole.PHARMACIST, UserRole.HOSPITAL_ADMIN, UserRole.SUPER_ADMIN)
  async getAlerts(@CurrentUser() user: AuthenticatedUser) {
    return this.pharmacyService.getAlerts(user);
  }
}
