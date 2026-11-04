import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateMedicineDto } from "./dto/create-medicine.dto";
import { UpdateMedicineDto } from "./dto/update-medicine.dto";
import { CreateMedicineBatchDto } from "./dto/create-batch.dto";
import { ReceiveStockDto } from "./dto/receive-stock.dto";
import { DispensePrescriptionDto } from "./dto/dispense-prescription.dto";
import { AdjustStockDto } from "./dto/adjust-stock.dto";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import {
  AuditAction,
  BatchStatus,
  PrescriptionStatus,
  StockMovementType,
  UserRole,
} from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class PharmacyService {
  private readonly logger = new Logger(PharmacyService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService
  ) {}

  // 1. Medicine Catalogue
  async createMedicine(dto: CreateMedicineDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.PHARMACIST && user.role !== UserRole.HOSPITAL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only pharmacy staff or administrators can create medicines in formulary.");
    }

    if (!dto.name || !dto.genericName || !dto.code) {
      throw new BadRequestException("Medicine name, generic name, and code are required.");
    }
    if (dto.unitPrice !== undefined && dto.unitPrice <= 0) {
      throw new BadRequestException("Unit price must be a positive number.");
    }

    const existing = await this.prisma.medicine.findFirst({
      where: {
        code: dto.code,
        OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
      },
    });
    if (existing) {
      throw new BadRequestException(`Medicine code '${dto.code}' already exists.`);
    }

    const med = await this.prisma.medicine.create({
      data: {
        hospitalId: user.hospitalId,
        code: dto.code,
        name: dto.name,
        genericName: dto.genericName,
        category: dto.category,
        form: dto.form,
        strength: dto.strength,
        manufacturer: dto.manufacturer,
        unitPrice: dto.unitPrice,
        reorderLevel: dto.reorderLevel || 10,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: user.hospitalId,
        userId: user.id,
        action: AuditAction.CREATE,
        entityName: "Medicine",
        entityId: med.id,
        details: { action: "CREATE_MEDICINE", code: med.code, name: med.name },
      },
    });

    return med;
  }

  async findOneMedicine(id: string, user: AuthenticatedUser) {
    const med = await this.prisma.medicine.findUnique({
      where: { id },
      include: {
        batches: {
          where: {
            status: BatchStatus.ACTIVE,
            expiryDate: { gt: new Date() },
          },
          orderBy: { expiryDate: "asc" },
        },
      },
    });

    if (!med) {
      throw new NotFoundException(`Medicine '${id}' not found in formulary.`);
    }

    if (
      user.role !== UserRole.SUPER_ADMIN &&
      med.hospitalId !== null &&
      med.hospitalId !== user.hospitalId
    ) {
      throw new ForbiddenException("Cross-tenant access to medicine formulary is forbidden.");
    }

    const totalStock = med.batches.reduce((sum, b) => sum + b.currentQuantity, 0);
    const isLowStock = totalStock <= med.reorderLevel;

    return {
      ...med,
      totalStock,
      isLowStock,
    };
  }

  async updateMedicine(id: string, dto: UpdateMedicineDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.PHARMACIST &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only pharmacy staff or administrators can modify medicines.");
    }

    const med = await this.prisma.medicine.findUnique({ where: { id } });
    if (!med) {
      throw new NotFoundException(`Medicine '${id}' not found.`);
    }

    if (user.role !== UserRole.SUPER_ADMIN) {
      if (med.hospitalId === null) {
        throw new ForbiddenException("Cannot modify standard global formulary medicines.");
      }
      if (med.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cannot modify medicines belonging to another hospital.");
      }
    }

    if (dto.code && dto.code !== med.code) {
      const existing = await this.prisma.medicine.findFirst({
        where: {
          code: dto.code,
          hospitalId: med.hospitalId,
          id: { not: id },
        },
      });
      if (existing) {
        throw new BadRequestException(`Medicine code '${dto.code}' already in use.`);
      }
    }

    const updated = await this.prisma.medicine.update({
      where: { id },
      data: {
        name: dto.name,
        genericName: dto.genericName,
        code: dto.code,
        category: dto.category,
        form: dto.form,
        strength: dto.strength,
        manufacturer: dto.manufacturer,
        unitPrice: dto.unitPrice,
        reorderLevel: dto.reorderLevel,
        isActive: dto.isActive,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: user.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "Medicine",
        entityId: id,
        details: { action: "UPDATE_MEDICINE", updatedFields: Object.keys(dto) },
      },
    });

    return updated;
  }

  async findAllMedicines(
    user: AuthenticatedUser,
    filters?: { search?: string; category?: string; lowStockOnly?: boolean }
  ) {
    const where: any = {
      OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
      isActive: true,
    };

    if (filters?.category) {
      where.category = filters.category;
    }
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { genericName: { contains: filters.search, mode: "insensitive" } },
        { code: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const medicines = await this.prisma.medicine.findMany({
      where,
      include: {
        batches: {
          where: {
            status: BatchStatus.ACTIVE,
            expiryDate: { gt: new Date() },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const enriched = medicines.map((med) => {
      const totalStock = med.batches.reduce((sum, b) => sum + b.currentQuantity, 0);
      const isLowStock = totalStock <= med.reorderLevel;
      return {
        ...med,
        totalStock,
        isLowStock,
      };
    });

    if (filters?.lowStockOnly) {
      return enriched.filter((m) => m.isLowStock);
    }

    return enriched;
  }

  // 2. Batch Management & Stock Receiving
  async createBatch(dto: CreateMedicineBatchDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.PHARMACIST && user.role !== UserRole.HOSPITAL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only pharmacy staff can register medicine batches.");
    }
    if (!user.hospitalId && user.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Hospital tenant context is required to register medicine batches.");
    }

    const expiry = new Date(dto.expiryDate);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      throw new BadRequestException("Batch expiry date must be in the future. Cannot register already-expired stock.");
    }

    if (dto.manufacturingDate) {
      const mfg = new Date(dto.manufacturingDate);
      if (isNaN(mfg.getTime())) {
        throw new BadRequestException("Invalid manufacturing date format.");
      }
      if (mfg >= expiry) {
        throw new BadRequestException("Manufacturing date must precede expiry date.");
      }
    }

    if (dto.quantity <= 0) {
      throw new BadRequestException("Batch quantity must be a positive integer.");
    }

    const med = await this.prisma.medicine.findFirst({
      where: {
        id: dto.medicineId,
        OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
      },
    });
    if (!med) {
      throw new NotFoundException(`Medicine '${dto.medicineId}' not found in hospital formulary.`);
    }

    // Check duplicate batch number in tenant
    const existing = await this.prisma.medicineBatch.findFirst({
      where: {
        hospitalId: user.hospitalId!,
        medicineId: dto.medicineId,
        batchNumber: dto.batchNumber,
      },
    });
    if (existing) {
      throw new BadRequestException(
        `Batch number '${dto.batchNumber}' already registered for medicine '${med.name}'.`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.medicineBatch.create({
        data: {
          hospitalId: user.hospitalId!,
          medicineId: dto.medicineId,
          batchNumber: dto.batchNumber,
          manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null,
          expiryDate: expiry,
          initialQuantity: dto.quantity,
          currentQuantity: dto.quantity,
          unitCost: dto.unitCost,
          mrp: dto.mrp,
          supplier: dto.supplier,
          status: BatchStatus.ACTIVE,
        },
      });

      // Record StockMovement
      const movement = await tx.stockMovement.create({
        data: {
          hospitalId: user.hospitalId!,
          medicineId: dto.medicineId,
          batchId: batch.id,
          type: StockMovementType.PURCHASE_RECEIPT,
          quantity: dto.quantity,
          previousStock: 0,
          newStock: dto.quantity,
          reason: `Initial receipt of batch ${batch.batchNumber}`,
          performedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "MedicineBatch",
          entityId: batch.id,
          details: {
            action: "CREATE_BATCH",
            batchNumber: batch.batchNumber,
            quantity: dto.quantity,
            movementId: movement.id,
          },
        },
      });

      return batch;
    });
  }

  async receiveStock(dto: ReceiveStockDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.PHARMACIST &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only pharmacy staff can receive incoming stock.");
    }
    if (!user.hospitalId && user.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException("Hospital tenant context is required to receive stock.");
    }

    const targetHospitalId = user.hospitalId!;
    const med = await this.prisma.medicine.findFirst({
      where: {
        id: dto.medicineId,
        OR: [{ hospitalId: targetHospitalId }, { hospitalId: null }],
      },
    });
    if (!med) {
      throw new NotFoundException(`Medicine '${dto.medicineId}' not found in formulary.`);
    }

    const expiry = new Date(dto.expiryDate);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      throw new BadRequestException("Batch expiry date must be in the future.");
    }

    if (dto.manufacturingDate) {
      const mfg = new Date(dto.manufacturingDate);
      if (isNaN(mfg.getTime())) {
        throw new BadRequestException("Invalid manufacturing date format.");
      }
      if (mfg >= expiry) {
        throw new BadRequestException("Manufacturing date must precede expiry date.");
      }
    }

    if (dto.quantity <= 0) {
      throw new BadRequestException("Received quantity must be greater than zero.");
    }

    return this.prisma.$transaction(async (tx) => {
      let batch = await tx.medicineBatch.findFirst({
        where: {
          hospitalId: targetHospitalId,
          medicineId: dto.medicineId,
          batchNumber: dto.batchNumber,
        },
      });

      let prevStock = 0;
      let newStock = 0;

      if (batch) {
        prevStock = batch.currentQuantity;
        newStock = prevStock + dto.quantity;
        batch = await tx.medicineBatch.update({
          where: { id: batch.id },
          data: {
            currentQuantity: newStock,
            unitCost: dto.unitCost,
            mrp: dto.mrp,
            supplier: dto.supplier || batch.supplier,
            status: BatchStatus.ACTIVE,
          },
        });
      } else {
        prevStock = 0;
        newStock = dto.quantity;
        batch = await tx.medicineBatch.create({
          data: {
            hospitalId: targetHospitalId,
            medicineId: dto.medicineId,
            batchNumber: dto.batchNumber,
            manufacturingDate: dto.manufacturingDate ? new Date(dto.manufacturingDate) : null,
            expiryDate: expiry,
            initialQuantity: dto.quantity,
            currentQuantity: dto.quantity,
            unitCost: dto.unitCost,
            mrp: dto.mrp,
            supplier: dto.supplier,
            status: BatchStatus.ACTIVE,
          },
        });
      }

      const movement = await tx.stockMovement.create({
        data: {
          hospitalId: targetHospitalId,
          medicineId: dto.medicineId,
          batchId: batch.id,
          type: StockMovementType.PURCHASE_RECEIPT,
          quantity: dto.quantity,
          previousStock: prevStock,
          newStock: newStock,
          reason: dto.invoiceReference ? `Stock receipt: ${dto.invoiceReference}` : `Stock receipt for batch ${batch.batchNumber}`,
          performedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: targetHospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "StockMovement",
          entityId: movement.id,
          details: {
            action: "STOCK_RECEIVE",
            batchNumber: batch.batchNumber,
            quantity: dto.quantity,
            newStock,
          },
        },
      });

      return {
        batch,
        movement,
      };
    });
  }

  async findAllBatches(
    user: AuthenticatedUser,
    filters?: { medicineId?: string; status?: BatchStatus; expiringWithinDays?: number }
  ) {
    const where: any = {
      hospitalId: user.hospitalId,
    };

    if (filters?.medicineId) {
      where.medicineId = filters.medicineId;
    }
    if (filters?.status) {
      where.status = filters.status;
    }
    if (filters?.expiringWithinDays) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + filters.expiringWithinDays);
      where.expiryDate = { lte: cutoff };
    }

    return this.prisma.medicineBatch.findMany({
      where,
      include: {
        medicine: true,
      },
      orderBy: { expiryDate: "asc" },
    });
  }

  async findOneBatch(id: string, user: AuthenticatedUser) {
    const batch = await this.prisma.medicineBatch.findUnique({
      where: { id },
      include: {
        medicine: true,
      },
    });

    if (!batch) {
      throw new NotFoundException(`Batch '${id}' not found.`);
    }

    if (user.role !== UserRole.SUPER_ADMIN && batch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant batch access is strictly prohibited.");
    }

    return batch;
  }

  // 3. FIFO Prescription Dispensing
  async dispensePrescription(
    prescriptionId: string,
    dto: DispensePrescriptionDto,
    user: AuthenticatedUser
  ) {
    if (user.role !== UserRole.PHARMACIST && user.role !== UserRole.HOSPITAL_ADMIN) {
      throw new ForbiddenException("Only licensed pharmacists can dispense prescriptions.");
    }

    if (!user.hospitalId) {
      throw new BadRequestException("Pharmacist must be bound to a hospital tenant.");
    }

    const dispenseResult = await this.prisma.$transaction(async (tx) => {
      const rx = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: {
          items: {
            include: { medicine: true },
          },
        },
      });

      if (!rx) {
        throw new NotFoundException(`Prescription '${prescriptionId}' not found.`);
      }

      if (rx.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cross-tenant dispensing is strictly prohibited.");
      }

      if (rx.status === PrescriptionStatus.DISPENSED) {
        throw new BadRequestException("Prescription has already been completely dispensed.");
      }

      if (rx.status === PrescriptionStatus.CANCELLED) {
        throw new BadRequestException("Cannot dispense a cancelled prescription.");
      }

      const dispensedRecordsCreated = [];

      const itemsToProcess =
        dto.items && dto.items.length > 0
          ? dto.items
          : rx.items
              .filter((i) => i.quantity - i.dispensedQuantity > 0)
              .map((i) => ({
                prescriptionItemId: i.id,
                quantity: i.quantity - i.dispensedQuantity,
              }));

      if (itemsToProcess.length === 0) {
        throw new BadRequestException("All items in this prescription have already been fully dispensed.");
      }

      for (const reqItem of itemsToProcess) {
        const item = rx.items.find((i) => i.id === reqItem.prescriptionItemId);
        if (!item) {
          throw new NotFoundException(`Prescription item '${reqItem.prescriptionItemId}' not in this prescription.`);
        }

        const remainingNeeded = item.quantity - item.dispensedQuantity;
        if (remainingNeeded <= 0) {
          continue; // Already fully dispensed
        }

        const qtyToDispense = reqItem.quantity ? Math.min(reqItem.quantity, remainingNeeded) : remainingNeeded;
        if (qtyToDispense <= 0) {
          continue;
        }

        // Concurrency protection: acquire PostgreSQL transaction advisory lock for this medicine
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`dispense_${item.medicineId}`}))`;

        // FIFO: Query active, non-expired batches ordered by expiryDate ASC, manufacturingDate ASC
        const eligibleBatches = await tx.medicineBatch.findMany({
          where: {
            hospitalId: user.hospitalId,
            medicineId: item.medicineId,
            status: BatchStatus.ACTIVE,
            expiryDate: { gt: new Date() },
            currentQuantity: { gt: 0 },
          },
          orderBy: [{ expiryDate: "asc" }, { manufacturingDate: "asc" }],
        });

        const totalAvailable = eligibleBatches.reduce((acc, b) => acc + b.currentQuantity, 0);

        if (totalAvailable < qtyToDispense) {
          throw new BadRequestException(
            `Insufficient non-expired stock for '${item.medicine.name}'. Available: ${totalAvailable}, Requested: ${qtyToDispense}. Cannot dispense.`
          );
        }

        let needed = qtyToDispense;

        for (const batch of eligibleBatches) {
          if (needed <= 0) break;

          const take = Math.min(batch.currentQuantity, needed);
          const prevStock = batch.currentQuantity;
          const newStock = prevStock - take;

          if (newStock < 0) {
            throw new BadRequestException("Stock underflow detected. Operation aborted.");
          }

          const newStatus = newStock === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE;

          await tx.medicineBatch.update({
            where: { id: batch.id },
            data: {
              currentQuantity: newStock,
              status: newStatus,
            },
          });

          // Stock Movement audit
          await tx.stockMovement.create({
            data: {
              hospitalId: user.hospitalId,
              medicineId: item.medicineId,
              batchId: batch.id,
              type: StockMovementType.DISPENSED,
              quantity: -take,
              previousStock: prevStock,
              newStock: newStock,
              reason: `Dispensed for Rx ${rx.id}`,
              performedById: user.id,
            },
          });

          // Dispensing Record with batch traceability
          const unitPrice = batch.mrp || item.medicine.unitPrice;
          const totalPrice = Number((Number(unitPrice) * take).toFixed(2));

          const dispRecord = await tx.dispensingRecord.create({
            data: {
              hospitalId: user.hospitalId,
              prescriptionItemId: item.id,
              batchId: batch.id,
              quantity: take,
              unitPrice,
              totalPrice,
              dispensedById: user.id,
            },
          });

          dispensedRecordsCreated.push(dispRecord);
          needed -= take;
        }

        // Update item dispensed quantity
        await tx.prescriptionItem.update({
          where: { id: item.id },
          data: {
            dispensedQuantity: item.dispensedQuantity + qtyToDispense,
          },
        });
      }

      // Check overall prescription status
      const updatedRx = await tx.prescription.findUnique({
        where: { id: prescriptionId },
        include: { items: true },
      });

      const allDone = updatedRx?.items.every((i) => i.dispensedQuantity >= i.quantity);
      const anyDone = updatedRx?.items.some((i) => i.dispensedQuantity > 0);

      const finalStatus = allDone
        ? PrescriptionStatus.DISPENSED
        : anyDone
        ? PrescriptionStatus.PARTIALLY_DISPENSED
        : rx.status;

      await tx.prescription.update({
        where: { id: prescriptionId },
        data: { status: finalStatus },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "Prescription",
          entityId: prescriptionId,
          details: {
            action: "DISPENSE",
            status: finalStatus,
            dispensedRecordsCount: dispensedRecordsCreated.length,
          },
        },
      });

      return {
        prescriptionId,
        status: finalStatus,
        dispensedRecords: dispensedRecordsCreated,
        itemsDispensed: rx.items.map((item) => ({
          medicineId: item.medicineId,
          medicineName: item.medicine.name,
          reorderLevel: item.medicine.reorderLevel,
        })),
      };
    });

    if (this.notificationsService && user.hospitalId) {
      for (const item of dispenseResult.itemsDispensed) {
        const remainingStock = await this.prisma.medicineBatch.aggregate({
          where: {
            hospitalId: user.hospitalId,
            medicineId: item.medicineId,
            status: BatchStatus.ACTIVE,
            expiryDate: { gt: new Date() },
          },
          _sum: { currentQuantity: true },
        });
        const currentTotal = remainingStock._sum.currentQuantity || 0;
        if (currentTotal <= item.reorderLevel) {
          await this.notificationsService.notifyLowStock(
            user.hospitalId,
            item.medicineId,
            item.medicineName,
            currentTotal,
            item.reorderLevel
          ).catch((err) => this.logger.warn(`Failed to dispatch low stock alert: ${err.message}`));
        }
      }
    }

    return {
      prescriptionId: dispenseResult.prescriptionId,
      status: dispenseResult.status,
      dispensedRecords: dispenseResult.dispensedRecords,
    };
  }

  // 4. Quarantine Expired Batches
  async quarantineExpiredBatches(hospitalId?: string) {
    const now = new Date();
    const where: any = {
      expiryDate: { lte: now },
      status: BatchStatus.ACTIVE,
    };
    if (hospitalId) {
      where.hospitalId = hospitalId;
    }

    const expiredBatches = await this.prisma.medicineBatch.findMany({
      where,
    });

    const quarantined = [];

    for (const batch of expiredBatches) {
      const updated = await this.prisma.medicineBatch.update({
        where: { id: batch.id },
        data: { status: BatchStatus.QUARANTINED },
      });

      await this.prisma.stockMovement.create({
        data: {
          hospitalId: batch.hospitalId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          type: StockMovementType.QUARANTINED,
          quantity: -batch.currentQuantity,
          previousStock: batch.currentQuantity,
          newStock: 0,
          reason: `Auto-quarantined on expiry date ${batch.expiryDate.toISOString().split("T")[0]}`,
        },
      });

      quarantined.push(updated);
    }

    return {
      quarantinedCount: quarantined.length,
      batches: quarantined,
    };
  }

  // 4b. Quarantine Single Batch
  async quarantineBatch(batchId: string, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.PHARMACIST &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only pharmacy staff or administrators can quarantine medicine batches.");
    }

    const batch = await this.prisma.medicineBatch.findUnique({
      where: { id: batchId },
      include: { medicine: true },
    });

    if (!batch) {
      throw new NotFoundException(`Medicine batch '${batchId}' not found.`);
    }

    if (user.role !== UserRole.SUPER_ADMIN && batch.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant batch quarantine is strictly prohibited.");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.medicineBatch.update({
        where: { id: batchId },
        data: { status: BatchStatus.QUARANTINED },
      });

      await tx.stockMovement.create({
        data: {
          hospitalId: batch.hospitalId,
          medicineId: batch.medicineId,
          batchId: batch.id,
          type: StockMovementType.QUARANTINED,
          quantity: -batch.currentQuantity,
          previousStock: batch.currentQuantity,
          newStock: 0,
          reason: `Manual quarantine by staff ${user.id} (${batch.medicine.name} batch ${batch.batchNumber})`,
          performedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: batch.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "MedicineBatch",
          entityId: batchId,
          details: { action: "QUARANTINE_MANUAL", batchNumber: batch.batchNumber },
        },
      });

      return updated;
    });
  }

  // 5. Stock Adjustments
  async adjustStock(dto: AdjustStockDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.PHARMACIST && user.role !== UserRole.HOSPITAL_ADMIN) {
      throw new ForbiddenException("Only pharmacy staff can perform stock adjustments.");
    }
    if (!user.hospitalId) {
      throw new BadRequestException("Hospital tenant context is required for stock adjustments.");
    }
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException("A valid, mandatory reason (at least 3 characters) is required for inventory adjustment.");
    }

    return this.prisma.$transaction(async (tx) => {
      const med = await tx.medicine.findFirst({
        where: {
          id: dto.medicineId,
          OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
        },
      });
      if (!med) {
        throw new NotFoundException(`Medicine '${dto.medicineId}' not found in formulary.`);
      }

      let previousStock = 0;
      let newStock = 0;

      if (dto.batchId) {
        const batch = await tx.medicineBatch.findUnique({
          where: { id: dto.batchId },
        });
        if (!batch || batch.hospitalId !== user.hospitalId) {
          throw new NotFoundException(`Batch '${dto.batchId}' not found in this hospital.`);
        }
        if (batch.medicineId !== dto.medicineId) {
          throw new BadRequestException(`Batch '${dto.batchId}' does not belong to medicine '${dto.medicineId}'.`);
        }

        previousStock = batch.currentQuantity;
        newStock = previousStock + dto.quantityDelta;
        if (newStock < 0) {
          throw new BadRequestException("Adjustment would cause batch stock to become negative.");
        }

        await tx.medicineBatch.update({
          where: { id: batch.id },
          data: {
            currentQuantity: newStock,
            status: newStock === 0 ? BatchStatus.DEPLETED : BatchStatus.ACTIVE,
          },
        });
      }

      const movement = await tx.stockMovement.create({
        data: {
          hospitalId: user.hospitalId!,
          medicineId: dto.medicineId,
          batchId: dto.batchId,
          type: dto.type,
          quantity: dto.quantityDelta,
          previousStock,
          newStock,
          reason: dto.reason.trim(),
          performedById: user.id,
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "StockMovement",
          entityId: movement.id,
          details: {
            action: "STOCK_ADJUSTMENT",
            medicineId: dto.medicineId,
            batchId: dto.batchId,
            type: dto.type,
            quantityDelta: dto.quantityDelta,
            reason: dto.reason.trim(),
          },
        },
      });

      return movement;
    });
  }

  // 5b. Stock Movements & Dispensing History
  async findAllStockMovements(
    user: AuthenticatedUser,
    filters?: { medicineId?: string; batchId?: string; type?: StockMovementType }
  ) {
    const where: any = {};
    if (user.role !== UserRole.SUPER_ADMIN || user.hospitalId) {
      where.hospitalId = user.hospitalId;
    }
    if (filters?.medicineId) {
      where.medicineId = filters.medicineId;
    }
    if (filters?.batchId) {
      where.batchId = filters.batchId;
    }
    if (filters?.type) {
      where.type = filters.type;
    }

    return this.prisma.stockMovement.findMany({
      where,
      include: {
        medicine: true,
        batch: true,
        performedBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAllDispensingRecords(
    user: AuthenticatedUser,
    filters?: { prescriptionId?: string; medicineId?: string; batchId?: string }
  ) {
    const where: any = {};
    if (user.role !== UserRole.SUPER_ADMIN || user.hospitalId) {
      where.hospitalId = user.hospitalId;
    }
    if (filters?.batchId) {
      where.batchId = filters.batchId;
    }
    if (filters?.prescriptionId) {
      where.prescriptionItem = {
        prescriptionId: filters.prescriptionId,
      };
    }
    if (filters?.medicineId) {
      where.prescriptionItem = {
        ...(where.prescriptionItem || {}),
        medicineId: filters.medicineId,
      };
    }

    return this.prisma.dispensingRecord.findMany({
      where,
      include: {
        prescriptionItem: {
          include: {
            prescription: {
              include: {
                patient: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
                doctor: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
              },
            },
            medicine: true,
          },
        },
        batch: true,
        dispensedBy: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true },
        },
      },
      orderBy: { dispensedAt: "desc" },
    });
  }

  // 6. Expiry & Low Stock Alerts
  async getAlerts(user: AuthenticatedUser) {
    const now = new Date();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const hospitalFilter = user.hospitalId ? { hospitalId: user.hospitalId } : {};

    const [expiringSoonBatches, expiredBatches, lowStockMeds] = await Promise.all([
      this.prisma.medicineBatch.findMany({
        where: {
          ...hospitalFilter,
          status: BatchStatus.ACTIVE,
          expiryDate: { gt: now, lte: thirtyDaysAhead },
        },
        include: { medicine: true },
        orderBy: { expiryDate: "asc" },
      }),
      this.prisma.medicineBatch.findMany({
        where: {
          ...hospitalFilter,
          expiryDate: { lte: now },
        },
        include: { medicine: true },
        orderBy: { expiryDate: "desc" },
      }),
      this.findAllMedicines(user, { lowStockOnly: true }),
    ]);

    return {
      expiringSoon: expiringSoonBatches,
      expired: expiredBatches,
      lowStock: lowStockMeds,
    };
  }
}
