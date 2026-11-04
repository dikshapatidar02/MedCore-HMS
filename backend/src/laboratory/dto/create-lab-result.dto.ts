import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";
import { LabResultStatus } from "@prisma/client";

export class CreateLabResultItemDto {
  @IsUUID()
  @IsNotEmpty()
  labTestId: string;

  @IsString()
  @IsNotEmpty()
  resultValue: string;

  @IsOptional()
  @IsString()
  referenceRange?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsEnum(LabResultStatus)
  status?: LabResultStatus = LabResultStatus.NORMAL;

  @IsOptional()
  @IsString()
  abnormalFlag?: string; // NORMAL, HIGH, LOW, CRITICAL

  @IsOptional()
  @IsString()
  findings?: string;

  @IsOptional()
  attachmentMetadata?: {
    filename: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    filePath?: string;
  };
}

export class UploadLabResultsDto {
  @IsNotEmpty()
  results: CreateLabResultItemDto[];
}
