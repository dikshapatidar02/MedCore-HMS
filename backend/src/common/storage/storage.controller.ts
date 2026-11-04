import {
  Controller,
  Get,
  Put,
  Query,
  Req,
  Res,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { StorageService } from "./storage.service";

@Controller("storage")
export class StorageController {
  private readonly localStorageDir: string;

  constructor(private readonly storageService: StorageService) {
    this.localStorageDir = path.resolve(process.cwd(), "uploads");
  }

  @Get("driver")
  getDriver() {
    return {
      success: true,
      data: {
        driver: this.storageService.getStorageDriver(),
      },
    };
  }

  @Get("download")
  async downloadFile(@Query("key") key: string, @Res() res: Response) {
    if (!key) {
      throw new BadRequestException("Query parameter 'key' is required.");
    }
    const safeKey = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.join(this.localStorageDir, safeKey);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File '${safeKey}' not found on storage.`);
    }

    return res.sendFile(filePath);
  }

  @Put("upload")
  async uploadFile(@Query("key") key: string, @Req() req: Request, @Res() res: Response) {
    if (!key) {
      throw new BadRequestException("Query parameter 'key' is required.");
    }
    const safeKey = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.join(this.localStorageDir, safeKey);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(filePath);
    req.pipe(writeStream);

    writeStream.on("finish", () => {
      res.status(200).json({
        success: true,
        message: "File uploaded successfully.",
        data: { key: safeKey },
      });
    });

    writeStream.on("error", (err) => {
      res.status(500).json({
        success: false,
        error: { code: "UPLOAD_FAILED", message: err.message },
      });
    });
  }
}
