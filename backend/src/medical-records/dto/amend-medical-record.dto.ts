import { IsString, IsNotEmpty } from "class-validator";

export class AmendMedicalRecordDto {
  @IsString()
  @IsNotEmpty({ message: "Reason for amendment is required by medical audit standards." })
  reason!: string;

  @IsString()
  @IsNotEmpty({ message: "Clinical addendum notes are required." })
  notes!: string;
}
