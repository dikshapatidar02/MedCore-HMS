import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { Queue, Worker } from "bullmq";
import { PharmacyService } from "./pharmacy.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ExpiryMonitorService implements OnModuleInit {
  private readonly logger = new Logger(ExpiryMonitorService.name);
  private expiryQueue: Queue | null = null;
  private expiryWorker: Worker | null = null;

  constructor(
    @Inject(PharmacyService) private readonly pharmacyService: PharmacyService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService) private readonly notificationsService: NotificationsService
  ) {}

  async onModuleInit() {
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);

    try {
      this.expiryQueue = new Queue("pharmacy-expiry-checks", {
        connection: { host: redisHost, port: redisPort },
      });

      this.expiryWorker = new Worker(
        "pharmacy-expiry-checks",
        async (job) => {
          this.logger.log(`Executing expiry check job: ${job.id}`);
          return this.runExpiryCheck();
        },
        { connection: { host: redisHost, port: redisPort } }
      );

      this.expiryWorker.on("completed", (job) => {
        this.logger.log(`Expiry monitoring job ${job.id} completed successfully.`);
      });

      this.expiryWorker.on("failed", (job, err) => {
        this.logger.error(`Expiry monitoring job ${job?.id} failed: ${err.message}`);
      });

      // Schedule periodic or initial run
      await this.expiryQueue.add(
        "check-expiries",
        {},
        { repeat: { pattern: "0 0 * * *" }, jobId: "daily-expiry-check" } as any
      );
      this.logger.log("BullMQ pharmacy expiry check schedule registered.");
    } catch (err: any) {
      this.logger.warn(`BullMQ / Redis initialization deferred or unconfigured: ${err.message}`);
    }
  }

  async runExpiryCheck() {
    this.logger.log("Running automated batch expiry monitoring...");
    const quarantineResult = await this.pharmacyService.quarantineExpiredBatches();
    this.logger.log(
      `Quarantine scan complete. Quarantined batches: ${quarantineResult.quarantinedCount}`
    );

    // Identify batches expiring within 30 days across all hospitals
    const now = new Date();
    const thirtyDaysAhead = new Date();
    thirtyDaysAhead.setDate(thirtyDaysAhead.getDate() + 30);

    const expiringSoon = await this.prisma.medicineBatch.findMany({
      where: {
        status: "ACTIVE",
        expiryDate: { gt: now, lte: thirtyDaysAhead },
      },
      include: { medicine: true, hospital: true },
    });

    this.logger.log(`Batches expiring within 30 days: ${expiringSoon.length}`);

    if (this.notificationsService) {
      for (const batch of expiringSoon) {
        await this.notificationsService
          .notifyExpiringBatch(
            batch.hospitalId,
            batch.id,
            batch.batchNumber,
            batch.medicine.name,
            batch.expiryDate
          )
          .catch((err) =>
            this.logger.warn(`Failed to dispatch batch expiry notification: ${err.message}`)
          );
      }
    }

    return {
      quarantinedCount: quarantineResult.quarantinedCount,
      expiringSoonCount: expiringSoon.length,
      timestamp: new Date().toISOString(),
    };
  }
}
