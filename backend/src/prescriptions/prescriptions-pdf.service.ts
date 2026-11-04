import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";

export interface PrescriptionPdfData {
  id: string;
  prescriptionDate: Date;
  status: string;
  notes?: string | null;
  hospital: {
    name: string;
    tagline?: string | null;
    email: string;
    phone: string;
    address?: {
      street: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    } | null;
  };
  patient: {
    mrn: string;
    firstName: string;
    lastName: string;
    gender: string;
    dateOfBirth: Date;
  };
  doctor: {
    licenseNumber: string;
    specialization: string;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  };
  items: Array<{
    dosage: string;
    frequency: string;
    duration: string;
    quantity: number;
    instructions?: string | null;
    medicine: {
      name: string;
      genericName: string;
      form: string;
      strength: string;
    };
  }>;
}

@Injectable()
export class PrescriptionsPdfService {
  async generatePrescriptionPdf(data: PrescriptionPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: "A4", compress: false });
      doc.info.Title = `Prescription ${data.id} - ${data.status}`;
      doc.info.Subject = `Medical Prescription Status: ${data.status}`;
      if (data.status === "CANCELLED") {
        doc.info.Keywords = "CANCELLED VOID DO_NOT_DISPENSE";
      }
      const buffers: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err: Error) => reject(err));

      // Header / Letterhead
      doc.rect(40, 40, 515, 75).fill("#0f172a");
      doc.fillColor("#ffffff").fontSize(20).text(data.hospital.name.toUpperCase(), 55, 52);
      doc.fontSize(9).fillColor("#94a3b8");
      if (data.hospital.tagline) {
        doc.text(data.hospital.tagline, 55, 76);
      }
      const addrStr = data.hospital.address
        ? `${data.hospital.address.street}, ${data.hospital.address.city}, ${data.hospital.address.state} - ${data.hospital.address.postalCode}`
        : "Hospital Healthcare Facility";
      doc.text(`Phone: ${data.hospital.phone} | Email: ${data.hospital.email} | ${addrStr}`, 55, 92);

      // Section Divider
      doc.moveDown(2);
      let y = 130;

      // Cancellation Banner if status is CANCELLED
      if (data.status === "CANCELLED") {
        doc.rect(40, 118, 515, 18).fill("#fee2e2");
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#dc2626");
        doc.text("*** VOID / CANCELLED PRESCRIPTION - DO NOT DISPENSE ***", 115, 123);
        y = 142;
      }

      // Metadata Card
      doc.rect(40, y, 515, 76).fillAndStroke("#f8fafc", "#e2e8f0");
      doc.fillColor("#0f172a").fontSize(10);

      // Left: Patient details
      doc.font("Helvetica-Bold").text("PATIENT DETAILS", 50, y + 10);
      doc.font("Helvetica").fontSize(9);
      doc.text(`Name: ${data.patient.firstName} ${data.patient.lastName}`, 50, y + 26);
      doc.text(`MRN: ${data.patient.mrn} | Gender: ${data.patient.gender}`, 50, y + 39);
      const dobStr = new Date(data.patient.dateOfBirth).toISOString().split("T")[0];
      doc.text(`DOB: ${dobStr}`, 50, y + 52);

      // Right: Doctor & Prescription details
      doc.font("Helvetica-Bold").fontSize(10).text("PRESCRIBING DOCTOR", 320, y + 10);
      doc.font("Helvetica").fontSize(9);
      doc.text(`Dr. ${data.doctor.user.firstName} ${data.doctor.user.lastName}`, 320, y + 26);
      doc.text(`Spec: ${data.doctor.specialization} | Reg: ${data.doctor.licenseNumber}`, 320, y + 39);
      const rxDate = new Date(data.prescriptionDate).toISOString().split("T")[0];
      doc.text(`Rx ID: ${data.id.substring(0, 8).toUpperCase()} | Date: ${rxDate}`, 320, y + 52);

      const statusColor =
        data.status === "CANCELLED"
          ? "#ef4444"
          : data.status === "DISPENSED"
          ? "#10b981"
          : data.status === "PARTIALLY_DISPENSED"
          ? "#f59e0b"
          : "#0284c7";
      doc.font("Helvetica-Bold").fontSize(9).fillColor(statusColor);
      doc.text(`Status: ${data.status.replace("_", " ")}`, 320, y + 64);

      // Rx Symbol
      y += 92;
      doc.font("Helvetica-Bold").fontSize(22).fillColor("#0284c7").text("Rx", 45, y);
      doc.fontSize(9).fillColor("#64748b").font("Helvetica").text("Medications & Dosage Instructions", 85, y + 8);

      // Table Header
      y += 30;
      doc.rect(40, y, 515, 20).fill("#f1f5f9");
      doc.fillColor("#1e293b").font("Helvetica-Bold").fontSize(9);
      doc.text("#", 45, y + 5);
      doc.text("Medicine & Salt", 65, y + 5);
      doc.text("Dosage", 230, y + 5);
      doc.text("Frequency", 310, y + 5);
      doc.text("Duration", 380, y + 5);
      doc.text("Qty", 440, y + 5);
      doc.text("Form", 480, y + 5);

      // Table Rows
      y += 20;
      doc.font("Helvetica").fontSize(8).fillColor("#0f172a");

      data.items.forEach((item, idx) => {
        const rowHeight = item.instructions ? 28 : 20;
        if (idx % 2 === 1) {
          doc.rect(40, y, 515, rowHeight).fill("#fafafa");
          doc.fillColor("#0f172a");
        }

        doc.text(`${idx + 1}`, 45, y + 4);
        doc.font("Helvetica-Bold").text(`${item.medicine.name} (${item.medicine.strength})`, 65, y + 4);
        doc.font("Helvetica").fillColor("#64748b").text(item.medicine.genericName, 65, y + 14);
        doc.fillColor("#0f172a");

        doc.text(item.dosage, 230, y + 4);
        doc.text(item.frequency, 310, y + 4);
        doc.text(item.duration, 380, y + 4);
        doc.text(`${item.quantity}`, 440, y + 4);
        doc.text(item.medicine.form, 480, y + 4);

        if (item.instructions) {
          doc.font("Helvetica-Oblique").fillColor("#0284c7").text(`Instructions: ${item.instructions}`, 230, y + 16);
          doc.font("Helvetica").fillColor("#0f172a");
        }

        y += rowHeight + 4;
      });

      // Notes
      if (data.notes) {
        y += 10;
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#334155").text("Clinical Notes:", 45, y);
        doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(data.notes, 45, y + 12);
        y += 28;
      }

      // Footer & Signature
      const footerY = 700;
      doc.rect(40, footerY - 5, 515, 1).fill("#e2e8f0");
      doc.fontSize(8).fillColor("#94a3b8").text("Generated by MedCore HMS — Verified Digital Electronic Medical Record", 45, footerY + 8);
      doc.text(`Prescription UUID: ${data.id}`, 45, footerY + 18);

      // Doctor signature block
      doc.rect(360, footerY - 45, 180, 40).stroke("#cbd5e1");
      doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(8).text("Digitally Certified by Prescriber", 370, footerY - 38);
      doc.font("Helvetica").fontSize(8).text(`Dr. ${data.doctor.user.firstName} ${data.doctor.user.lastName}`, 370, footerY - 26);
      doc.fontSize(7).fillColor("#64748b").text(`Reg: ${data.doctor.licenseNumber} | Validated`, 370, footerY - 14);

      doc.end();
    });
  }
}
