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
import { CreateLabOrderDto } from "./dto/create-lab-order.dto";
import { CreateLabTestDto } from "./dto/create-lab-test.dto";
import { UpdateLabTestDto } from "./dto/update-lab-test.dto";
import { CollectSampleDto } from "./dto/collect-sample.dto";
import { CancelLabOrderDto } from "./dto/cancel-lab-order.dto";
import { UploadLabResultsDto } from "./dto/create-lab-result.dto";
import { ReviewLabOrderDto } from "./dto/review-lab-result.dto";
import { AuthenticatedUser } from "../common/interfaces/authenticated-user.interface";
import { AuditAction, LabOrderStatus, NotificationType, UserRole } from "@prisma/client";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class LaboratoryService {
  private readonly logger = new Logger(LaboratoryService.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService
  ) {}

  // 1. Diagnostic Test Catalogue
  async createTest(dto: CreateLabTestDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.HOSPITAL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only hospital administrators can add diagnostic tests to the catalogue.");
    }

    const existing = await this.prisma.labTest.findFirst({
      where: {
        code: dto.code,
        OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
      },
    });
    if (existing) {
      throw new BadRequestException(`Diagnostic test code '${dto.code}' already exists.`);
    }

    return this.prisma.labTest.create({
      data: {
        hospitalId: user.hospitalId,
        code: dto.code,
        name: dto.name,
        category: dto.category,
        description: dto.description,
        price: dto.price,
        referenceRange: dto.referenceRange,
        units: dto.units,
        sampleType: dto.sampleType,
        genderRanges: dto.genderRanges ? JSON.parse(JSON.stringify(dto.genderRanges)) : undefined,
        ageRanges: dto.ageRanges ? JSON.parse(JSON.stringify(dto.ageRanges)) : undefined,
      },
    });
  }

  async findAllTests(user: AuthenticatedUser) {
    return this.prisma.labTest.findMany({
      where: {
        OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
        isActive: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async findOneTest(id: string, user: AuthenticatedUser) {
    const test = await this.prisma.labTest.findUnique({
      where: { id },
    });
    if (!test) {
      throw new NotFoundException(`Diagnostic test '${id}' not found.`);
    }
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      test.hospitalId !== null &&
      test.hospitalId !== user.hospitalId
    ) {
      throw new ForbiddenException("Cross-tenant access to laboratory test catalogue is forbidden.");
    }
    return test;
  }

  async updateTest(id: string, dto: UpdateLabTestDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.HOSPITAL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only hospital administrators can modify diagnostic tests.");
    }

    const test = await this.prisma.labTest.findUnique({ where: { id } });
    if (!test) {
      throw new NotFoundException(`Diagnostic test '${id}' not found.`);
    }

    if (user.role !== UserRole.SUPER_ADMIN) {
      if (test.hospitalId === null) {
        throw new ForbiddenException("Cannot modify standard global laboratory tests.");
      }
      if (test.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("Cannot modify laboratory tests belonging to another hospital.");
      }
    }

    return this.prisma.labTest.update({
      where: { id },
      data: {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        price: dto.price,
        referenceRange: dto.referenceRange,
        units: dto.units,
        sampleType: dto.sampleType,
        isActive: dto.isActive,
        genderRanges: dto.genderRanges ? JSON.parse(JSON.stringify(dto.genderRanges)) : undefined,
        ageRanges: dto.ageRanges ? JSON.parse(JSON.stringify(dto.ageRanges)) : undefined,
      },
    });
  }

  // 2. Order Lifecycle: Doctor or Admin creates order
  async createOrder(dto: CreateLabOrderDto, user: AuthenticatedUser) {
    if (
      user.role !== UserRole.DOCTOR &&
      user.role !== UserRole.HOSPITAL_ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only licensed doctors and hospital administrators may author laboratory orders.");
    }

    let targetHospitalId = user.hospitalId;
    if (!targetHospitalId && user.role === UserRole.SUPER_ADMIN) {
      const p = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
      targetHospitalId = p?.hospitalId || null;
    }

    if (!targetHospitalId) {
      throw new BadRequestException("Hospital tenant context is required to author laboratory orders.");
    }

    let doctorId: string;
    if (user.role === UserRole.DOCTOR) {
      const doctor = await this.prisma.doctor.findFirst({
        where: { userId: user.id, hospitalId: targetHospitalId },
      });
      if (!doctor) {
        throw new ForbiddenException("Doctor clinical profile not found for this hospital.");
      }
      doctorId = doctor.id;
    } else {
      if (dto.doctorId) {
        const doc = await this.prisma.doctor.findFirst({
          where: { id: dto.doctorId, hospitalId: targetHospitalId },
        });
        if (!doc) {
          throw new NotFoundException(`Doctor '${dto.doctorId}' not found in this hospital.`);
        }
        doctorId = doc.id;
      } else {
        const doc = await this.prisma.doctor.findFirst({
          where: { hospitalId: targetHospitalId },
        });
        if (!doc) {
          throw new BadRequestException("No active doctor profile found in hospital to associate with lab order.");
        }
        doctorId = doc.id;
      }
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, hospitalId: targetHospitalId, deletedAt: null },
    });
    if (!patient) {
      throw new NotFoundException(`Patient '${dto.patientId}' not found in this hospital.`);
    }

    if (dto.medicalRecordId) {
      const rec = await this.prisma.medicalRecord.findFirst({
        where: { id: dto.medicalRecordId, hospitalId: targetHospitalId, patientId: dto.patientId },
      });
      if (!rec) {
        throw new NotFoundException(`Medical record '${dto.medicalRecordId}' not found.`);
      }
    }

    if (!dto.testIds || dto.testIds.length === 0) {
      throw new BadRequestException("Lab order must include at least one diagnostic test.");
    }

    // Verify all tests exist and are active
    for (const testId of dto.testIds) {
      const test = await this.prisma.labTest.findFirst({
        where: {
          id: testId,
          OR: [{ hospitalId: user.hospitalId }, { hospitalId: null }],
        },
      });
      if (!test) {
        throw new NotFoundException(`Lab test '${testId}' not found.`);
      }
      if (!test.isActive) {
        throw new BadRequestException(`Lab test '${test.name}' is inactive and cannot be ordered.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.labOrder.create({
        data: {
          hospitalId: user.hospitalId!,
          medicalRecordId: dto.medicalRecordId,
          patientId: dto.patientId,
          doctorId,
          priority: dto.priority || "ROUTINE",
          status: LabOrderStatus.ORDERED,
          clinicalNotes: dto.clinicalNotes,
          results: {
            create: dto.testIds.map((testId) => ({
              hospitalId: user.hospitalId!,
              labTestId: testId,
              resultValue: "PENDING",
              isApproved: false,
            })),
          },
        },
        include: {
          results: {
            include: {
              labTest: true,
            },
          },
          patient: true,
          doctor: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true },
              },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.CREATE,
          entityName: "LabOrder",
          entityId: order.id,
          details: { patientId: dto.patientId, testsCount: dto.testIds.length },
        },
      });

      return order;
    });
  }

  // 3. Sample Collection
  async collectSample(orderId: string, user: AuthenticatedUser, dto?: CollectSampleDto) {
    const allowedRoles: UserRole[] = [
      UserRole.RECEPTIONIST,
      UserRole.LAB_TECHNICIAN,
      UserRole.NURSE,
      UserRole.HOSPITAL_ADMIN,
      UserRole.SUPER_ADMIN,
    ];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException("Unauthorized to record sample collection.");
    }

    const order = await this.getOrderOrThrow(orderId, user);

    if (order.status === LabOrderStatus.CANCELLED) {
      throw new BadRequestException("Cannot collect sample for a cancelled lab order.");
    }

    if (
      order.status !== LabOrderStatus.ORDERED &&
      order.status !== LabOrderStatus.PENDING
    ) {
      throw new BadRequestException(
        `Cannot collect sample for lab order in '${order.status}' state. Must be 'ORDERED'.`
      );
    }

    let notesUpdate = order.clinicalNotes;
    if (dto?.sampleBarcode || dto?.notes) {
      const parts: string[] = [];
      if (order.clinicalNotes) parts.push(order.clinicalNotes);
      if (dto.sampleBarcode) parts.push(`[Barcode: ${dto.sampleBarcode}]`);
      if (dto.notes) parts.push(`[Sample Notes: ${dto.notes}]`);
      notesUpdate = parts.join(" | ");
    }

    const updated = await this.prisma.labOrder.update({
      where: { id: orderId },
      data: {
        status: LabOrderStatus.SAMPLE_COLLECTED,
        sampleCollectedAt: new Date(),
        sampleCollectedById: user.id,
        clinicalNotes: notesUpdate,
      },
      include: {
        results: { include: { labTest: true } },
        sampleCollectedBy: { select: { firstName: true, lastName: true } },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        hospitalId: user.hospitalId,
        userId: user.id,
        action: AuditAction.UPDATE,
        entityName: "LabOrder",
        entityId: orderId,
        details: {
          action: "SAMPLE_COLLECTED",
          timestamp: new Date().toISOString(),
          sampleBarcode: dto?.sampleBarcode,
          notes: dto?.notes,
        },
      },
    });

    return updated;
  }

  // 4. Processing Sample
  async processSample(orderId: string, user: AuthenticatedUser) {
    if (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.HOSPITAL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only lab technicians can process diagnostic samples.");
    }

    const order = await this.getOrderOrThrow(orderId, user);

    if (order.status === LabOrderStatus.CANCELLED) {
      throw new BadRequestException("Cannot process a cancelled lab order.");
    }

    if (
      order.status !== LabOrderStatus.SAMPLE_COLLECTED &&
      order.status !== LabOrderStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Cannot transition to PROCESSING from '${order.status}'. Sample must be collected first.`
      );
    }

    return this.prisma.labOrder.update({
      where: { id: orderId },
      data: { status: LabOrderStatus.PROCESSING },
      include: { results: { include: { labTest: true } } },
    });
  }

  // 5. Enter/Upload Results
  async uploadResults(orderId: string, dto: UploadLabResultsDto, user: AuthenticatedUser) {
    if (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.HOSPITAL_ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only lab technicians can enter diagnostic results.");
    }

    const order = await this.getOrderOrThrow(orderId, user);

    if (order.status === LabOrderStatus.CANCELLED) {
      throw new BadRequestException("Cannot enter results for a cancelled lab order.");
    }

    if (order.status === LabOrderStatus.APPROVED || order.status === LabOrderStatus.COMPLETED) {
      throw new BadRequestException(
        "Cannot modify results for an already approved or completed lab order."
      );
    }

    const validStates: LabOrderStatus[] = [
      LabOrderStatus.SAMPLE_COLLECTED,
      LabOrderStatus.PROCESSING,
      LabOrderStatus.IN_PROGRESS,
      LabOrderStatus.RESULT_UPLOADED,
      LabOrderStatus.UNDER_REVIEW,
    ];

    if (!validStates.includes(order.status)) {
      throw new BadRequestException(
        `Cannot upload results for order in '${order.status}' state.`
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const resItem of dto.results) {
        // Validate attachment metadata if present (PRD Section 4: File Security)
        if (resItem.attachmentMetadata) {
          const { filename, mimeType, sizeBytes } = resItem.attachmentMetadata;
          const allowedMimes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
          const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
          const ext = filename ? filename.substring(filename.lastIndexOf(".")).toLowerCase() : "";

          if (
            filename &&
            (filename.includes("..") ||
              filename.includes("/") ||
              filename.includes("\\") ||
              filename.includes("\0") ||
              filename.includes("%00") ||
              !/^[a-zA-Z0-9_\-. ]+$/.test(filename))
          ) {
            throw new BadRequestException("Invalid attachment filename: path traversal sequences rejected.");
          }
          if (mimeType && !allowedMimes.includes(mimeType.toLowerCase())) {
            throw new BadRequestException(`Unsupported attachment MIME type '${mimeType}'. Allowed: PDF, JPEG, PNG, WEBP.`);
          }
          if (filename && !allowedExtensions.includes(ext)) {
            throw new BadRequestException(`Unsupported attachment extension '${ext}'. Allowed: .pdf, .jpg, .jpeg, .png, .webp.`);
          }
          if (sizeBytes && (sizeBytes <= 0 || sizeBytes > 10 * 1024 * 1024)) {
            throw new BadRequestException("Attachment file size must be between 1 byte and 10MB.");
          }
        }

        // Find existing result row or create
        const existing = await tx.labResult.findFirst({
          where: { labOrderId: orderId, labTestId: resItem.labTestId },
        });

        if (existing) {
          await tx.labResult.update({
            where: { id: existing.id },
            data: {
              resultValue: resItem.resultValue,
              referenceRange: resItem.referenceRange,
              unit: resItem.unit,
              status: resItem.status,
              abnormalFlag: resItem.abnormalFlag,
              findings: resItem.findings,
              attachmentMetadata: resItem.attachmentMetadata,
              performedAt: new Date(),
              performedById: user.id,
              isApproved: false,
            },
          });
        } else {
          await tx.labResult.create({
            data: {
              hospitalId: user.hospitalId!,
              labOrderId: orderId,
              labTestId: resItem.labTestId,
              resultValue: resItem.resultValue,
              referenceRange: resItem.referenceRange,
              unit: resItem.unit,
              status: resItem.status,
              abnormalFlag: resItem.abnormalFlag,
              findings: resItem.findings,
              attachmentMetadata: resItem.attachmentMetadata,
              performedAt: new Date(),
              performedById: user.id,
              isApproved: false,
            },
          });
        }
      }

      return tx.labOrder.update({
        where: { id: orderId },
        data: { status: LabOrderStatus.RESULT_UPLOADED },
        include: {
          results: { include: { labTest: true, performedBy: { select: { firstName: true, lastName: true } } } },
        },
      });
    });
  }

  // 6. Review & Approval (with Concurrency CAS & Separation of Duties)
  async reviewOrder(orderId: string, dto: ReviewLabOrderDto, user: AuthenticatedUser) {
    const allowedReviewRoles: UserRole[] = [
      UserRole.DOCTOR,
      UserRole.HOSPITAL_ADMIN,
      UserRole.LAB_TECHNICIAN,
      UserRole.SUPER_ADMIN,
    ];
    if (!allowedReviewRoles.includes(user.role)) {
      throw new ForbiddenException("Only doctors, lab managers, or hospital administrators can approve laboratory reports.");
    }

    const order = await this.getOrderOrThrow(orderId, user);

    if (
      order.status !== LabOrderStatus.RESULT_UPLOADED &&
      order.status !== LabOrderStatus.UNDER_REVIEW &&
      order.status !== LabOrderStatus.PROCESSING
    ) {
      throw new BadRequestException(
        `Cannot review order in '${order.status}' state. Results must be uploaded first.`
      );
    }

    // PRD rule: Lab technician / clinician cannot approve their own reports unless an administrator
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.HOSPITAL_ADMIN) {
      const anySelfPerformed = order.results.some((r) => r.performedById === user.id);
      if (anySelfPerformed) {
        throw new ForbiddenException(
          "Technicians cannot approve their own diagnostic reports. A senior technician, doctor, or administrator review is required."
        );
      }
    }

    const newStatus = dto.approve ? LabOrderStatus.APPROVED : LabOrderStatus.REJECTED;

    const reviewed = await this.prisma.$transaction(async (tx) => {
      // Concurrency CAS: atomically transition only if status is still in an acceptable review state
      const casUpdate = await tx.labOrder.updateMany({
        where: {
          id: orderId,
          status: {
            in: [
              LabOrderStatus.RESULT_UPLOADED,
              LabOrderStatus.UNDER_REVIEW,
              LabOrderStatus.PROCESSING,
            ],
          },
        },
        data: {
          status: newStatus,
          approvedAt: dto.approve ? new Date() : null,
          approvedById: dto.approve ? user.id : null,
          rejectionReason: dto.approve ? null : dto.rejectionReason || dto.notes,
        },
      });

      if (casUpdate.count === 0) {
        throw new BadRequestException(
          "Order cannot be reviewed in its current state or has already been reviewed by another user."
        );
      }

      if (dto.approve) {
        await tx.labResult.updateMany({
          where: { labOrderId: orderId },
          data: {
            isApproved: true,
            approvedAt: new Date(),
            approvedById: user.id,
            reviewNotes: dto.notes,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "LabOrder",
          entityId: orderId,
          details: {
            action: newStatus,
            reviewerId: user.id,
            approved: dto.approve,
            notes: dto.notes,
          },
        },
      });

      return tx.labOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: {
          results: { include: { labTest: true, performedBy: { select: { firstName: true, lastName: true } }, approvedBy: { select: { firstName: true, lastName: true } } } },
          approvedBy: { select: { firstName: true, lastName: true } },
          doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
          patient: true,
        },
      });
    });

    if (dto.approve && reviewed.patient?.userId && this.notificationsService) {
      await this.notificationsService.dispatch({
        userId: reviewed.patient.userId,
        hospitalId: reviewed.hospitalId,
        title: "Laboratory Results Available",
        message: "Your diagnostic laboratory results are now clinically approved and available in your patient portal.",
        type: NotificationType.LAB_RESULT,
        channels: ["IN_APP", "EMAIL"],
        metadata: {
          labOrderId: reviewed.id,
          protectedRoute: "/laboratory",
        },
      }).catch((err) => this.logger.warn(`Failed to dispatch lab result notification: ${err.message}`));
    }

    return reviewed;
  }

  // 7. Order Cancellation Lifecycle
  async cancelOrder(orderId: string, dto: CancelLabOrderDto, user: AuthenticatedUser) {
    const allowedRoles: UserRole[] = [
      UserRole.DOCTOR,
      UserRole.HOSPITAL_ADMIN,
      UserRole.SUPER_ADMIN,
    ];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException("Only ordering doctors or hospital administrators can cancel laboratory orders.");
    }

    const order = await this.getOrderOrThrow(orderId, user);

    if (order.status === LabOrderStatus.CANCELLED) {
      throw new BadRequestException("Laboratory order is already cancelled.");
    }

    if (
      order.status === LabOrderStatus.APPROVED ||
      order.status === LabOrderStatus.COMPLETED
    ) {
      throw new BadRequestException(
        `Cannot cancel lab order in '${order.status}' state. Results have already been clinically approved.`
      );
    }

    if (user.role === UserRole.DOCTOR) {
      if (!user.hospitalId) {
        throw new ForbiddenException("Doctor must be assigned to an active hospital tenant.");
      }
      const doctor = await this.prisma.doctor.findFirst({
        where: { userId: user.id, hospitalId: user.hospitalId },
      });
      if (!doctor) {
        throw new ForbiddenException("Doctor profile not found.");
      }
      if (order.doctorId !== doctor.id && order.hospitalId !== user.hospitalId) {
        throw new ForbiddenException("You can only cancel orders within your hospital.");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.labOrder.update({
        where: { id: orderId },
        data: {
          status: LabOrderStatus.CANCELLED,
          rejectionReason: dto?.reason ? `Cancelled: ${dto.reason}` : "Cancelled by authorized clinician/staff",
        },
        include: {
          results: { include: { labTest: true } },
          patient: true,
          doctor: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          hospitalId: user.hospitalId,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityName: "LabOrder",
          entityId: orderId,
          details: {
            action: "ORDER_CANCELLED",
            reason: dto?.reason || "No reason specified",
            previousStatus: order.status,
          },
        },
      });

      return updated;
    });
  }

  // 7. Find orders
  async findAllOrders(
    filters: { patientId?: string; doctorId?: string; status?: LabOrderStatus },
    user: AuthenticatedUser
  ) {
    const where: any = {};

    if (user.role !== UserRole.SUPER_ADMIN) {
      where.hospitalId = user.hospitalId;
    }

    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient) {
        throw new NotFoundException("Patient profile not linked to user.");
      }
      where.patientId = patient.id;
    } else if (filters.patientId) {
      where.patientId = filters.patientId;
    }

    if (filters.doctorId) {
      where.doctorId = filters.doctorId;
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const orders = await this.prisma.labOrder.findMany({
      where,
      include: {
        results: {
          include: {
            labTest: true,
            performedBy: { select: { firstName: true, lastName: true } },
            approvedBy: { select: { firstName: true, lastName: true } },
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        patient: {
          select: { id: true, mrn: true, firstName: true, lastName: true },
        },
      },
      orderBy: { orderDate: "desc" },
    });

    // PRD: Patients must not see unapproved results!
    if (user.role === UserRole.PATIENT) {
      return orders.map((o) => {
        if (o.status !== LabOrderStatus.APPROVED) {
          return {
            ...o,
            results: [], // Hide unapproved results
          };
        }
        return o;
      });
    }

    return orders;
  }

  // 8. Find single order
  async findOneOrder(orderId: string, user: AuthenticatedUser) {
    const order = await this.getOrderOrThrow(orderId, user);

    if (user.role === UserRole.PATIENT) {
      const patient = await this.prisma.patient.findFirst({
        where: { userId: user.id },
      });
      if (!patient || order.patientId !== patient.id) {
        throw new ForbiddenException("Patients can only access their own laboratory reports.");
      }

      // Hide unapproved results from patient
      if (order.status !== LabOrderStatus.APPROVED) {
        return {
          ...order,
          results: [],
        };
      }
    }

    return order;
  }

  private async getOrderOrThrow(orderId: string, user: AuthenticatedUser) {
    const order = await this.prisma.labOrder.findUnique({
      where: { id: orderId },
      include: {
        results: {
          include: {
            labTest: true,
            performedBy: { select: { firstName: true, lastName: true } },
            approvedBy: { select: { firstName: true, lastName: true } },
          },
        },
        doctor: {
          include: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
        patient: true,
        sampleCollectedBy: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Lab order '${orderId}' not found.`);
    }

    if (user.role !== UserRole.SUPER_ADMIN && order.hospitalId !== user.hospitalId) {
      throw new ForbiddenException("Cross-tenant access to laboratory orders is strictly forbidden.");
    }

    return order;
  }
}
