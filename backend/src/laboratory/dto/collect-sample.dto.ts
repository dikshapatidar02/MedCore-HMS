import { IsOptional, IsString, MaxLength } from "class-validator";

export class CollectSampleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: "Sample barcode cannot exceed 100 characters." })
  sampleBarcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "Specimen notes cannot exceed 500 characters." })
  notes?: string;
}
